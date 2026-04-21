# Unity Quickstart

Seizn ships a source-first Unity package at `packages/seizn-unity`. It targets Unity 2022.3 LTS and uses `UnityWebRequest`, so no third-party Unity dependencies are required.

## Install with UPM

In Unity Package Manager, choose **Add package from git URL**:

```text
https://github.com/litheonhq/seizn.git?path=/packages/seizn-unity
```

Then open **Window > Seizn > Settings** and save:

- API key
- Base URL, normally `https://www.seizn.com`
- Default NPC ID for samples

The editor config is stored at `ProjectSettings/Seizn.asset`. Do not commit this file when it contains a live key.

## Async API

```csharp
using Seizn;

var client = new SeiznClient(apiKey);
var memory = await client.Memory.CreateAsync(npcId, "Player gave me a sword");
var results = await client.Memory.SearchAsync(npcId, "sword", limit: 10);
var verdict = await client.Canon.CheckAsync(npcId, "I reveal the forbidden password.");
var replay = await client.Replay.FetchAsync(traceId);
```

## Coroutine API

For projects that avoid `async`/`await`, every major call includes a coroutine form:

```csharp
StartCoroutine(client.Memory.SearchCoroutine(
    npcId,
    "sword",
    results => Debug.Log($"Returned {results.Length} memories"),
    error => Debug.LogError(error.Message)));
```

## Sample Scene

Import the **Basic NPC Memory** sample from Package Manager. The sample includes:

- `BasicNpc` prefab
- `Scenes/BasicNpc.unity`
- `BasicNpcMemoryLog` MonoBehaviour
- simple Unity UI hooks for create/search/canon calls

Paste a live Seizn API key into the sample component before pressing Play.

## Final Packaging Steps

Blocked/manual items:

- Exporting an actual `.unitypackage`
- Testing inside the user's Unity publisher account
- Unity Asset Store upload and review submission

Those steps require local Unity Editor access and the user's publisher credentials.
