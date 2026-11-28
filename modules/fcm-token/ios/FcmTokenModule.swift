import ExpoModulesCore
import FirebaseCore
import FirebaseMessaging

/**
 Turns this iPhone's Apple push token into a Firebase Cloud Messaging token.

 Sougouba's server sends every notification through Firebase. On Android the
 token the system hands out *is* a Firebase one; on iOS the system hands out an
 Apple (APNs) token, and only Firebase's own library can trade it for a token
 Firebase will deliver to. That trade is all this module does.

 Deliberately nothing more. Firebase is never allowed to hook the app delegate
 (`FirebaseAppDelegateProxyEnabled` is off in `Info.plist`) or to stand between
 the system and `expo-notifications`: showing a notification, and knowing it was
 tapped, stay entirely where they were. The Apple token is passed in by hand,
 from `expo-notifications`, which is the one place that already receives it.
 */
public final class FcmTokenModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FcmToken")

    /**
     `apnsToken` is the Apple device token as hexadecimal — what
     `Notifications.getDevicePushTokenAsync()` returns on iOS.
     */
    AsyncFunction("exchange") { (apnsToken: String, promise: Promise) in
      guard let deviceToken = Data(hexadecimal: apnsToken) else {
        promise.reject("ERR_FCM_APNS_TOKEN", "The Apple push token is not hexadecimal.")
        return
      }

      if FirebaseApp.app() == nil {
        // `configure()` raises when the file is missing; a build made without
        // Firebase's file must fail this one call, not crash the app.
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
          promise.reject("ERR_FCM_NOT_CONFIGURED", "GoogleService-Info.plist is not in this build.")
          return
        }
        FirebaseApp.configure()
      }

      let messaging = Messaging.messaging()
      // `.unknown`: Firebase reads the provisioning profile to tell a
      // development build's token from a store build's.
      messaging.setAPNSToken(deviceToken, type: .unknown)
      messaging.token { token, error in
        if let token {
          promise.resolve(token)
        } else {
          promise.reject("ERR_FCM_TOKEN", error?.localizedDescription ?? "Firebase returned no token.")
        }
      }
    }
    .runOnQueue(.main)
  }
}

private extension Data {
  /// `"a1b2…"` → bytes. Nil for an odd length or a character that is not a hex digit.
  init?(hexadecimal: String) {
    let characters = Array(hexadecimal)
    guard !characters.isEmpty, characters.count % 2 == 0 else { return nil }

    var bytes = [UInt8]()
    bytes.reserveCapacity(characters.count / 2)
    for index in stride(from: 0, to: characters.count, by: 2) {
      guard let byte = UInt8(String(characters[index...index + 1]), radix: 16) else { return nil }
      bytes.append(byte)
    }
    self.init(bytes)
  }
}
