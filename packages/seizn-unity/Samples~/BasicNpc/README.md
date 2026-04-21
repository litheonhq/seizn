# Basic NPC Memory Sample

This sample targets Unity 2022.3 LTS and uses the built-in `UnityEngine.UI` package.

## Scene setup

1. Import the sample from Package Manager.
2. Open `Scenes/BasicNpc.unity`.
3. Select the `BasicNpc` object and paste a Seizn API key into `BasicNpcMemoryLog`.
4. Press Play.
5. Type a player line and call `RememberPlayerLine`, `SearchForKey`, or `CheckCanon` from the scene buttons.

The same script also exposes `RememberWithCoroutine` for codebases that do not use `async`/`await`.
