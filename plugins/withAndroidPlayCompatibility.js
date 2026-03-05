const {
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
} = require('@expo/config-plugins');

function upsertGradleProperty(modResults, key, value) {
  const existing = modResults.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return;
  }
  modResults.push({ type: 'property', key, value });
}

function mergeToolsReplace(existingValue, neededAttrs) {
  const current = String(existingValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const next = new Set([...current, ...neededAttrs]);
  return Array.from(next).join(',');
}

function ensureActivityOrientationCompatibility(application) {
  if (!application.activity) {
    application.activity = [];
  }

  const upsertActivity = (activityName) => {
    let activity = application.activity.find((item) => item.$?.['android:name'] === activityName);
    if (!activity) {
      activity = { $: { 'android:name': activityName } };
      application.activity.push(activity);
    }

    activity.$['android:screenOrientation'] = 'unspecified';
    activity.$['android:resizeableActivity'] = 'true';
    activity.$['tools:replace'] = mergeToolsReplace(activity.$['tools:replace'], [
      'android:screenOrientation',
      'android:resizeableActivity',
    ]);
  };

  // Main activity warning from Play Console
  upsertActivity('.MainActivity');
  // MLKit barcode delegate activity warning from Play Console
  upsertActivity('com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity');
}

/**
 * Ensures native libraries (.so files) are extracted to disk at install time.
 * Works for both Groovy DSL and Kotlin DSL build.gradle files.
 *
 * This is the Google-recommended workaround for the "does not support 16 KB memory
 * page sizes" Play Console error when third-party libraries (WebRTC, Firebase,
 * Azure Speech SDK, Daily.co, etc.) ship pre-built .so files with 4 KB ELF alignment.
 *
 * Without this, libraries are memory-mapped directly from the APK and must be
 * 16 KB-aligned in both ELF segments AND ZIP offsets — requirements that many
 * pre-built SDKs do not yet meet.
 *
 * With useLegacyPackaging=true / extractNativeLibs=true, .so files are stored
 * compressed in the APK and extracted to the filesystem at install, bypassing the
 * 16 KB ZIP-alignment requirement.
 */
function ensureLegacyPackagingForNativeLibs(buildGradle) {
  const isKotlin = buildGradle.modResults.language === 'kt';

  if (isKotlin) {
    // Kotlin DSL: packaging { jniLibs { useLegacyPackaging = true } }
    const markerRegex =
      /packaging\s*\{[\s\S]*?jniLibs\s*\{[\s\S]*?useLegacyPackaging\s*=\s*true[\s\S]*?\}[\s\S]*?\}/m;
    if (markerRegex.test(buildGradle.modResults.contents)) {
      return buildGradle;
    }
    buildGradle.modResults.contents = buildGradle.modResults.contents.replace(
      /android\s*\{/,
      'android {\n    packaging {\n        jniLibs {\n            useLegacyPackaging = true\n        }\n    }'
    );
  } else {
    // Groovy DSL: packaging { jniLibs { useLegacyPackaging true } }
    const markerRegex =
      /packaging\s*\{[\s\S]*?jniLibs\s*\{[\s\S]*?useLegacyPackaging\s+true[\s\S]*?\}[\s\S]*?\}/m;
    if (markerRegex.test(buildGradle.modResults.contents)) {
      return buildGradle;
    }
    // Also accept the deprecated packagingOptions block (no-op if already present)
    const legacyMarkerRegex =
      /packagingOptions\s*\{[\s\S]*?jniLibs\s*\{[\s\S]*?useLegacyPackaging\s+true[\s\S]*?\}[\s\S]*?\}/m;
    if (legacyMarkerRegex.test(buildGradle.modResults.contents)) {
      return buildGradle;
    }
    buildGradle.modResults.contents = buildGradle.modResults.contents.replace(
      /android\s*\{/,
      'android {\n    packaging {\n        jniLibs {\n            useLegacyPackaging true\n        }\n    }'
    );
  }

  return buildGradle;
}

const withAndroidPlayCompatibility = (config) => {
  config = withGradleProperties(config, (gradleConfig) => {
    // NDK r27+ produces 16 KB-aligned ELF segments for newly compiled native code.
    upsertGradleProperty(gradleConfig.modResults, 'android.ndkVersion', '27.2.12479018');
    return gradleConfig;
  });

  config = withAppBuildGradle(config, ensureLegacyPackagingForNativeLibs);

  return withAndroidManifest(config, (manifestConfig) => {
    const androidManifest = manifestConfig.modResults;
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = androidManifest.manifest.application?.[0];
    if (!application) {
      return manifestConfig;
    }

    // CRITICAL FIX: Tell Android to always extract .so files to the filesystem
    // during installation instead of memory-mapping them directly from the APK.
    //
    // This is the official Google workaround for the Play Console error:
    // "Your app does not support 16 KB memory page sizes"
    //
    // Many third-party SDKs (WebRTC, Firebase, Azure Speech, Daily.co) ship
    // pre-built .so files with 4 KB ELF segment alignment. Memory-mapping
    // requires 16 KB alignment in both the ELF file and ZIP offset. Extracting
    // to the filesystem lets the OS place the library at any alignment.
    //
    // Reference: https://developer.android.com/guide/practices/page-sizes
    application.$['android:extractNativeLibs'] = 'true';

    ensureActivityOrientationCompatibility(application);
    return manifestConfig;
  });
};

module.exports = withAndroidPlayCompatibility;
