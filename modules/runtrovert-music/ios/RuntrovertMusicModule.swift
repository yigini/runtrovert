import AVFoundation
import ExpoModulesCore

/**
 * iOS does not let one app press play or skip in another (only Apple Music,
 * and that needs a media-library permission we don't want). So on iPhone we
 * only know whether something is playing, open your music app by URL from JS,
 * and duck the music while a voice cue speaks.
 */
public class RuntrovertMusicModule: Module {
  private var ducking = false

  public func definition() -> ModuleDefinition {
    Name("RuntrovertMusic")

    Constant("canControl") { false }

    Function("isPlaying") { () -> Bool in
      return AVAudioSession.sharedInstance().isOtherAudioPlaying
    }

    Function("send") { (_: String) -> Bool in
      return false
    }

    Function("duck") { (on: Bool) -> Bool in
      if on == self.ducking { return true }
      self.ducking = on
      let session = AVAudioSession.sharedInstance()
      do {
        if on {
          try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .mixWithOthers])
          try session.setActive(true)
        } else {
          try session.setActive(false, options: .notifyOthersOnDeactivation)
          try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        }
        return true
      } catch {
        return false
      }
    }
  }
}
