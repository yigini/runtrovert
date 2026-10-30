// The Wear OS app: its own small Gradle project, built next to the phone app by
// CI (.github/workflows/android.yml, "wear" job). It ships with the same package
// name and signing key as the phone app, which is how the two find each other.
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}
rootProject.name = "runtrovert-wear"
include(":app")
