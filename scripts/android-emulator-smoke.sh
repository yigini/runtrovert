#!/usr/bin/env bash
set -euo pipefail

# This is an installation/launch smoke test, not a full usability test.
mkdir -p evidence
capture_diagnostics() {
  timeout 15s adb logcat -d -v threadtime > evidence/logcat.txt 2>&1 || true
  timeout 15s adb logcat -b crash -d > evidence/crashes.txt 2>&1 || true
  timeout 15s adb shell dumpsys activity activities > evidence/activities.txt 2>&1 || true
  timeout 15s adb shell dumpsys package app.runtrovert > evidence/package.txt 2>&1 || true
  if [ ! -s evidence/first-launch.png ]; then
    timeout 15s adb exec-out screencap -p > evidence/first-launch.png || true
  fi
  timeout 20s adb shell uiautomator dump /sdcard/runtrovert-window.xml > evidence/ui-dump-log.txt 2>&1 &&
    timeout 15s adb pull /sdcard/runtrovert-window.xml evidence/first-launch.xml || true
}
trap capture_diagnostics EXIT

adb devices -l | tee evidence/devices.txt
adb shell getprop ro.build.version.release | tee evidence/android-version.txt
adb shell getprop ro.product.cpu.abi | tee evidence/device-abi.txt
adb install --no-streaming emulator-only.apk | tee evidence/install.txt
grep -q '^Success' evidence/install.txt
adb shell pm list packages app.runtrovert | grep -Fx 'package:app.runtrovert'
adb logcat -c
adb logcat -b crash -c
adb shell wm dismiss-keyguard

activity=$(adb shell cmd package resolve-activity --brief app.runtrovert | tr -d '\r' | tail -n 1)
[[ "$activity" == app.runtrovert/* ]]
adb shell am start -W -n "$activity" | tee evidence/launch.txt
grep -q 'Status: ok' evidence/launch.txt
sleep 25
adb shell pidof app.runtrovert | tee evidence/app-pid.txt
adb shell dumpsys activity activities > evidence/activities.txt
grep -E '(topResumedActivity|mResumedActivity).*app.runtrovert' evidence/activities.txt
adb logcat -b crash -d > evidence/crashes.txt
if grep -q 'Process: app.runtrovert' evidence/crashes.txt; then
  echo 'Runtrovert crashed after launch' >&2
  exit 1
fi

# Require real screenshot evidence before declaring success. Inspect its contents
# separately: a living foreground process alone does not prove a usable screen.
timeout 15s adb exec-out screencap -p > evidence/first-launch.png
python3 -c "from pathlib import Path; p=Path('evidence/first-launch.png').read_bytes(); assert len(p) > 1000 and p[:8] == b'\x89PNG\r\n\x1a\n', 'Missing or invalid screenshot'"

{
  echo '## Runtrovert Android test environment'
  echo
  echo 'Installed and launched successfully on Android 15 / API 35 / x86_64.'
  echo "Source build: https://github.com/$GITHUB_REPOSITORY/actions/runs/$BUILD_RUN_ID"
  echo
  echo 'The APK was generated from that build’s App Bundle with a temporary emulator key.'
  echo 'See the evidence artifact for the actual screen, package details, logs and view hierarchy when available.'
  echo 'This verifies installation and initial launch only. Human usability and outdoor recording remain separate checks.'
} | tee evidence/result.md >> "$GITHUB_STEP_SUMMARY"
