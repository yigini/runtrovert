package app.runtrovert.wear.phone

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

/**
 * The phone's end of the Wear OS app (wear/ in this repo). Sends small JSON
 * messages to a watch that has Runtrovert on it and hands the watch's messages
 * to JS. Only nearby watches (Bluetooth or the same Wi-Fi), never through the
 * cloud relay, so nothing leaves the two devices. A phone without Wear OS just
 * gets 0 from send().
 */
class RuntrovertWearModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  private var nodes: List<String> = emptyList()
  private var nodesAt = 0L

  private val listener = MessageClient.OnMessageReceivedListener { e ->
    if (e.path.startsWith("/runtrovert/")) {
      nodesAt = 0L // a watch just spoke: look it up fresh on the next send
      sendEvent("onMessage", mapOf("path" to e.path, "data" to String(e.data, Charsets.UTF_8)))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("RuntrovertWear")

    Events("onMessage")

    OnCreate {
      runCatching { Wearable.getMessageClient(context).addListener(listener) }
    }

    OnDestroy {
      runCatching { Wearable.getMessageClient(context).removeListener(listener) }
    }

    // How many watches got it. Runs off the main thread.
    AsyncFunction("send") { path: String, data: String ->
      val targets = watches()
      var sent = 0
      for (node in targets) {
        val ok = runCatching {
          Tasks.await(Wearable.getMessageClient(context).sendMessage(node, path, data.toByteArray()), 3, TimeUnit.SECONDS)
        }.isSuccess
        if (ok) sent++ else nodesAt = 0L // look again next time
      }
      sent
    }

    AsyncFunction("hasWatch") { watches().isNotEmpty() }
  }

  /** Nearby watches with Runtrovert installed, looked up at most every 30 s. */
  private fun watches(): List<String> {
    val now = SystemClock.elapsedRealtime()
    if (nodesAt != 0L && now - nodesAt < 30_000) return nodes
    nodes = runCatching {
      val info = Tasks.await(
        Wearable.getCapabilityClient(context).getCapability("runtrovert_watch", CapabilityClient.FILTER_REACHABLE),
        3,
        TimeUnit.SECONDS,
      )
      info.nodes.filter { it.isNearby }.map { it.id }
    }.getOrDefault(emptyList())
    nodesAt = now
    return nodes
  }
}
