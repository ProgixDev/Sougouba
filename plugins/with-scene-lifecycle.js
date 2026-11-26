// iOS 27 kills any app at launch that hasn't adopted the UIScene life cycle.
// Expo ships `ExpoAppSceneDelegate` for this, but the prebuild template still
// creates the window in the app delegate, so this plugin wires it up: the
// scene manifest names the delegate, and `AppDelegate` keeps building the React
// Native factory but leaves the window to the scene.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const WINDOW_SETUP = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle: expected a Swift AppDelegate');
    }
    let src = cfg.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      );
    }
    src = src.replace(WINDOW_SETUP, '\n');
    if (!src.includes('ExpoReactNativeFactoryProvider') || WINDOW_SETUP.test(src)) {
      throw new Error('with-scene-lifecycle: AppDelegate template changed, update the plugin');
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
