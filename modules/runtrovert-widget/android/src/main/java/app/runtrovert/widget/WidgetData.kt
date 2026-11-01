package app.runtrovert.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONObject

/**
 * The words the app last handed over (src/widgetData.ts), kept in the app's own
 * preferences, and the two taps: open the app, or open it on runtrovert://start-run.
 */
object WidgetData {
  private const val PREFS = "runtrovert_widget"
  private const val KEY = "data"

  fun save(ctx: Context, json: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }

  fun read(ctx: Context): JSONObject? {
    val s = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
    return runCatching { JSONObject(s) }.getOrNull()
  }

  fun refreshAll(ctx: Context) {
    val manager = AppWidgetManager.getInstance(ctx)
    val runIds = manager.getAppWidgetIds(ComponentName(ctx, RunWidget::class.java))
    if (runIds.isNotEmpty()) RunWidget.render(ctx, manager, runIds)
    val startIds = manager.getAppWidgetIds(ComponentName(ctx, StartWidget::class.java))
    if (startIds.isNotEmpty()) StartWidget.render(ctx, manager, startIds)
  }

  fun start(ctx: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("runtrovert://start-run"))
      .setPackage(ctx.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun open(ctx: Context): PendingIntent {
    val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 2, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
