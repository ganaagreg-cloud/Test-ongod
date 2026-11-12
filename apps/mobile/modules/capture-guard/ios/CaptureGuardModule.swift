import ExpoModulesCore
import UIKit

let onCaptureChangeEventName = "onCaptureChange"

/// ADR-0094. iOS records the app's sound together with the picture when the screen is recorded or
/// mirrored, and no setting forbids that. So the app is told the moment recording starts and stops
/// (`UIScreen.capturedDidChangeNotification`) and pauses playback itself.
public final class CaptureGuardModule: Module {
  private var isObserving = false

  public func definition() -> ModuleDefinition {
    Name("CaptureGuard")

    Events(onCaptureChangeEventName)

    // True while the screen is recorded or mirrored (screen recording, AirPlay mirroring, a cable).
    AsyncFunction("isCaptured") { () -> Bool in
      return Self.isScreenCaptured()
    }.runOnQueue(.main)

    OnStartObserving {
      guard !self.isObserving else { return }
      self.isObserving = true
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.capturedDidChange),
        name: UIScreen.capturedDidChangeNotification,
        object: nil
      )
    }

    OnStopObserving {
      guard self.isObserving else { return }
      self.isObserving = false
      NotificationCenter.default.removeObserver(
        self,
        name: UIScreen.capturedDidChangeNotification,
        object: nil
      )
    }
  }

  @objc
  func capturedDidChange() {
    DispatchQueue.main.async {
      self.sendEvent(onCaptureChangeEventName, [
        "captured": Self.isScreenCaptured()
      ])
    }
  }

  /// Any connected screen being captured counts. Call on the main thread.
  private static func isScreenCaptured() -> Bool {
    return UIScreen.screens.contains { $0.isCaptured }
  }
}
