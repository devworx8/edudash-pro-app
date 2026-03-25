/**
 * Config plugin to write google-services.json from EAS secret
 * This allows us to keep the file out of git while still using it in EAS builds
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withGoogleServices = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const googleServicesEnv = process.env.GOOGLE_SERVICES_JSON;
      
      if (!googleServicesEnv) {
        console.warn(
          '⚠️ GOOGLE_SERVICES_JSON environment variable not set. ' +
          'Firebase/FCM features may not work correctly.'
        );
        return config;
      }

      const projectRoot = config.modRequest.projectRoot;
      const androidAppDir = path.join(projectRoot, 'android', 'app');
      
      // Ensure the directory exists
      if (!fs.existsSync(androidAppDir)) {
        fs.mkdirSync(androidAppDir, { recursive: true });
      }

      const googleServicesPath = path.join(androidAppDir, 'google-services.json');
      
      try {
        // GOOGLE_SERVICES_JSON can be either:
        // - A file path (EAS file secret) e.g. "/eas-environment-secrets/abc123"
        // - Raw JSON content (manual env var)
        let content;
        if (fs.existsSync(googleServicesEnv)) {
          content = fs.readFileSync(googleServicesEnv, 'utf8');
          console.log('📄 Read google-services.json from file secret path');
        } else {
          content = googleServicesEnv;
          console.log('📄 Using google-services.json from env var content');
        }

        // For dev builds, add the .dev package name so processDebugGoogleServices finds a match
        const appVariant = process.env.APP_VARIANT || '';
        const buildProfile = process.env.EAS_BUILD_PROFILE || '';
        const isDevBuild = buildProfile === 'development' || appVariant === 'development';

        if (isDevBuild) {
          const parsed = JSON.parse(content);
          const devPkg = 'com.edudashpro.app.dev';
          const hasDevClient = parsed.client?.some(
            (c) => c.client_info?.android_client_info?.package_name === devPkg
          );
          if (!hasDevClient && parsed.client?.length > 0) {
            // Clone the first client entry and change its package name to the dev variant
            const devClient = JSON.parse(JSON.stringify(parsed.client[0]));
            devClient.client_info.android_client_info.package_name = devPkg;
            parsed.client.push(devClient);
            content = JSON.stringify(parsed, null, 2);
            console.log(`✅ Added ${devPkg} client to google-services.json for dev build`);
          }
        }

        fs.writeFileSync(googleServicesPath, content, 'utf8');
        console.log('✅ google-services.json written successfully');
      } catch (error) {
        console.error('❌ Failed to write google-services.json:', error.message);
      }

      return config;
    },
  ]);
};

module.exports = withGoogleServices;
