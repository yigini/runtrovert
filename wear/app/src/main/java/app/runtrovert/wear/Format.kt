package app.runtrovert.wear

import java.util.Locale
import kotlin.math.floor
import kotlin.math.roundToInt

/** The same numbers the phone shows (src/geo.ts), in the watch's own locale. */
object Format {
  private const val MILE_M = 1609.344

  fun distance(m: Double, km: Boolean): String {
    val v = if (km) m / 1000.0 else m / MILE_M
    return String.format(Locale.getDefault(), "%.2f", floor(v * 100) / 100)
  }

  fun duration(s: Double): String {
    val t = s.toInt().coerceAtLeast(0)
    val h = t / 3600
    val m = (t % 3600) / 60
    val sec = t % 60
    return if (h > 0) String.format(Locale.ROOT, "%d:%02d:%02d", h, m, sec) else String.format(Locale.ROOT, "%d:%02d", m, sec)
  }

  /** Minutes per km or mile; a dash until there's enough distance to mean anything. */
  fun pace(m: Double, s: Double, km: Boolean): String {
    if (m < 50 || s <= 0) return "–:––"
    val per = s / (m / if (km) 1000.0 else MILE_M)
    if (per > 3600) return "–:––"
    val r = per.roundToInt()
    return String.format(Locale.ROOT, "%d:%02d", r / 60, r % 60)
  }
}
