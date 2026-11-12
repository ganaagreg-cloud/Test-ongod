package mn.zuvuutavuu.captureguard

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * ADR-0094. Android 10+ lets other apps (and the system screen recorder) record what this app
 * plays unless the app says no. `ALLOW_CAPTURE_BY_NONE` says no for every player in the app, so a
 * screen recording of the player has no sound. The picture is already black (FLAG_SECURE, ADR-0085).
 *
 * Android cannot tell an app that it is being recorded before Android 15, so `isCaptured` is always
 * false here and no event is sent: the block is the capture policy, not a pause.
 */
class CaptureGuardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CaptureGuard")

    Events("onCaptureChange")

    OnCreate {
      forbidAudioCapture()
    }

    AsyncFunction("isCaptured") {
      false
    }
  }

  private fun forbidAudioCapture() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    try {
      val audio = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      audio?.setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_NONE)
    } catch (error: Throwable) {
      Log.e("CaptureGuard", "Could not set the audio capture policy: ${error.message}")
    }
  }
}
