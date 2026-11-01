package app.runtrovert.health

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** Opens the privacy policy, where the Health Connect part says what is read and written, and why. */
class HealthRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    runCatching {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://runtrovert.app/privacy.html#health-connect")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    finish()
  }
}
