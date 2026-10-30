package app.runtrovert.wear

import org.json.JSONArray
import org.json.JSONObject

/**
 * The small JSON the phone and watch send each other (docs/WATCHES.md has the
 * whole contract; src/wearProtocol.ts is the phone's side of it).
 *
 * Phone -> watch: /runtrovert/live  { status, distanceM, durationS, unitsKm, needsOpen? }
 *                 /runtrovert/split { index, durationS, distanceM, totalS, unitsKm }
 * Watch -> phone: /runtrovert/cmd   { cmd: start | pause | resume | stop }
 *                 /runtrovert/hello { open }
 *                 /runtrovert/hr    { s: [[epochMs, bpm], ...] }
 */
object Paths {
  const val LIVE = "/runtrovert/live"
  const val SPLIT = "/runtrovert/split"
  const val CMD = "/runtrovert/cmd"
  const val HELLO = "/runtrovert/hello"
  const val HR = "/runtrovert/hr"
}

/** The phone app advertises this; the watch app advertises "runtrovert_watch". */
const val PHONE_CAPABILITY = "runtrovert_phone"

/** idle, running, paused, autopaused, or halted (stopped, waiting on the finish screen). */
data class Live(
  val status: String,
  val distanceM: Double,
  val durationS: Double,
  val unitsKm: Boolean,
  /** When this arrived, SystemClock.elapsedRealtime(): the clock ticks on from here. */
  val at: Long,
  /** The phone app is in the background and can't start recording until it's on screen. */
  val needsOpen: Boolean = false,
) {
  val active get() = status == "running" || status == "paused" || status == "autopaused"
  fun durationNow(now: Long): Double = if (status == "running") durationS + (now - at) / 1000.0 else durationS

  companion object {
    fun parse(json: String, at: Long): Live? = runCatching {
      val o = JSONObject(json)
      Live(o.getString("status"), o.optDouble("distanceM", 0.0), o.optDouble("durationS", 0.0), o.optBoolean("unitsKm", true), at, o.optBoolean("needsOpen", false))
    }.getOrNull()
  }
}

data class Split(val index: Int, val durationS: Double, val distanceM: Double, val totalS: Double, val unitsKm: Boolean) {
  companion object {
    fun parse(json: String): Split? = runCatching {
      val o = JSONObject(json)
      Split(o.getInt("index"), o.getDouble("durationS"), o.getDouble("distanceM"), o.getDouble("totalS"), o.optBoolean("unitsKm", true))
    }.getOrNull()
  }
}

fun cmdJson(cmd: String): String = JSONObject().put("cmd", cmd).toString()
fun helloJson(open: Boolean): String = JSONObject().put("open", open).toString()
fun hrJson(samples: List<Pair<Long, Int>>): String =
  JSONObject().put("s", JSONArray().apply { samples.forEach { put(JSONArray().put(it.first).put(it.second)) } }).toString()
