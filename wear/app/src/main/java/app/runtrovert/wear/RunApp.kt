package app.runtrovert.wear

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.TimeText
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// The phone's palette (src/theme.ts) on a black face, which costs the watch nothing to show.
private val Cream = Color(0xFFF6F1EA)
private val Muted = Color(0xFFB9B2AA)
private val Mint = Color(0xFFC9E7D6)
private val Butter = Color(0xFFF5E3A8)
private val Lilac = Color(0xFFD9D0F0)
private val Dim = Color(0xFF2B2733)

@Composable
fun RunApp(activity: MainActivity) {
  MaterialTheme {
    val live by PhoneLink.live.collectAsStateWithLifecycle()
    val local by activity.local.collectAsStateWithLifecycle()
    val heart by PhoneLink.heart.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
      TimeText()
      val l = live
      when {
        local == Local.Asking -> HeartAsk(activity)
        l != null && l.active -> Running(activity, l, heart)
        l != null && l.status == "halted" -> Message(stringResource(R.string.finishOnPhone))
        local == Local.Starting -> Message(stringResource(R.string.starting))
        local == Local.OpeningPhone -> Message(stringResource(R.string.openingPhone))
        local == Local.NoPhone -> Message(stringResource(R.string.noPhone), stringResource(R.string.noPhoneHint)) { activity.dismiss() }
        else -> Idle(activity)
      }
    }
  }
}

@Composable
private fun Idle(activity: MainActivity) {
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    RoundButton(stringResource(R.string.start), Mint, 92) { activity.onStartTapped() }
    Spacer(Modifier.height(8.dp))
    Text(stringResource(R.string.tileHint), color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
  }
}

@Composable
private fun Running(activity: MainActivity, live: Live, heart: Int?) {
  var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
  LaunchedEffect(live) {
    while (true) {
      now = SystemClock.elapsedRealtime()
      delay(250)
    }
  }
  var confirm by remember { mutableStateOf(false) }
  if (confirm) {
    Confirm(onEnd = { confirm = false; activity.send("stop") }, onKeep = { confirm = false })
    return
  }
  val km = live.unitsKm
  val unit = stringResource(if (km) R.string.km else R.string.mi)
  val secs = live.durationNow(now)
  val paused = live.status != "running"
  Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Spacer(Modifier.height(18.dp))
    Text(
      stringResource(if (live.status == "autopaused") R.string.autoPaused else if (paused) R.string.paused else R.string.recording),
      color = if (paused) Butter else Mint,
      fontSize = 12.sp,
    )
    Text(Format.duration(secs), color = Cream, fontSize = 40.sp, fontWeight = FontWeight.SemiBold,
      modifier = Modifier.semantics { contentDescription = "${activity.getString(R.string.time)} ${Format.duration(secs)}" })
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
      Stat("${Format.distance(live.distanceM, km)} $unit", activity.getString(R.string.distance))
      Stat("${Format.pace(live.distanceM, secs, km)} /$unit", activity.getString(R.string.pace))
    }
    if (heart != null) {
      Text("♥ $heart ${stringResource(R.string.bpm)}", color = Lilac, fontSize = 14.sp,
        modifier = Modifier.semantics { contentDescription = "${activity.getString(R.string.heartRate)} $heart" })
    }
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
      // Auto-paused counts as paused: play resumes it rather than turning it into a manual pause.
      val word = stringResource(if (paused) R.string.resume else R.string.pause)
      RoundButton(if (paused) "▶" else "❚❚", if (paused) Mint else Cream, 48, word) {
        activity.send(if (paused) "resume" else "pause")
      }
      HoldToStop(onStop = { activity.send("stop") }, onConfirm = { confirm = true }, reader = activity.touchExploration)
    }
  }
}

@Composable
private fun Stat(value: String, label: String) {
  Text(value, color = Cream, fontSize = 15.sp, modifier = Modifier.semantics { contentDescription = "$label $value" })
}

/**
 * Hold for a second to stop, as on the phone (#22): the pill fills as you hold.
 * A short tap only says "Keep holding". With TalkBack on, a double tap asks first.
 */
@Composable
private fun HoldToStop(onStop: () -> Unit, onConfirm: () -> Unit, reader: Boolean) {
  val progress = remember { Animatable(0f) }
  val scope = rememberCoroutineScope()
  val label = stringResource(R.string.holdToStop)
  val hintText = stringResource(R.string.holdHint)
  val endIt = stringResource(R.string.endIt)
  Box(
    Modifier
      .width(96.dp)
      .height(48.dp)
      .clip(RoundedCornerShape(24.dp))
      .background(Dim)
      .drawBehind { drawRect(Butter, size = Size(size.width * progress.value, size.height)) }
      .semantics {
        role = Role.Button
        contentDescription = hintText
        onClick(label = endIt) {
          onConfirm()
          true
        }
      }
      .pointerInput(reader) {
        detectTapGestures(onPress = {
          if (reader) {
            onConfirm()
            return@detectTapGestures
          }
          val job = scope.launch {
            progress.animateTo(1f, tween(1_000, easing = LinearEasing))
            onStop()
          }
          tryAwaitRelease()
          if (progress.value < 1f) {
            job.cancel()
            scope.launch { progress.animateTo(0f, tween(150)) }
          }
        })
      },
    contentAlignment = Alignment.Center,
  ) {
    Text(label, color = if (progress.value > 0.5f) Dim else Cream, fontSize = 12.sp, textAlign = TextAlign.Center)
  }
}

@Composable
private fun Confirm(onEnd: () -> Unit, onKeep: () -> Unit) {
  Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text(stringResource(R.string.endRun), color = Cream, fontSize = 16.sp, textAlign = TextAlign.Center)
    PillButton(stringResource(R.string.endIt), Butter, onClick = onEnd)
    PillButton(stringResource(R.string.keepGoing), Mint, onClick = onKeep)
  }
}

@Composable
private fun HeartAsk(activity: MainActivity) {
  Column(Modifier.padding(horizontal = 22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("♥", color = Lilac, fontSize = 20.sp)
    Text(stringResource(R.string.hrAsk), color = Cream, fontSize = 13.sp, textAlign = TextAlign.Center)
    PillButton(stringResource(R.string.allow), Mint) { activity.onHeartAnswer(true) }
    PillButton(stringResource(R.string.notNow), Dim, textColor = Cream) { activity.onHeartAnswer(false) }
  }
}

@Composable
private fun Message(title: String, body: String? = null, onTap: (() -> Unit)? = null) {
  Column(
    Modifier.padding(horizontal = 24.dp).then(if (onTap != null) Modifier.clickable(onClick = onTap) else Modifier),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(6.dp),
  ) {
    Text(title, color = Cream, fontSize = 15.sp, textAlign = TextAlign.Center)
    if (body != null) Text(body, color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
  }
}

@Composable
private fun RoundButton(text: String, color: Color, sizeDp: Int, description: String? = null, onClick: () -> Unit) {
  Box(
    Modifier
      .size(sizeDp.dp)
      .clip(CircleShape)
      .background(color)
      .clickable(onClick = onClick, role = Role.Button)
      .then(if (description != null) Modifier.semantics { contentDescription = description } else Modifier),
    contentAlignment = Alignment.Center,
  ) {
    Text(text, color = Dim, fontSize = if (sizeDp > 60) 18.sp else 14.sp, fontWeight = FontWeight.SemiBold)
  }
}

@Composable
private fun PillButton(text: String, color: Color, textColor: Color = Dim, onClick: () -> Unit) {
  Box(
    Modifier
      .fillMaxWidth()
      .height(44.dp)
      .clip(RoundedCornerShape(22.dp))
      .background(color)
      .clickable(onClick = onClick, role = Role.Button),
    contentAlignment = Alignment.Center,
  ) {
    Text(text, color = textColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
  }
}
