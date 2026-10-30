plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}

android {
  namespace = "app.runtrovert.wear"
  compileSdk = 36

  defaultConfig {
    // Same package as the phone app: the Data Layer only connects an app to itself.
    applicationId = "app.runtrovert"
    minSdk = 30 // Wear OS 3, the first with Health Services
    targetSdk = 36
    // Watch builds count from 100000 so they never collide with the phone's codes on Play.
    versionCode = 100001
    versionName = "0.1.0"
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    compose = true
  }
  // Only the eight languages the phone app speaks.
  androidResources {
    localeFilters += listOf("en", "de", "es", "fr", "it", "pt", "tr", "ja")
  }
}

kotlin {
  compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
  implementation("androidx.core:core-ktx:1.17.0")
  implementation("androidx.activity:activity-compose:1.11.0")
  implementation("androidx.fragment:fragment:1.8.5") // the wear library pulls an old one; results need 1.3+
  implementation("androidx.wear.compose:compose-material3:1.5.6")
  implementation("androidx.wear.compose:compose-foundation:1.5.6")
  implementation("androidx.lifecycle:lifecycle-service:2.9.4")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
  // Phone <-> watch over the direct Bluetooth link. No network permission in this app.
  implementation("com.google.android.gms:play-services-wearable:19.0.0")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.10.2")
  // Heart rate from the watch's own sensor, batched in hardware.
  implementation("androidx.health:health-services-client:1.1.0")
  implementation("androidx.wear:wear-ongoing:1.1.0")
  implementation("androidx.wear:wear:1.3.0")
  implementation("androidx.wear:wear-remote-interactions:1.1.0")
  implementation("androidx.wear:wear-phone-interactions:1.1.0")
  implementation("androidx.concurrent:concurrent-futures:1.2.0")
  implementation("androidx.wear.tiles:tiles:1.5.0")
  implementation("androidx.wear.protolayout:protolayout:1.3.0")
  implementation("androidx.wear.protolayout:protolayout-material:1.3.0")
  implementation("androidx.wear.protolayout:protolayout-expression:1.3.0")
}
