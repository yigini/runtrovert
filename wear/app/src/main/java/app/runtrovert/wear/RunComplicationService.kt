package app.runtrovert.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.os.SystemClock
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.CountUpTimeReference
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.MonochromaticImageComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * A complication for any watch face: the Runtrovert mark and "Run". A tap
 * starts a run (through the app, with the phone's countdown). Mid-run it shows
 * the run's time, ticking on the watch face by itself, or "Paused". Like the
 * tile, it is only refreshed when the run's state changes, never on a timer.
 */
class RunComplicationService : SuspendingComplicationDataSourceService() {
  override fun getPreviewData(type: ComplicationType): ComplicationData? = data(type, null)

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? =
    data(request.complicationType, PhoneLink.live.value)

  private fun data(type: ComplicationType, live: Live?): ComplicationData? {
    val active = live?.active == true
    val icon = MonochromaticImage.Builder(Icon.createWithResource(this, R.drawable.ic_mark)).build()
    val about = plain(getString(if (active) R.string.runInProgress else R.string.complicationHint))
    val tap = PendingIntent.getActivity(
      this,
      if (active) 1 else 0,
      MainActivity.openIntent(this, start = !active),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return when (type) {
      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(text(live), about)
        .setMonochromaticImage(icon)
        .setTapAction(tap)
        .build()
      ComplicationType.MONOCHROMATIC_IMAGE -> MonochromaticImageComplicationData.Builder(icon, about)
        .setTapAction(tap)
        .build()
      else -> null
    }
  }

  private fun text(live: Live?): ComplicationText = when (live?.status) {
    null -> plain(getString(R.string.complicationRun))
    "running" -> {
      // Ticks on the watch face by itself, by the minute ("12m", "1h 5m"): counted up from when the run would have started.
      val startedAt = System.currentTimeMillis() - (live!!.durationNow(SystemClock.elapsedRealtime()) * 1000).toLong()
      TimeDifferenceComplicationText.Builder(TimeDifferenceStyle.SHORT_DUAL_UNIT, CountUpTimeReference(Instant.ofEpochMilli(startedAt)))
        .setMinimumTimeUnit(TimeUnit.MINUTES)
        .build()
    }
    "paused", "autopaused" -> plain(getString(R.string.paused))
    else -> plain(getString(R.string.complicationRun))
  }

  private fun plain(s: String) = PlainComplicationText.Builder(s).build()

  companion object {
    fun refresh(ctx: Context) {
      runCatching {
        ComplicationDataSourceUpdateRequester.create(ctx, ComponentName(ctx, RunComplicationService::class.java)).requestUpdateAll()
      }
    }
  }
}
