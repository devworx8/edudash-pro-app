const {
  withAndroidManifest,
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

const withAndroidPlayCompatibility = (config) => {
  config = withGradleProperties(config, (gradleConfig) => {
    // NDK r27+ produces 16 KB-aligned ELF segments for newly compiled native code.
    upsertGradleProperty(gradleConfig.modResults, 'android.ndkVersion', '27.2.12479018');
    return gradleConfig;
  });

  return withAndroidManifest(config, (manifestConfig) => {
    const androidManifest = manifestConfig.modResults;
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = androidManifest.manifest.application?.[0];
    if (!application) {
      return manifestConfig;
    }

    ensureActivityOrientationCompatibility(application);
    return manifestConfig;
  });
};

module.exports = withAndroidPlayCompatibility;
