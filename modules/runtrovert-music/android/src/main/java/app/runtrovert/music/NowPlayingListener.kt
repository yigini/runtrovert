package app.runtrovert.music

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Exists only so Android lets us ask which song is playing (MediaSessionManager
 * needs an enabled notification listener as its key). It reads no notifications:
 * both callbacks below do nothing, and nothing is stored or sent anywhere.
 * Off until the runner turns on notification access for Runtrovert themselves.
 */
class NowPlayingListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {}
  override fun onNotificationRemoved(sbn: StatusBarNotification?) {}
}
