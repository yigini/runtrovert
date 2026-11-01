package app.runtrovert.wear

import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.random.Random

/**
 * A run recorded on the watch alone (phase 3): the watch's own GPS through
 * Health Services, kept in the watch's private storage, sent to the phone the
 * next time they're together (SoloSync), then deleted here. Nothing goes
 * anywhere else. The run in progress is written to disk every half minute, so
 * a crash or a flat battery keeps all but the last few seconds.
 */
object SoloRun {
  /** What the screen shows. at = SystemClock.elapsedRealtime() of movingS, so the clock ticks on by itself. */
  data class State(val status: String, val distanceM: Double, val movingS: Double, val at: Long, val unitsKm: Boolean) {
    fun asLive() = Live(status, distanceM, movingS, unitsKm, at)
  }

  private val _state = MutableStateFlow<State?>(null)
  val state: StateFlow<State?> = _state

  /** Finished here and not yet on the phone. */
  private val _waiting = MutableStateFlow(0)
  val waiting: StateFlow<Int> = _waiting

  /** Set when a run was just saved on the watch, until the screen is tapped. */
  val justSaved = MutableStateFlow(false)
  /** Set when the watch could not start its GPS. */
  val failed = MutableStateFlow(false)

  private var id = ""
  private var startedAt = 0L
  private var unitsKm = true
  private var movingMs = 0L // moving time up to the last pause
  private var resumedAt = 0L // elapsedRealtime when the current stretch began; 0 while paused
  private var pausedAtWall = 0L
  private var distanceM = 0.0
  private var climbM: Double? = null
  private val points = ArrayList<DoubleArray>() // ts, lat, lon, alt (NaN when none)
  private val heart = ArrayList<LongArray>() // ts, bpm
  private val pauses = ArrayList<LongArray>() // from, to (wall clock)
  private var lastPointAt = 0L
  private var lastHeartAt = 0L
  private var lastSavedAt = 0L

  val active get() = _state.value != null

  fun begin(ctx: Context, km: Boolean) {
    id = "${System.currentTimeMillis()}-${Random.nextInt(1000, 9999)}"
    startedAt = System.currentTimeMillis()
    unitsKm = km
    movingMs = 0
    resumedAt = SystemClock.elapsedRealtime()
    pausedAtWall = 0
    distanceM = 0.0
    climbM = null
    synchronized(this) {
      points.clear()
      heart.clear()
      pauses.clear()
    }
    lastPointAt = 0
    lastHeartAt = 0
    failed.value = false
    justSaved.value = false
    publish("running")
    save(ctx)
  }

  private fun movingNowMs(): Long = movingMs + if (resumedAt != 0L) SystemClock.elapsedRealtime() - resumedAt else 0L

  private fun publish(status: String) {
    _state.value = State(status, distanceM, movingNowMs() / 1000.0, SystemClock.elapsedRealtime(), unitsKm)
  }

  fun pause(ctx: Context) {
    if (resumedAt == 0L) return
    movingMs = movingNowMs()
    resumedAt = 0L
    pausedAtWall = System.currentTimeMillis()
    publish("paused")
    save(ctx)
  }

  fun resume(ctx: Context) {
    if (resumedAt != 0L) return
    resumedAt = SystemClock.elapsedRealtime()
    if (pausedAtWall != 0L) synchronized(this) { pauses.add(longArrayOf(pausedAtWall, System.currentTimeMillis())) }
    pausedAtWall = 0L
    publish("running")
    save(ctx)
  }

  fun addPoint(ts: Long, lat: Double, lon: Double, alt: Double?) {
    if (resumedAt == 0L || ts - lastPointAt < 900) return // paused, or more than one a second
    lastPointAt = ts
    synchronized(this) { points.add(doubleArrayOf(ts.toDouble(), lat, lon, alt ?: Double.NaN)) }
  }

  fun addHeart(ts: Long, bpm: Int) {
    if (resumedAt == 0L || ts - lastHeartAt < 1_000 || bpm !in 25..250) return
    lastHeartAt = ts
    synchronized(this) { heart.add(longArrayOf(ts, bpm.toLong())) }
  }

  /** Health Services' own distance total (GPS and steps together). Returns the km or mile just passed, or 0. */
  fun setDistance(total: Double): Int {
    if (total < distanceM) return 0
    val unit = if (unitsKm) 1000.0 else 1609.344
    val before = (distanceM / unit).toInt()
    distanceM = total
    publish(_state.value?.status ?: "running")
    val after = (distanceM / unit).toInt()
    return if (after > before) after else 0
  }

  fun setClimb(total: Double) {
    climbM = total
  }

  /** Every half minute from the service, and on pause: what's recorded so far, to disk. */
  fun tick(ctx: Context) {
    publish(_state.value?.status ?: return)
    if (SystemClock.elapsedRealtime() - lastSavedAt > 30_000) save(ctx)
  }

  /** Stop: the run goes into the waiting list, or away if it's too short to keep. */
  fun finish(ctx: Context) {
    if (!active) return
    if (resumedAt == 0L && pausedAtWall != 0L) synchronized(this) { pauses.add(longArrayOf(pausedAtWall, System.currentTimeMillis())) }
    movingMs = movingNowMs()
    resumedAt = 0L
    val keep = movingMs >= 60_000 && (distanceM >= 200 || points.size >= 20)
    if (keep) {
      SoloStore.dir(ctx).resolve("run-$id.json").writeText(json())
      justSaved.value = true
    }
    SoloStore.current(ctx).delete()
    _state.value = null
    refreshWaiting(ctx)
  }

  fun refreshWaiting(ctx: Context) {
    _waiting.value = SoloStore.pending(ctx).size
  }

  private fun save(ctx: Context) {
    lastSavedAt = SystemClock.elapsedRealtime()
    runCatching { SoloStore.current(ctx).writeText(json()) }
  }

  /** The contract with the phone (src/wearProtocol.ts, watchRunToImported). */
  private fun json(): String = synchronized(this) {
    val o = JSONObject()
      .put("v", 1)
      .put("id", id)
      .put("startedAt", startedAt)
      .put("endedAt", System.currentTimeMillis())
      .put("movingS", movingNowMs() / 1000.0)
      .put("distanceM", distanceM)
      .put("climbM", climbM ?: JSONObject.NULL)
      .put("pauses", JSONArray().apply { pauses.forEach { put(JSONArray().put(it[0]).put(it[1])) } })
      .put("p", JSONArray().apply {
        points.forEach {
          put(JSONArray().put(it[0].toLong()).put(round6(it[1])).put(round6(it[2])).put(if (it[3].isNaN()) JSONObject.NULL else Math.round(it[3] * 10) / 10.0))
        }
      })
      .put("hr", JSONArray().apply { heart.forEach { put(JSONArray().put(it[0]).put(it[1])) } })
    o.toString()
  }

  private fun round6(v: Double) = Math.round(v * 1e6) / 1e6

  /** After a crash or a flat battery: the run that was going becomes a finished one. */
  fun recover(ctx: Context) {
    if (active) return
    val cur = SoloStore.current(ctx)
    if (!cur.exists()) return
    runCatching {
      val o = JSONObject(cur.readText())
      if (o.optDouble("movingS", 0.0) >= 60) SoloStore.dir(ctx).resolve("run-${o.getString("id")}.json").writeText(o.toString())
    }
    cur.delete()
    refreshWaiting(ctx)
  }
}

/** The watch's private folder for runs recorded here. */
object SoloStore {
  fun dir(ctx: Context): File = File(ctx.filesDir, "solo").apply { mkdirs() }
  fun current(ctx: Context): File = File(dir(ctx), "current.json")
  fun pending(ctx: Context): List<File> = dir(ctx).listFiles { f -> f.name.startsWith("run-") && f.name.endsWith(".json") }?.sortedBy { it.name } ?: emptyList()
  fun idOf(f: File): String = f.name.removePrefix("run-").removeSuffix(".json")
}
