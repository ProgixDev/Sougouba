// Firebase Cloud Messaging on iOS, kept as small as it can be.
//
// The server sends every notification through Firebase. An iPhone is only
// reachable that way once Firebase's own library has traded its Apple push
// token for a Firebase one — `modules/fcm-token` does that trade, and this
// plugin is what lets that module build and keeps Firebase out of everything
// else.
//
// Two things:
//
// 1. Module maps for Firebase's Objective-C pods. The app links its pods as
//    static libraries, and a Swift pod (FirebaseCoreInternal) can only import
//    an Objective-C one that defines a module. The usual answer —
//    `use_frameworks!` for the whole project — would also stop React Native
//    from using its precompiled build, which is what keeps a local build
//    short. Naming these six pods is narrower and leaves the rest alone.
//
// 2. `FirebaseAppDelegateProxyEnabled = false`. Left on, Firebase hooks the app
//    delegate to catch the Apple token and remote notifications itself. The
//    module hands it the token by hand instead, so `expo-notifications` stays
//    the only thing between the system and the app's notifications.
const { withInfoPlist, withPodfile } = require('expo/config-plugins');

const MARKER = '# firebase-messaging: module maps for Firebase\'s Objective-C pods (plugins/with-firebase-messaging.js)';
const MODULAR_PODS = ['GoogleUtilities', 'FirebaseCore', 'FirebaseCoreInternal', 'FirebaseInstallations', 'GoogleDataTransport', 'nanopb'];
const ANCHOR = '  use_expo_modules!\n';

module.exports = function withFirebaseMessaging(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.FirebaseAppDelegateProxyEnabled = false;
    return cfg;
  });

  return withPodfile(config, (cfg) => {
    let podfile = cfg.modResults.contents;
    if (podfile.includes(MARKER)) return cfg;
    if (!podfile.includes(ANCHOR)) {
      throw new Error('with-firebase-messaging: Podfile template changed (no `use_expo_modules!`), update the plugin');
    }
    const pods = MODULAR_PODS.map((pod) => `  pod '${pod}', :modular_headers => true`).join('\n');
    cfg.modResults.contents = podfile.replace(ANCHOR, `${ANCHOR}\n  ${MARKER}\n${pods}\n`);
    return cfg;
  });
};
