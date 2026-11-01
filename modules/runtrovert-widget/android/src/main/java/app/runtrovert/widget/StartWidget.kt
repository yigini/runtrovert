package app.runtrovert.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/** One round button: Start a run. */
class StartWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    render(context, manager, ids)
  }

  companion object {
    fun render(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
      val d = WidgetData.read(ctx)
      for (id in ids) {
        val v = RemoteViews(ctx.packageName, R.layout.rt_widget_start)
        if (d != null) v.setContentDescription(R.id.rt_start, d.optString("start"))
        v.setOnClickPendingIntent(R.id.rt_start, WidgetData.start(ctx))
        manager.updateAppWidget(id, v)
      }
    }
  }
}
