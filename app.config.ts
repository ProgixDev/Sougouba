import type { ExpoConfig } from 'expo/config';

/**
 * Config as code, not JSON.
 *
 * The Mapbox native SDK is fetched at build time behind a *secret* download
 * token, and the `@rnmapbox/maps` plugin wants it as a plugin option. In
 * `app.json` that would mean committing an `sk.…` credential. Here it comes from
 * the environment (`.env`, gitignored — see `.env.example`), and the file that
 * ships in the repo names it without carrying it.
 */
const config = {
  name: 'Sougouba',
  slug: 'sougouba',
  version: '1.0.0',
  scheme: 'sougouba',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#FAF9F7',
  // Not in the `ExpoConfig` type in this SDK, but read by prebuild — the app has
  // shipped on the new architecture since before this file was TypeScript.
  newArchEnabled: true,
  experiments: {
    typedRoutes: true,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'pro.progix.sougouba',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'pro.progix.sougouba',
    adaptiveIcon: {
      backgroundColor: '#1C5439',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['android.permission.RECORD_AUDIO'],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 260,
        resizeMode: 'contain',
        backgroundColor: '#FAF9F7',
      },
    ],
    'expo-font',
    'expo-image',
    'expo-video',
    'expo-web-browser',
    [
      'expo-image-picker',
      {
        photosPermission:
          "Sougouba a besoin d'accéder à vos photos pour votre photo de profil et vos images de produits.",
      },
    ],
    // No `RNMapboxMapsDownloadToken` option: the plugin deprecated it precisely
    // because it copies the secret into `gradle.properties`, which is one bad
    // `git add` away from publishing it. It reads `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`
    // from the environment instead, so the credential stays in `.env`.
    // The build fails with a 401 from Mapbox's Maven/CocoaPods repo when it is
    // missing, which reads as a network error rather than a missing credential.
    '@rnmapbox/maps',
    [
      'expo-location',
      {
        // Foreground only. A courier's position is needed while they are looking
        // at the app, and asking for "always" would be asking for a permission
        // the delivery flow never uses.
        locationWhenInUsePermission:
          'Sougouba utilise votre position pour vous proposer les livraisons proches et vous guider pendant vos courses.',
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: 'e6a4ddb9-c49d-45c6-a211-d34bc3f28113',
    },
  },
  owner: 'mohameddev7',
};

// `newArchEnabled` is read by prebuild but absent from `ExpoConfig` in this SDK,
// so the object is widened once here rather than annotated — an annotation would
// reject the extra key, and dropping the key would silently turn the new
// architecture off.
export default config as unknown as ExpoConfig;
