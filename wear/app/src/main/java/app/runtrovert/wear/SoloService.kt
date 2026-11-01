package app.runtrovert.wear

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.LocationData
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import kotlinx.coroutines.delay
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import java.time.Instant
import kotlin.math.roundToInt

/**
 * Records a run on the watch alone: a Health Services running exercise with
 * GPS on (location, distance, climb and heart rate, batched by the watch's
 * sensor hub). The phone isn't involved until the run is over; then SoloSync
 * hands it over the next time they're together.
 */
class SoloService : LifecycleService() {
  private var ongoing: OngoingActivity? = null
  private lateinit var notification: NotificationCompat.Builder
  private var exerciseOn = false

  private val bootInstant: Instant
    get() = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())

  private val callback = object : ExerciseUpdateCallback {
    override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
      val boot = bootInstant
      val m = update.latestMetrics
      for (p in m.getData(DataType.LOCATION)) {
        val v: LocationData = p.value
        val alt = v.altitude.takeIf { it.isFinite() } // "unavailable" is NaN
        SoloRun.addPoint(p.getTimeInstant(boot).toEpochMilli(), v.latitude, v.longitude, alt)
      }
      for (p in m.getData(DataType.HEART_RATE_BPM)) {
        val bpm = p.value.roundToInt()
        SoloRun.addHeart(p.getTimeInstant(boot).toEpochMilli(), bpm)
        if (bpm in 25..250) PhoneLink.onHeart(bpm)
      }
      m.getData(DataType.DISTANCE_TOTAL)?.let { d ->
        val passed = SoloRun.setDistance(d.total)
        if (passed > 0) WatchNotes.buzz(this@SoloService)
      }
      m.getData(DataType.ELEVATION_GAIN_TOTAL)?.let { SoloRun.setClimb(it.total) }
    }
    override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
    override fun onRegistered() {}
    override fun onRegistrationFailed(throwable: Throwable) {}
    override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    return START_NOT_STICKY // never brought back by itself without a run to record
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    if (!SoloRun.active) {
      stopSelf()
      return
    }
    WatchNotes.ensureChannel(this)
    notification = NotificationCompat.Builder(this, WatchNotes.CHANNEL)
      .setSmallIcon(R.drawable.ic_mark)
      .setContentTitle(getString(R.string.runInProgress))
      .setContentIntent(WatchNotes.openApp(this))
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_WORKOUT)
    ongoing = OngoingActivity.Builder(this, NOTE_ID, notification)
      .setStaticIcon(R.drawable.ic_mark)
      .setTouchIntent(WatchNotes.openApp(this))
      .setStatus(statusFor(SoloRun.state.value))
      .build()
      .also { it.apply(this) }
    try {
      startForeground(NOTE_ID, notification.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } catch (_: Exception) {
      fail()
      return
    }
    lifecycleScope.launch { startExercise() }
    lifecycleScope.launch {
      while (true) {
        delay(1_000)
        SoloRun.tick(this@SoloService)
      }
    }
  }

  private suspend fun startExercise() {
    val exercise = HealthServices.getClient(this).exerciseClient
    try {
      val caps = exercise.getCapabilitiesAsync().await().typeToCapabilities[ExerciseType.RUNNING]
      val info = exercise.getCurrentExerciseInfoAsync().await()
      if (caps == null || DataType.LOCATION !in caps.supportedDataTypes || info.exerciseTrackedStatus == ExerciseTrackedStatus.OTHER_APP_IN_PROGRESS) {
        fail()
        return
      }
      val wanted = setOf(DataType.LOCATION, DataType.DISTANCE_TOTAL, DataType.HEART_RATE_BPM, DataType.ELEVATION_GAIN_TOTAL)
        .filter { it in caps.supportedDataTypes }
        .toSet()
      exercise.setUpdateCallback(callback)
      exercise.startExerciseAsync(
        ExerciseConfig.builder(ExerciseType.RUNNING)
          .setDataTypes(wanted)
          .setIsAutoPauseAndResumeEnabled(false)
          .setIsGpsEnabled(true)
          .build(),
      ).await()
      exerciseOn = true
    } catch (_: Exception) {
      fail()
    }
  }

  private fun fail() {
    SoloRun.failed.value = true
    SoloRun.finish(this)
    stopSelf()
  }

  private fun command(cmd: String) {
    val exercise = HealthServices.getClient(this).exerciseClient
    when (cmd) {
      "pause" -> {
        SoloRun.pause(this)
        if (exerciseOn) lifecycleScope.launch { runCatching { exercise.pauseExerciseAsync().await() } }
      }
      "resume" -> {
        SoloRun.resume(this)
        if (exerciseOn) lifecycleScope.launch { runCatching { exercise.resumeExerciseAsync().await() } }
      }
      "stop" -> {
        SoloRun.finish(this)
        stopSelf()
        SoloSync.syncAsync(applicationContext)
        return
      }
    }
    ongoing?.update(this, statusFor(SoloRun.state.value))
  }

  private fun statusFor(s: SoloRun.State?): Status {
    val word = getString(if (s?.status == "paused") R.string.paused else R.string.recording)
    val b = Status.Builder()
    return if (s != null && s.status == "running") {
      val zero = s.at - (s.movingS * 1000).toLong()
      b.addTemplate("#time# · $word").addPart("time", Status.StopwatchPart(zero)).build()
    } else {
      b.addTemplate(word).build()
    }
  }

  override fun onDestroy() {
    instance = null
    if (exerciseOn) {
      val exercise = HealthServices.getClient(this).exerciseClient
      runCatching { exercise.endExerciseAsync() }
      runCatching { exercise.clearUpdateCallbackAsync(callback) }
    }
    // Killed without a Stop: keep what was recorded.
    if (SoloRun.active) SoloRun.finish(this)
    PhoneLink.onHeart(null)
    super.onDestroy()
  }

  companion object {
    private const val NOTE_ID = 4
    private var instance: SoloService? = null

    fun permissions(): Array<String> = arrayOf(
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION,
      Manifest.permission.ACTIVITY_RECOGNITION,
      RunService.heartPermission(),
      Manifest.permission.POST_NOTIFICATIONS,
    )

    fun hasLocation(ctx: Context) = ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** From the app on screen, with location allowed. */
    fun start(ctx: Context, unitsKm: Boolean) {
      SoloRun.begin(ctx, unitsKm)
      runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, SoloService::class.java)) }
        .onFailure {
          SoloRun.failed.value = true
          SoloRun.finish(ctx)
        }
    }

    /** Pause, resume or stop from the screen. */
    fun send(cmd: String) {
      instance?.command(cmd)
    }
  }
}
