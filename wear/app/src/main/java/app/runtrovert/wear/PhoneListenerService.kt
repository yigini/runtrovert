package app.runtrovert.wear

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/** Wakes for the phone's messages, app open or not. */
class PhoneListenerService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    val json = String(event.data, Charsets.UTF_8)
    when (event.path) {
      Paths.LIVE -> PhoneLink.onLive(applicationContext, json)
      Paths.SPLIT -> Split.parse(json)?.let { WatchNotes.onSplit(applicationContext, it) }
      Paths.RUN_ACK -> SoloSync.onAck(applicationContext, json)
    }
  }
}
