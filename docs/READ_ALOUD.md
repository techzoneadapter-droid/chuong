# CHƯƠNG — Phase 4N Reader & Read Aloud

Phase 4N turns the previous audio mock into a real on-device text-to-speech experience and hardens reader interaction.

## Real text-to-speech

CHƯƠNG uses `expo-speech ~14.0.8`, the Expo SDK 54 compatible Speech package.

No paid AI/TTS API is required for normal read-aloud.

The player:

- reads the actual current chapter text
- prefers Vietnamese voices exposed by the device
- supports 0.75x, 1x, 1.25x, 1.5x and 2x speed
- supports two user-facing voice preferences (Nam / Nữ)
- exposes the actual selected system voice name
- degrades safely when the device exposes only one Vietnamese voice
- splits long chapters into short speech segments instead of sending a whole chapter to the speech engine
- handles `onDone`, `onStopped` and errors so stopping playback cannot leave an unresolved player
- supports approximate ±15 second seek by moving through speech segments
- supports direct progress-bar seeking
- supports previous/next chapter controls
- can automatically continue into the next chapter
- supports sleep timers:
  - 15 minutes
  - 30 minutes
  - 60 minutes
  - end of chapter
- persists speed, voice preference, sleep timer and auto-next locally
- feeds listening progress back into the normal reading-progress path

The system does **not** claim guaranteed male/female timbre because Expo/device voice metadata does not expose a reliable cross-platform gender field. Nam/Nữ are preferences used to select among available Vietnamese system voices; the UI shows the actual selected voice name.

## Reader improvements

Reader now also includes:

- a live chapter progress line in the top bar
- horizontal swipe gestures in page mode
- page mode disables vertical scrolling
- saved reading progress restores the approximate page
- page mode and scroll mode continue sharing the same persisted reader settings
- audio progress and normal reading progress use the same chapter progress percentage

## Platform notes

Expo Speech supports Android, iOS and Web.

On iOS physical devices, system speech may be silent while the device silent switch is enabled. This is a platform limitation of Expo Speech, not an application error.

Available voices depend on the OS and installed TTS/voice packs. Android users may need a Vietnamese voice installed in their system Text-to-Speech settings for the best result.

## QA before production

Automated web CI checks the controls and persisted TTS settings, but native audio still requires device QA.

Before release, verify on at least one Android device:

1. Vietnamese speech plays from a real catalog chapter.
2. Pause/continue works without hanging.
3. ±15 second controls move the approximate listening position.
4. Changing speed while playing restarts cleanly at the current segment.
5. Changing voice while playing restarts cleanly.
6. Sleep timer stops playback.
7. End-of-chapter mode does not auto-advance.
8. Auto-next advances to the next published chapter.
9. Returning to the same chapter restores reading/listening progress.
10. Incoming audio interruptions/headphone changes do not crash Reader.

For iOS, also verify the device is not in silent mode when testing speech.
