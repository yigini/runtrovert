package app.runtrovert.health

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSegment
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Length
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record as ExpoRecord
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Runs to and from Health Connect, Android's on-phone store for fitness data.
 * Everything here is asked for by the runner from Settings: nothing runs in
 * the background, nothing leaves the phone. Only running sessions, their
 * distance, climb and heart rate. Never routes.
 *
 * Records we write carry clientRecordId "runtrovert-run-<id>[-part]" so a run
 * written twice replaces itself and a deleted run can be taken back out.
 */
class RuntrovertHealthModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  private val writes = setOf(
    HealthPermission.getWritePermission(ExerciseSessionRecord::class),
    HealthPermission.getWritePermission(DistanceRecord::class),
    HealthPermission.getWritePermission(ElevationGainedRecord::class),
    HealthPermission.getWritePermission(HeartRateRecord::class),
  )
  private val reads = setOf(
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getReadPermission(DistanceRecord::class),
    HealthPermission.getReadPermission(ElevationGainedRecord::class),
    HealthPermission.getReadPermission(HeartRateRecord::class),
  )

  private fun supported() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P

  /** "ok", "update" (Health Connect needs installing or updating) or "no" (this phone can't have it). */
  private fun status(): String {
    if (!supported()) return "no"
    return when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE -> "ok"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
      else -> "no"
    }
  }

  private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

  private lateinit var askLauncher: AppContextActivityResultLauncher<ArrayList<String>, Set<String>>

  override fun definition() = ModuleDefinition {
    Name("RuntrovertHealth")

    RegisterActivityContracts {
      askLauncher = registerForActivityResult(AskContract())
    }

    Function("status") { status() }

    /** Which of the two sets are granted now: { write, read }. */
    AsyncFunction("granted") Coroutine { ->
      if (status() != "ok") return@Coroutine mapOf("write" to false, "read" to false)
      val got = client().permissionController.getGrantedPermissions()
      mapOf("write" to got.containsAll(writes), "read" to got.containsAll(reads))
    }

    /** Health Connect's own permission screen for writing ("write") or reading ("read"). True when all of it was granted. */
    AsyncFunction("ask") Coroutine { what: String ->
      if (status() != "ok") return@Coroutine false
      val want = if (what == "read") reads else writes
      val already = client().permissionController.getGrantedPermissions()
      if (already.containsAll(want)) return@Coroutine true
      val got = askLauncher.launch(ArrayList(want))
      (got + already).containsAll(want)
    }

    /** The Play Store page for Health Connect, when it needs installing or updating (Android 13 and older). */
    Function("openStore") {
      val uri = Uri.parse("market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding")
      runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage("com.android.vending").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }.isSuccess
    }

    /** Health Connect's own settings, where access can be taken back. */
    Function("openSettings") {
      val action = if (Build.VERSION.SDK_INT >= 34) "android.health.connect.action.MANAGE_HEALTH_PERMISSIONS" else HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS
      runCatching {
        val i = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) i.putExtra(Intent.EXTRA_PACKAGE_NAME, context.packageName)
        context.startActivity(i)
      }.recover {
        context.startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }.isSuccess
    }

    /** Writes (or rewrites) one run. Heart samples as [[epochMs, bpm], ...]. */
    AsyncFunction("writeRun") Coroutine { run: RunOut ->
      val start = Instant.ofEpochMilli(run.startedAt)
      val end = Instant.ofEpochMilli(maxOf(run.endedAt, run.startedAt + 1000))
      val zone = ZoneId.systemDefault().rules
      val so = zone.getOffset(start)
      val eo = zone.getOffset(end)
      val id = "runtrovert-run-${run.id}"
      val v = run.version
      val device = Device(type = Device.TYPE_PHONE)
      val meta = { suffix: String ->
        if (run.manual) Metadata.manualEntry(device = device, clientRecordId = id + suffix, clientRecordVersion = v)
        else Metadata.activelyRecorded(device = device, clientRecordId = id + suffix, clientRecordVersion = v)
      }
      val records = mutableListOf<Record>()
      val pauses = run.pauses.mapNotNull { p ->
        if (p.size < 2 || p[1] <= p[0]) null
        else {
          val a = Instant.ofEpochMilli(p[0].toLong()).coerceIn(start, end)
          val b = Instant.ofEpochMilli(p[1].toLong()).coerceIn(start, end)
          if (b.isAfter(a)) ExerciseSegment(a, b, ExerciseSegment.EXERCISE_SEGMENT_TYPE_PAUSE) else null
        }
      }.sortedBy { it.startTime }.fold(mutableListOf<ExerciseSegment>()) { acc, s ->
        if (acc.isEmpty() || !s.startTime.isBefore(acc.last().endTime)) acc.add(s)
        acc
      }
      records += ExerciseSessionRecord(
        startTime = start, startZoneOffset = so, endTime = end, endZoneOffset = eo,
        metadata = meta(""),
        exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        title = run.title,
        segments = pauses,
      )
      if (run.distanceM > 0) {
        records += DistanceRecord(start, so, end, eo, Length.meters(run.distanceM.coerceAtMost(1_000_000.0)), meta("-distance"))
      }
      if (run.climbM > 0) {
        records += ElevationGainedRecord(start, so, end, eo, Length.meters(run.climbM), meta("-climb"))
      }
      val beats = run.heart
        .filter { it.size >= 2 && it[1] in 1.0..300.0 }
        .map { HeartRateRecord.Sample(Instant.ofEpochMilli(it[0].toLong()).coerceIn(start, end), it[1].toLong()) }
        .sortedBy { it.time }
      // In pieces of up to 1000 readings (one a second is a quarter of an hour), so no single record gets too big.
      beats.chunked(HEART_CHUNK).take(MAX_HEART_PARTS).forEachIndexed { i, part ->
        val a = part.first().time
        val b = part.last().time
        records += HeartRateRecord(a, zone.getOffset(a), b, zone.getOffset(b), part, meta("-heart-$i"))
      }
      client().insertRecords(records)
      true
    }

    /**
     * Takes a run we wrote back out, when it's deleted here. By its time span:
     * Health Connect only ever deletes the calling app's own records that way,
     * so another app's copy of the same run stays.
     */
    AsyncFunction("deleteRun") Coroutine { startedAt: Long, endedAt: Long ->
      if (status() != "ok") return@Coroutine false
      val c = client()
      val span = TimeRangeFilter.between(Instant.ofEpochMilli(startedAt), Instant.ofEpochMilli(maxOf(endedAt, startedAt + 1000)))
      for (type in listOf(ExerciseSessionRecord::class, DistanceRecord::class, ElevationGainedRecord::class, HeartRateRecord::class)) {
        runCatching { c.deleteRecords(type, span) }
      }
      true
    }

    /**
     * Running sessions other apps saved since `sinceMs`, newest first, ours left
     * out. Each with the totals from the same app, moving time without pauses,
     * and heart rate. No routes.
     */
    AsyncFunction("readRuns") Coroutine { sinceMs: Double ->
      val c = client()
      val range = TimeRangeFilter.between(Instant.ofEpochMilli(sinceMs.toLong()), Instant.now())
      val sessions = mutableListOf<ExerciseSessionRecord>()
      var token: String? = null
      do {
        val page = c.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range, ascendingOrder = false, pageSize = 200, pageToken = token))
        sessions += page.records
        token = page.pageToken
      } while (token != null && sessions.size < 2000)
      val mine = context.packageName
      sessions
        .filter { it.metadata.dataOrigin.packageName != mine }
        .filter { it.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING || it.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL }
        .map { s ->
          val origin = setOf(DataOrigin(s.metadata.dataOrigin.packageName))
          val span = TimeRangeFilter.between(s.startTime, s.endTime)
          val totals = runCatching {
            c.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL, ElevationGainedRecord.ELEVATION_GAINED_TOTAL), span, origin))
          }.getOrNull()
          val heart = runCatching {
            c.readRecords(ReadRecordsRequest(HeartRateRecord::class, span, origin, pageSize = 50)).records
              .flatMap { r -> r.samples }
              .filter { !it.time.isBefore(s.startTime) && !it.time.isAfter(s.endTime) }
              .sortedBy { it.time }
              .map { listOf(it.time.toEpochMilli().toDouble(), it.beatsPerMinute.toDouble()) }
          }.getOrDefault(emptyList())
          val paused = s.segments
            .filter { it.segmentType == ExerciseSegment.EXERCISE_SEGMENT_TYPE_PAUSE || it.segmentType == ExerciseSegment.EXERCISE_SEGMENT_TYPE_REST }
            .sumOf { it.endTime.toEpochMilli() - it.startTime.toEpochMilli() }
          mapOf(
            "id" to s.metadata.id,
            "app" to s.metadata.dataOrigin.packageName,
            "title" to s.title,
            "treadmill" to (s.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL),
            "startedAt" to s.startTime.toEpochMilli().toDouble(),
            "endedAt" to s.endTime.toEpochMilli().toDouble(),
            "movingS" to ((s.endTime.toEpochMilli() - s.startTime.toEpochMilli() - paused).coerceAtLeast(0) / 1000.0),
            "distanceM" to totals?.get(DistanceRecord.DISTANCE_TOTAL)?.inMeters,
            "climbM" to totals?.get(ElevationGainedRecord.ELEVATION_GAINED_TOTAL)?.inMeters,
            "heart" to heart,
          )
        }
    }
  }
}

class RunOut : ExpoRecord {
  @Field var id: Int = 0
  @Field var version: Long = 1
  @Field var startedAt: Long = 0
  @Field var endedAt: Long = 0
  @Field var distanceM: Double = 0.0
  @Field var climbM: Double = 0.0
  @Field var title: String? = null
  @Field var manual: Boolean = false
  @Field var heart: List<List<Double>> = emptyList()
  @Field var pauses: List<List<Double>> = emptyList()
}

/** Health Connect's permission screen, shaped the way Expo modules launch activities. */
private class AskContract : AppContextActivityResultContract<ArrayList<String>, Set<String>> {
  private val inner = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: ArrayList<String>): Intent = inner.createIntent(context, input.toSet())

  override fun parseResult(input: ArrayList<String>, resultCode: Int, intent: Intent?): Set<String> = inner.parseResult(resultCode, intent)
}

private const val HEART_CHUNK = 1000
private const val MAX_HEART_PARTS = 40 // 11 hours at one a second

private fun Instant.coerceIn(a: Instant, b: Instant): Instant = if (isBefore(a)) a else if (isAfter(b)) b else this
