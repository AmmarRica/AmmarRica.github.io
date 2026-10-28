#!/usr/bin/env bash
# Wraps /tilt-seq/ in a Capacitor Android shell and builds an installable APK.
# Usage: .github/tilt-seq/build-apk.sh [versionCode]   ->  build/tilt-seq.apk
# Needs Node 20+, JDK 21 and the Android SDK (ANDROID_HOME).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/.github/tilt-seq"
APP="$ROOT/build/tilt-seq-app"
VC="${1:-1}"

rm -rf "$APP" && mkdir -p "$APP" && cd "$APP"
npm init -y >/dev/null
npm i --no-audit --no-fund @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7 @capacitor/filesystem@7 @capacitor/share@7
mkdir www && cp -r "$ROOT/tilt-seq/." www/
cat > capacitor.config.json <<'JSON'
{ "appId": "io.github.ammarrica.tiltseq", "appName": "Tilt Seq", "webDir": "www",
  "android": { "backgroundColor": "#0d0e10" } }
JSON
npx cap add android

# app icon from the site icon (best effort: default Capacitor icon if this fails)
mkdir -p assets && cp "$HERE/icon-1024.png" assets/icon-only.png
npx --yes @capacitor/assets@3 generate --android \
  --iconBackgroundColor '#2b2e33' --iconBackgroundColorDark '#2b2e33' \
  --splashBackgroundColor '#0d0e10' --splashBackgroundColorDark '#0d0e10' || echo "icon generation skipped"

npx cap sync android

# portrait only (tilt is read in portrait), version from the CI run number
sed -i 's/<activity/<activity android:screenOrientation="portrait"/' android/app/src/main/AndroidManifest.xml
sed -i -E "s/versionCode [0-9]+/versionCode $VC/; s/versionName \"[^\"]*\"/versionName \"1.$VC\"/" android/app/build.gradle

# Optional stable signing key (repo secret TILTSEQ_KEYSTORE_B64 = base64 of a debug.keystore,
# password "android"): lets each new APK install over the previous one. Without it a fresh
# debug key is used, so updating means uninstalling the old app first.
if [ -n "${TILTSEQ_KEYSTORE_B64:-}" ]; then
  mkdir -p "$HOME/.android" && echo "$TILTSEQ_KEYSTORE_B64" | base64 -d > "$HOME/.android/debug.keystore"
fi

if [ -n "${SKIP_GRADLE:-}" ]; then echo "scaffold ok (gradle skipped)"; exit 0; fi
(cd android && ./gradlew assembleDebug --no-daemon -q)
cp android/app/build/outputs/apk/debug/app-debug.apk "$ROOT/build/tilt-seq.apk"
echo "built $ROOT/build/tilt-seq.apk"
