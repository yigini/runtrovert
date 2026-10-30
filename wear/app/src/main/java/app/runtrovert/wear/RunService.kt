package app.runtrovert.wear

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.SampleDataPoint
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
 * Runs while the phone records and this watch has heart-rate permission: reads
 * the heart rate through Health Services (batched in the sensor hub, so the
 * watch stays cool), sends it to the phone every few seconds, and keeps the
 * run on the watch face as an ongoing activity. No GPS: the phone does that.
 */
class RunService : LifecycleService() {
  private val buffer = ArrayList<Pair<Long, Int>>()
  private var usingExercise = false
  private var measuring = false
  private var lastSampleAt = 0L
  private var exerciseStatus = ""
  private var ongoing: OngoingActivity? = null
  private lateinit var notification: NotificationCompat.Builder

  private val bootInstant: Instant
    get() = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())

  private val exerciseCallback = object : ExerciseUpdateCallback {
    override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
      onSamples(update.latestMetrics.getData(DataType.HEART_RATE_BPM))
    }
    override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
    override fun onRegistered() {}
    override fun onRegistrationFailed(throwable: Throwable) {}
    override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
  }

  private val measureCallback = object : MeasureCallback {
    override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {}
    override fun onDataReceived(data: DataPointContainer) {
      onSamples(data.getData(DataType.HEART_RATE_BPM))
    }
  }

  override fun onCreate() {
    super.onCreate()
    running = true
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
      .setStatus(statusFor(PhoneLink.live.value))
      .build()
      .also { it.apply(this) }
    val type = if (Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH else 0
    try {
      startForeground(NOTE_ID, notification.build(), type)
    } catch (_: Exception) {
      stopSelf()
      return
    }
    lifecycleScope.launch { startHeart() }
    lifecycleScope.launch {
      // Every few seconds, whatever the sensor gave, to the phone. Kept if the phone is out of reach.
      while (true) {
        delay(5_000)
        flush()
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    return START_NOT_STICKY
  }

  private suspend fun startHeart() {
    val hs = HealthServices.getClient(this)
    val exercise = hs.exerciseClient
    try {
      val caps = exercise.getCapabilitiesAsync().await()
      val running = caps.typeToCapabilities[ExerciseType.RUNNING]
      val info = exercise.getCurrentExerciseInfoAsync().await()
      // Another app (the watch's own workout, say) owns an exercise: don't take it over.
      val othersOwn = info.exerciseTrackedStatus == androidx.health.services.client.data.ExerciseTrackedStatus.OTHER_APP_IN_PROGRESS
      if (running != null && DataType.HEART_RATE_BPM in running.supportedDataTypes && !othersOwn) {
        exercise.setUpdateCallback(exerciseCallback)
        exercise.startExerciseAsync(
          ExerciseConfig.builder(ExerciseType.RUNNING)
            .setDataTypes(setOf(DataType.HEART_RATE_BPM))
            .setIsAutoPauseAndResumeEnabled(false)
            .setIsGpsEnabled(false)
            .build(),
        ).await()
        usingExercise = true
        exerciseStatus = "running"
        PhoneLink.live.value?.let { syncExercise(it) }
        return
      }
    } catch (_: Exception) {
      // fall through to the plain heart-rate reading
    }
    try {
      hs.measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, measureCallback)
      measuring = true
    } catch (_: Exception) {
    }
  }

  private fun onSamples(points: List<SampleDataPoint<Double>>) {
    val boot = bootInstant
    for (p in points) {
      val bpm = p.value.roundToInt()
      if (bpm !in 25..250) continue
      val at = p.getTimeInstant(boot).toEpochMilli()
      if (at - lastSampleAt < 1_000) continue // one a second is plenty
      lastSampleAt = at
      synchronized(buffer) {
        buffer.add(at to bpm)
        if (buffer.size > MAX_BUFFER) buffer.subList(0, buffer.size - MAX_BUFFER).clear()
      }
      PhoneLink.onHeart(bpm)
    }
  }

  private suspend fun flush() {
    val batch = synchronized(buffer) { if (buffer.isEmpty()) return else buffer.toList() }
    // Paused: the phone isn't recording, so neither is the heart line.
    if (PhoneLink.live.value?.status == "paused") {
      synchronized(buffer) { buffer.clear() }
      return
    }
    if (PhoneLink.send(this, Paths.HR, hrJson(batch))) synchronized(buffer) { buffer.removeAll(batch.toSet()) }
  }

  private suspend fun syncExercise(live: Live) {
    if (!usingExercise) return
    val exercise = HealthServices.getClient(this).exerciseClient
    runCatching {
      if (live.status == "paused" && exerciseStatus == "running") {
        exercise.pauseExerciseAsync().await()
        exerciseStatus = "paused"
      } else if (live.status != "paused" && exerciseStatus == "paused") {
        exercise.resumeExerciseAsync().await()
        exerciseStatus = "running"
      }
    }
  }

  private fun update(live: Live) {
    if (!live.active) {
      lifecycleScope.launch {
        flush()
        stopSelf()
      }
      return
    }
    ongoing?.update(this, statusFor(live))
    lifecycleScope.launch { syncExercise(live) }
  }

  private fun statusFor(live: Live?): Status {
    val word = getString(
      when (live?.status) {
        "paused" -> R.string.paused
        "autopaused" -> R.string.autoPaused
        else -> R.string.recording
      },
    )
    val b = Status.Builder()
    return if (live != null && live.status == "running") {
      // Ticks on the watch face by itself, from the phone's clock.
      val zero = live.at - (live.durationS * 1000).toLong()
      b.addTemplate("#time# · $word").addPart("time", Status.StopwatchPart(zero)).build()
    } else {
      b.addTemplate(word).build()
    }
  }

  override fun onDestroy() {
    running = false
    instance = null
    val hs = HealthServices.getClient(this)
    if (usingExercise) {
      runCatching { hs.exerciseClient.endExerciseAsync() }
      runCatching { hs.exerciseClient.clearUpdateCallbackAsync(exerciseCallback) }
    }
    if (measuring) runCatching { hs.measureClient.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, measureCallback) }
    PhoneLink.onHeart(null)
    super.onDestroy()
  }

  companion object {
    private const val NOTE_ID = 1
    private const val MAX_BUFFER = 4 * 3600 // four hours at one a second, if the phone is away that long
    @Volatile var running = false
    private var instance: RunService? = null

    fun heartPermission(): String =
      if (Build.VERSION.SDK_INT >= 36) "android.permission.health.READ_HEART_RATE" else Manifest.permission.BODY_SENSORS

    fun hasHeartPermission(ctx: Context) = ctx.checkSelfPermission(heartPermission()) == PackageManager.PERMISSION_GRANTED

    /** From the app on screen only: Android lets a foreground app start this, not a background one. */
    fun startIfNeeded(ctx: Context) {
      val live = PhoneLink.live.value ?: return
      if (running || !live.active || !hasHeartPermission(ctx)) return
      runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, RunService::class.java)) }
    }

    fun onStatus(ctx: Context, live: Live) {
      instance?.update(live)
    }
  }

  init {
    instance = this
  }
}
