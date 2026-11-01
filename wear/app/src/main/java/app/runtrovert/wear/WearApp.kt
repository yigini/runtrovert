package app.runtrovert.wear

import android.app.Application
import androidx.wear.phone.interactions.notifications.BridgingConfig
import androidx.wear.phone.interactions.notifications.BridgingManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class WearApp : Application() {
  override fun onCreate() {
    super.onCreate()
    // A run recorded on the watch that a crash or flat battery cut short is kept, not lost.
    runCatching { SoloRun.recover(this) }
    // The phone's live note and per-km note are tagged runtrovert-live and
    // runtrovert-split (src/runNotify.ts). With this app on the watch, its own
    // buzz and screen take their place, so they aren't bridged twice. Quiet
    // reminders and the after-run note still come through as before.
    runCatching {
      BridgingManager.fromContext(this).setConfig(
        BridgingConfig.Builder(this, true).addExcludedTags(listOf("runtrovert-live", "runtrovert-split")).build(),
      )
    }
  }

  companion object {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  }
}

fun CoroutineScope.launchSafe(block: suspend CoroutineScope.() -> Unit) = launch {
  runCatching { block() }
}
