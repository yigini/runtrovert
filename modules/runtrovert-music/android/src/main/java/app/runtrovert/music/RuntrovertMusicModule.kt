package app.runtrovert.music

import android.content.Context
import android.content.Intent
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
 * We never read what is playing: that needs notification access, which is
 * more than a running app should ask for.
 */
class RuntrovertMusicModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  private val audio: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

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
