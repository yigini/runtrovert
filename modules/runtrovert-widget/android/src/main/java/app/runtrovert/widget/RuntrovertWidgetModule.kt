package app.runtrovert.widget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's side of the widgets: update(json) keeps the words and redraws every
 * widget on the home screen. The widgets never read the database or the network.
 */
class RuntrovertWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RuntrovertWidget")

    Function("update") { json: String ->
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null) {
        WidgetData.save(ctx, json)
        runCatching { WidgetData.refreshAll(ctx) }
      }
      ctx != null
    }
  }
}
