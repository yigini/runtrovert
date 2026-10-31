package app.runtrovert.wear

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import androidx.wear.remote.interactions.RemoteActivityHelper
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch

/** What the watch is doing on its own side, between the phone's updates. */
enum class Local { None, Asking, Starting, OpeningPhone, NoPhone }

class MainActivity : ComponentActivity() {
  val local = MutableStateFlow(Local.None)
  private var hello: Job? = null

  private val askHeart = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
    prefs().edit().putBoolean(ASKED, true).apply()
    lifecycleScope.launch { start() }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent { RunApp(this) }
    startFromIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    startFromIntent(intent)
  }

  /** The tile and the complication open the app with START: with no run on, it starts one, as if Start was tapped. */
  private fun startFromIntent(intent: Intent?) {
    if (intent?.getBooleanExtra(START, false) != true) return
    intent.removeExtra(START) // not again on rotation or a return to the app
    if (PhoneLink.live.value?.active == true || local.value != Local.None) return
    onStartTapped()
  }

  override fun onResume() {
    super.onResume()
    PhoneLink.appVisible = true
    // Tell the phone we're looking (it sends every second while we are), and keep saying so.
    hello = lifecycleScope.launch {
      while (true) {
        PhoneLink.send(this@MainActivity, Paths.HELLO, helloJson(true))
        RunService.startIfNeeded(this@MainActivity)
        delay(30_000)
      }
    }
  }

  override fun onPause() {
    hello?.cancel()
    PhoneLink.appVisible = false
    PhoneLink.sendAsync(this, Paths.HELLO, helloJson(false))
    super.onPause()
  }

  val touchExploration: Boolean
    get() = getSystemService(AccessibilityManager::class.java)?.isTouchExplorationEnabled == true

  fun onStartTapped() {
    // Once, before the first run: what the heart rate is for, then Android's own question.
    if (!RunService.hasHeartPermission(this) && !prefs().getBoolean(ASKED, false)) {
      local.value = Local.Asking
      return
    }
    lifecycleScope.launch { start() }
  }

  fun onHeartAnswer(allow: Boolean) {
    if (allow) {
      askHeart.launch(arrayOf(RunService.heartPermission(), Manifest.permission.POST_NOTIFICATIONS))
    } else {
      prefs().edit().putBoolean(ASKED, true).apply()
      lifecycleScope.launch { start() }
    }
  }

  private suspend fun start() {
    local.value = Local.Starting
    val node = PhoneLink.phoneNode(this)
    if (node == null) {
      local.value = Local.NoPhone
      return
    }
    val asked = SystemClock.elapsedRealtime()
    PhoneLink.send(this, Paths.CMD, cmdJson("start"))
    // The phone answers straight away when the app is up. Silence means it's closed, and
    // needsOpen means it's in the background, where Android won't let it start the GPS: open it.
    val answerBy = SystemClock.elapsedRealtime() + 2_500
    while (SystemClock.elapsedRealtime() < answerBy && (PhoneLink.live.value?.at ?: 0L) < asked) delay(100)
    val live = PhoneLink.live.value
    if (live == null || live.at < asked || live.needsOpen) {
      PhoneLink.pendingStartAt = SystemClock.elapsedRealtime()
      local.value = Local.OpeningPhone
      runCatching {
        RemoteActivityHelper(this).startRemoteActivity(
          Intent(Intent.ACTION_VIEW).addCategory(Intent.CATEGORY_BROWSABLE).setData(Uri.parse("runtrovert://watch")),
          node,
        ).await()
      }
    }
    // The countdown runs on the phone; the screen moves on when the run begins.
    val until = SystemClock.elapsedRealtime() + 45_000
    while (SystemClock.elapsedRealtime() < until && PhoneLink.live.value?.active != true) delay(300)
    local.value = if (PhoneLink.live.value?.active == true) Local.None else Local.NoPhone
    RunService.startIfNeeded(this)
  }

  fun send(cmd: String) {
    WatchNotes.buzz(this, long = cmd == "stop")
    PhoneLink.sendAsync(this, Paths.CMD, cmdJson(cmd))
  }

  fun dismiss() {
    local.value = Local.None
  }

  private fun prefs() = getSharedPreferences("runtrovert", MODE_PRIVATE)

  companion object {
    private const val ASKED = "heartAsked"
    const val START = "app.runtrovert.wear.START"

    /** Opens the app; with [start], a run starts too unless one is already on. */
    fun openIntent(ctx: android.content.Context, start: Boolean): Intent =
      Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(START, start)
  }
}
