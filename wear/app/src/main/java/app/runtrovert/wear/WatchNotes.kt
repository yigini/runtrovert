package app.runtrovert.wear

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** The km buzz, and the few notes the watch shows when its app isn't open. */
object WatchNotes {
  const val CHANNEL = "runtrovert-watch"
  private const val SPLIT_ID = 2
  private const val FOLLOW_ID = 3

  fun ensureChannel(ctx: Context) {
    val nm = ctx.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL, ctx.getString(R.string.channelName), NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = ctx.getString(R.string.channelHint)
        setSound(null, null)
        enableVibration(false) // the buzz is ours, so it's the same one every time
        setShowBadge(false)
      },
    )
  }

  /** Two short taps, as on the phone. */
  fun buzz(ctx: Context, long: Boolean = false) {
    val vib = ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator ?: ctx.getSystemService(Vibrator::class.java)
    val effect = if (long) VibrationEffect.createOneShot(260, VibrationEffect.DEFAULT_AMPLITUDE)
    else VibrationEffect.createWaveform(longArrayOf(0, 120, 90, 120), -1)
    runCatching { vib?.vibrate(effect) }
  }

  fun onSplit(ctx: Context, s: Split) {
    buzz(ctx)
    if (PhoneLink.appVisible) return
    val unit = ctx.getString(if (s.unitsKm) R.string.km else R.string.mi)
    val title = "${ctx.getString(if (s.unitsKm) R.string.kmN else R.string.mileN, s.index.toString())} · ${Format.pace(if (s.unitsKm) 1000.0 else 1609.344, s.durationS, s.unitsKm)} /$unit"
    val body = "${Format.distance(s.distanceM, s.unitsKm)} $unit · ${Format.duration(s.totalS)}"
    post(ctx, SPLIT_ID, title, body, timeoutMs = 20_000)
  }

  fun onStatus(ctx: Context, before: Live?, next: Live) {
    val started = next.active && (before == null || !before.active)
    if (started && !PhoneLink.appVisible && !RunService.running) {
      post(ctx, FOLLOW_ID, ctx.getString(R.string.runInProgress), ctx.getString(R.string.tapToFollow), timeoutMs = 0)
    }
    if (!next.active || PhoneLink.appVisible || RunService.running) cancel(ctx, FOLLOW_ID)
    if (!next.active) cancel(ctx, SPLIT_ID)
  }

  fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(
    ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  private fun post(ctx: Context, id: Int, title: String, body: String, timeoutMs: Long) {
    if (ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    ensureChannel(ctx)
    val n = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(R.drawable.ic_mark)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(openApp(ctx))
      .setAutoCancel(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_WORKOUT)
      .apply { if (timeoutMs > 0) setTimeoutAfter(timeoutMs) }
      .build()
    runCatching { NotificationManagerCompat.from(ctx).notify(id, n) }
  }

  fun cancel(ctx: Context, id: Int) {
    NotificationManagerCompat.from(ctx).cancel(id)
  }
}
