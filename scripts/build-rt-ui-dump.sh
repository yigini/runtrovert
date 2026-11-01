#!/usr/bin/env bash
# Build only: this script does not publish, install an app, or modify product code.
set -euo pipefail
rt_here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
rt_sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "$rt_sdk" ]]; then
  echo 'Set ANDROID_SDK_ROOT or ANDROID_HOME to the CI Android SDK.' >&2
  exit 1
fi
rt_android_jar="$rt_sdk/platforms/android-35/android.jar"
rt_d8="${RT_D8:-}"
if [[ -z "$rt_d8" ]]; then
  rt_d8="$(find "$rt_sdk/build-tools" -maxdepth 2 -type f -name d8 | sort -V | tail -n 1)"
fi
rt_build="${RT_UI_DUMP_BUILD:-$rt_here/rt-ui-dump-build}"
[[ -f "$rt_android_jar" ]] || { echo "Missing $rt_android_jar" >&2; exit 1; }
[[ -x "$rt_d8" ]] || { echo "Missing d8: $rt_d8 (set RT_D8 if another version is installed)" >&2; exit 1; }
mkdir -p "$rt_build/classes" "$rt_build/dex"
javac -encoding UTF-8 -source 8 -target 8 -cp "$rt_android_jar" \
  -d "$rt_build/classes" "$rt_here/RtUiDump.java"
"$rt_d8" --min-api 26 --lib "$rt_android_jar" \
  --output "$rt_build/dex" "$rt_build/classes/"*.class
jar cf "$rt_build/RtUiDump.jar" -C "$rt_build/dex" classes.dex
printf '%s\n' "$rt_build/RtUiDump.jar"
