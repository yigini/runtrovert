package app.runtrovert.wear

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Everything the watch knows about the run on the phone, and the one way to
 * talk back. Messages only go to a phone that is nearby (the direct Bluetooth
 * or local Wi-Fi link), never through Google's cloud relay.
 */
object PhoneLink {
  private val _live = MutableStateFlow<Live?>(null)
  /** The last state the phone sent; null until the phone has answered once. */
  val live: StateFlow<Live?> = _live

  private val _heart = MutableStateFlow<Int?>(null)
  /** Latest beat from this watch's sensor while a run is on. */
  val heart: StateFlow<Int?> = _heart

  /** A Start sent while the phone app was closed: sent again once it answers. */
  @Volatile var pendingStartAt = 0L

  @Volatile var appVisible = false

  fun onLive(ctx: Context, json: String) {
    val next = Live.parse(json, SystemClock.elapsedRealtime()) ?: return
    val before = _live.value
    _live.value = next
    if (next.status == "idle" && !next.needsOpen && pendingStartAt != 0L) {
      if (SystemClock.elapsedRealtime() - pendingStartAt < 45_000) sendAsync(ctx, Paths.CMD, cmdJson("start"))
      pendingStartAt = 0L
    } else if (next.active) {
      pendingStartAt = 0L
    }
    // Opened mid-run: heart rate and the watch-face activity start now, not on the next hello.
    if (next.active && appVisible) RunService.startIfNeeded(ctx)
    if (before?.status != next.status) {
      RunTileService.refresh(ctx)
      RunService.onStatus(ctx, next)
      WatchNotes.onStatus(ctx, before, next)
    }
  }

  fun onHeart(bpm: Int?) {
    _heart.value = bpm
  }

  /** The phone node, if one is nearby with Runtrovert on it. */
  suspend fun phoneNode(ctx: Context): String? = runCatching {
    val info = Wearable.getCapabilityClient(ctx).getCapability(PHONE_CAPABILITY, CapabilityClient.FILTER_REACHABLE).await()
    info.nodes.firstOrNull { it.isNearby }?.id
  }.getOrNull()

  /** true when the message reached the phone. */
  suspend fun send(ctx: Context, path: String, json: String): Boolean = withTimeoutOrNull(4_000) {
    val node = phoneNode(ctx) ?: return@withTimeoutOrNull false
    runCatching { Wearable.getMessageClient(ctx).sendMessage(node, path, json.toByteArray()).await() }.isSuccess
  } ?: false

  fun sendAsync(ctx: Context, path: String, json: String) {
    WearApp.scope.launchSafe { send(ctx.applicationContext, path, json) }
  }
}
