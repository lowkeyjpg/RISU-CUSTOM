#!/usr/bin/env bash
# Build the web bundle first with pnpm run buildsite, then package the pinned files.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_JAR:?Set ANDROID_JAR to platforms/android-35/android.jar}"
: "${BUILD_TOOLS:?Set BUILD_TOOLS to Android build-tools 35.0.0}"
: "${SIGNING_KEYSTORE:?Supply the DEV keystore outside this repository}"
: "${SIGNING_PASSWORD_FILE:?Supply a private password file outside this repository}"
test -f dist/index.html
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
mkdir -p "$out/classes" "$out/dex" "$out/assets/web"
cp -R dist/. "$out/assets/web/"
cp LICENSE "$out/assets/web/LICENSE.txt"
if [[ -n "${ECJ_JAR:-}" ]]; then
    java -jar "$ECJ_JAR" -nowarn -source 1.8 -target 1.8 -bootclasspath "$ANDROID_JAR:$BUILD_TOOLS/core-lambda-stubs.jar" -d "$out/classes" android-dev/java/*.java
else
    javac -source 8 -target 8 -bootclasspath "$ANDROID_JAR:$BUILD_TOOLS/core-lambda-stubs.jar" -d "$out/classes" android-dev/java/*.java
fi
(cd "$out/classes" && zip -q -r "$out/classes.jar" .)
"$BUILD_TOOLS/d8" --min-api 29 --lib "$ANDROID_JAR" --output "$out/dex" "$out/classes.jar"
"$BUILD_TOOLS/aapt2" compile --dir android-dev/res -o "$out/resources.zip"
"$BUILD_TOOLS/aapt2" link -I "$ANDROID_JAR" --manifest android-dev/AndroidManifest.xml -R "$out/resources.zip" --auto-add-overlay -o "$out/app.apk"
(cd "$out" && zip -q -r app.apk assets)
(cd "$out/dex" && zip -q "$out/app.apk" classes.dex)
"$BUILD_TOOLS/zipalign" -f 4 "$out/app.apk" "$out/aligned.apk"
mkdir -p build
"$BUILD_TOOLS/apksigner" sign --ks "$SIGNING_KEYSTORE" --ks-pass "file:$SIGNING_PASSWORD_FILE" --out build/RISU-CUSTOM-DEV-v0.4.1.apk "$out/aligned.apk"
"$BUILD_TOOLS/apksigner" verify --verbose build/RISU-CUSTOM-DEV-v0.4.1.apk
