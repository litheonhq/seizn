# Seizn Unity SDK

Unity 2022.3 LTS source package for Seizn NPC memory, Canon Lock checks, and replay fetches.

## Install

1. In Unity, open **Window > Package Manager**.
2. Choose **Add package from git URL**.
3. Enter:

```text
https://github.com/litheonhq/seizn.git?path=/packages/seizn-unity
```

4. Open **Window > Seizn > Settings** and save your API key. The editor setting is stored at `ProjectSettings/Seizn.asset`; do not commit that file with a live key.

## Async usage

```csharp
using Seizn;

var client = new SeiznClient(apiKey);
var memory = await client.Memory.CreateAsync(npcId, "Player gave me a sword");
var results = await client.Memory.SearchAsync(npcId, "sword", limit: 10);
var verdict = await client.Canon.CheckAsync(npcId, "I reveal the forbidden password.");
```

## Coroutine usage

```csharp
StartCoroutine(client.Memory.CreateCoroutine(
    npcId,
    "Player gave me a sword",
    memory => Debug.Log(memory.id),
    error => Debug.LogError(error.Message)));
```

## Replay

```csharp
var snapshot = await client.Replay.FetchAsync(traceId);
Debug.Log(snapshot.status);
```

## Sample

Import **Basic NPC Memory** from the package samples. Open `Scenes/BasicNpc.unity`, select the `BasicNpc` object, attach `BasicNpcMemoryLog` if needed, paste your API key, and press Play.

## Manual final steps

Actual `.unitypackage` compilation and Unity Asset Store submission are intentionally not automated in this repository. After source review, export the imported package from Unity and submit it through the user's Asset Store publisher account.
