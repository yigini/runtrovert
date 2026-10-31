package app.runtrovert.music

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.provider.Settings
import java.io.File
import java.io.FileOutputStream
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.SystemClock
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Talks to whatever music app is playing through the system's media buttons,
 * the same path a pair of headphones uses. No account, no SDK, no permission.
 * What is playing (title, artist, cover) is read only if the runner turns on
 * notification access for Runtrovert; it stays on the phone and is shown on the
 * music bar, nothing more. Without it everything else here still works.
 */
class RuntrovertMusicModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  private val audio: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val listener: ComponentName
    get() = ComponentName(context, NowPlayingListener::class.java)

  /** Whether the runner has turned on notification access for us. */
  private fun allowed(): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it)?.packageName == context.packageName }
  }

  private var artKey: String? = null
  private var artUri: String? = null

  /** The cover as a small file in our cache, so the screen can show it. Only the latest one is kept. */
  private fun saveArt(bmp: Bitmap?, key: String): String? {
    if (bmp == null) return null
    if (key == artKey) return artUri
    return try {
      val dir = File(context.cacheDir, "now-playing").apply { mkdirs() }
      dir.listFiles()?.forEach { it.delete() }
      val side = 160
      val scaled = Bitmap.createScaledBitmap(bmp, side, maxOf(1, side * bmp.height / maxOf(1, bmp.width)), true)
      val file = File(dir, Integer.toHexString(key.hashCode()) + ".jpg")
      FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.JPEG, 85, it) }
      artKey = key
      artUri = Uri.fromFile(file).toString()
      artUri
    } catch (e: Exception) {
      null
    }
  }

  private fun current(): MediaController? {
    val msm = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
    val sessions = msm.getActiveSessions(listener)
    return sessions.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: sessions.firstOrNull()
  }

  private var focus: AudioFocusRequest? = null
  private var ducking = false

  override fun definition() = ModuleDefinition {
    Name("RuntrovertMusic")

    Constant("canControl") { true }

    Function("isPlaying") { audio.isMusicActive }

    Function("send") { command: String ->
      val code = when (command) {
        "toggle" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
        "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
        else -> return@Function false
      }
      val t = SystemClock.uptimeMillis()
      audio.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_DOWN, code, 0))
      audio.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_UP, code, 0))
      true
    }

    // False in the side-loaded test APK, which is built without the listener.
    Constant("hasNowPlaying") {
      try {
        context.packageManager.getServiceInfo(listener, 0)
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("nowPlayingAllowed") { allowed() }

    // Android's own screen for notification access, on Runtrovert's row where the phone allows it.
    Function("askNowPlaying") {
      val detail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
          .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, listener.flattenToString())
      } else null
      for (intent in listOfNotNull(detail, Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))) {
        try {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          return@Function true
        } catch (e: Exception) {
          // try the general screen
        }
      }
      false
    }

    // Title, artist, cover and app of what is playing, or null (no access, nothing playing).
    Function("nowPlaying") {
      if (!allowed()) return@Function null
      try {
        val c = current() ?: return@Function null
        val md = c.metadata ?: return@Function null
        val title = md.getString(MediaMetadata.METADATA_KEY_TITLE) ?: md.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE) ?: return@Function null
        val artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: md.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE) ?: md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
        val bmp = md.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART) ?: md.getBitmap(MediaMetadata.METADATA_KEY_ART) ?: md.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
        mapOf(
          "title" to title,
          "artist" to artist,
          "app" to c.packageName,
          "playing" to (c.playbackState?.state == PlaybackState.STATE_PLAYING),
          "art" to saveArt(bmp, "${c.packageName}|$title|$artist"),
        )
      } catch (e: SecurityException) {
        null
      } catch (e: Exception) {
        null
      }
    }

    Function("installed") { ids: List<String> ->
      val pm = context.packageManager
      ids.filter { pm.getLaunchIntentForPackage(it) != null }
    }

    // id = an Android package name, or null for the phone's default music app.
    Function("open") { id: String? ->
      val intent = if (id != null) {
        context.packageManager.getLaunchIntentForPackage(id)
      } else {
        Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MUSIC)
      } ?: return@Function false
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    // While a voice cue speaks, ask the system to lower other audio. Android 8+
    // ducks the music app for us and brings it back when we let go.
    Function("duck") { on: Boolean ->
      if (on == ducking) return@Function true
      ducking = on
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        if (on) {
          val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            )
            .build()
          focus = req
          audio.requestAudioFocus(req)
        } else {
          focus?.let { audio.abandonAudioFocusRequest(it) }
          focus = null
        }
      } else {
        @Suppress("DEPRECATION")
        if (on) {
          audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        } else {
          audio.abandonAudioFocus(null)
        }
      }
      true
    }
  }
}
