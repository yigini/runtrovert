package app.runtrovert.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/** Last run and this week, with Start. Before the app has run once it shows only the name. */
class RunWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    render(context, manager, ids)
  }

  companion object {
    fun render(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
      val d = WidgetData.read(ctx)
      for (id in ids) {
        val v = RemoteViews(ctx.packageName, R.layout.rt_widget_run)
        if (d != null) {
          v.setTextViewText(R.id.rt_last_title, d.optString("lastTitle"))
          v.setTextViewText(R.id.rt_last_value, d.optString("lastValue"))
          v.setTextViewText(R.id.rt_week_title, d.optString("weekTitle"))
          // A new week since the app last handed over its words: this week starts at nothing.
          val weekEnd = d.optLong("weekEnd", 0L)
          val week = if (weekEnd > 0L && System.currentTimeMillis() >= weekEnd) d.optString("weekZero") else d.optString("weekValue")
          v.setTextViewText(R.id.rt_week_value, week)
          v.setContentDescription(R.id.rt_start, d.optString("start"))
        }
        v.setOnClickPendingIntent(R.id.rt_root, WidgetData.open(ctx))
        v.setOnClickPendingIntent(R.id.rt_start, WidgetData.start(ctx))
        manager.updateAppWidget(id, v)
      }
    }
  }
}
