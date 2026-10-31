package app.runtrovert.wear

import android.content.Context
import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture

/**
 * A tile one swipe from the watch face: tap to start, or, mid-run, where the
 * run is at. It only refreshes when the run's state changes, never on a timer.
 */
class RunTileService : TileService() {
  override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
    CallbackToFutureAdapter.getFuture { done ->
      done.set(
        TileBuilders.Tile.Builder()
          .setResourcesVersion("1")
          .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout()))
          .build(),
      )
      "tile"
    }

  override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
    CallbackToFutureAdapter.getFuture { done ->
      done.set(ResourceBuilders.Resources.Builder().setVersion("1").build())
      "resources"
    }

  private fun layout(): LayoutElementBuilders.LayoutElement {
    val live = PhoneLink.live.value
    val (title, line) = if (live != null && live.active) {
      val unit = getString(if (live.unitsKm) R.string.km else R.string.mi)
      getString(R.string.runInProgress) to "${Format.distance(live.distanceM, live.unitsKm)} $unit"
    } else {
      getString(R.string.app_name) to getString(R.string.tileHint)
    }
    val open = ModifiersBuilders.Clickable.Builder()
      .setId("open")
      .setOnClick(
        ActionBuilders.LaunchAction.Builder()
          .setAndroidActivity(
            ActionBuilders.AndroidActivity.Builder()
              .setPackageName(packageName)
              .setClassName(MainActivity::class.java.name)
              // With no run on, the tap starts one (the phone's countdown still gives a moment to change your mind).
              .addKeyToExtraMapping(MainActivity.START, ActionBuilders.booleanExtra(live?.active != true))
              .build(),
          )
          .build(),
      )
      .build()
    return LayoutElementBuilders.Box.Builder()
      .setWidth(expand())
      .setHeight(expand())
      .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(open).build())
      .addContent(
        LayoutElementBuilders.Column.Builder()
          .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
          .addContent(text(title, 16f, MINT))
          .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(6f)).build())
          .addContent(text(line, 14f, CREAM))
          .build(),
      )
      .build()
  }

  private fun text(s: String, size: Float, color: Int) = LayoutElementBuilders.Text.Builder()
    .setText(s)
    .setMaxLines(2)
    .setFontStyle(LayoutElementBuilders.FontStyle.Builder().setSize(sp(size)).setColor(argb(color)).build())
    .build()

  companion object {
    private const val MINT = 0xFFC9E7D6.toInt()
    private const val CREAM = 0xFFF6F1EA.toInt()

    fun refresh(ctx: Context) {
      runCatching { getUpdater(ctx).requestUpdate(RunTileService::class.java) }
      RunComplicationService.refresh(ctx)
    }
  }
}
