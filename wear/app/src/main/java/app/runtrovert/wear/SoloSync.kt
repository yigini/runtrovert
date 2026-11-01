package app.runtrovert.wear

import android.content.Context
import android.os.SystemClock
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Hands runs recorded on the watch to the phone, in pieces small enough for a
 * message (/runtrovert/run). The phone answers /runtrovert/runack once it has
 * kept one; only then is it deleted here. Tried whenever the phone shows it's
 * around (any live message), at most every two minutes per run.
 */
object SoloSync {
  private const val PIECE = 40_000
  private val busy = AtomicBoolean(false)
  private val triedAt = HashMap<String, Long>()

  fun syncAsync(ctx: Context) {
    WearApp.scope.launchSafe { sync(ctx.applicationContext) }
  }

  private suspend fun sync(ctx: Context) {
    if (SoloRun.active || !busy.compareAndSet(false, true)) return
    try {
      for (f in SoloStore.pending(ctx)) {
        val id = SoloStore.idOf(f)
        val now = SystemClock.elapsedRealtime()
        if (now - (triedAt[id] ?: -1_000_000L) < 120_000) continue
        triedAt[id] = now
        val text = f.readText()
        val parts = text.chunked(PIECE)
        for ((i, d) in parts.withIndex()) {
          val msg = JSONObject().put("id", id).put("part", i).put("of", parts.size).put("d", d).toString()
          if (!PhoneLink.send(ctx, Paths.RUN, msg)) return // phone gone: next time
        }
      }
    } finally {
      busy.set(false)
    }
  }

  /** The phone kept it (ok) or can't read it: either way it stops being sent. Unreadable ones stay on the watch, set aside. */
  fun onAck(ctx: Context, json: String) {
    val o = runCatching { JSONObject(json) }.getOrNull() ?: return
    val id = o.optString("id").takeIf { it.isNotEmpty() && !it.contains('/') } ?: return
    val f = SoloStore.dir(ctx).resolve("run-$id.json")
    if (o.optBoolean("ok", false)) f.delete() else f.renameTo(SoloStore.dir(ctx).resolve("unread-$id.json"))
    triedAt.remove(id)
    SoloRun.refreshWaiting(ctx)
  }
}
