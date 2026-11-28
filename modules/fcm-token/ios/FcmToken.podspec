Pod::Spec.new do |s|
  s.name           = 'FcmToken'
  s.version        = '1.0.0'
  s.summary        = 'Turns an iPhone\'s Apple push token into a Firebase Cloud Messaging token.'
  s.description    = 'The one thing Sougouba needs from Firebase on iOS: a registration token the server can send to.'
  s.license        = 'UNLICENSED'
  s.author         = 'Progix'
  s.homepage       = 'https://sougouba.ca'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Messaging only — no Analytics, so nothing here reads the advertising identifier.
  s.dependency 'FirebaseMessaging'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
