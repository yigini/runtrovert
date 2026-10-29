# Music during a run

Runtrovert works with whatever music app the runner already uses, without logging in to it.

| | Android | iPhone |
|---|---|---|
| Open your music app from the run screen | yes (chosen app, or the phone's default) | yes (URL scheme) |
| Previous / play-pause / next | yes, as media-button presses (like headphones) | no: iOS doesn't let one app control another's playback |
| Show the song title | no (needs notification access) | no |
| Voice cues lower the music | yes (transient audio focus, may duck) | yes (audio session `duckOthers`) |

Code: `modules/runtrovert-music` (local Expo module, autolinked), `src/music.ts`, `src/components/MusicStrip.tsx`, Settings → Music.

## Why not the Spotify / YouTube Music / Apple Music SDKs

- Each needs a developer account and app registration with that service, and an OAuth login for the runner. That breaks "no accounts".
- Tokens are exchanged with their servers; Spotify's flow needs a token-swap server for refresh. We have no server.
- Each covers one service, so we'd maintain several integrations and still miss the runner's app.
- Apple Music control on iOS (`MPMusicPlayerController.systemMusicPlayer`) needs the media-library permission. We keep permissions to location and notifications.

What they'd add is browsing playlists inside our app. The media-button route already gives runners the controls they need mid-run, for every app.

## Later, if wanted

- Song title on Android via `NotificationListenerService`, strictly opt-in.
- Pause music when the run is paused (one more media-button press).
