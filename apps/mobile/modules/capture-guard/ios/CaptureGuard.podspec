Pod::Spec.new do |s|
  s.name           = 'CaptureGuard'
  s.version        = '1.0.0'
  s.summary        = 'Screen recording detection for the player (ADR-0094)'
  s.description    = 'Tells the app when the screen is being recorded or mirrored, so playback can pause.'
  s.license        = 'UNLICENSED'
  s.author         = 'zuvuutavuu'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
