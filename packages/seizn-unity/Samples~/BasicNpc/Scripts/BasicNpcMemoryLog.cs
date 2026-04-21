using System;
using System.Text;
using System.Threading.Tasks;
using Seizn;
using UnityEngine;
using UnityEngine.UI;

public sealed class BasicNpcMemoryLog : MonoBehaviour
{
    [Header("Seizn")]
    [SerializeField] private string apiKey = "";
    [SerializeField] private string baseUrl = SeiznClient.DefaultBaseUrl;
    [SerializeField] private string npcId = "archivist-vale";

    [Header("UI")]
    [SerializeField] private InputField playerLineInput;
    [SerializeField] private Text memoryLog;

    private SeiznClient client;
    private readonly StringBuilder log = new StringBuilder();

    private void Awake()
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            Append("Set a Seizn API key on BasicNpcMemoryLog before calling the sample buttons.");
            return;
        }

        client = new SeiznClient(apiKey, baseUrl);
        Append("Ready. Enter a player line, then call RememberPlayerLine from a UI Button.");
    }

    public async void RememberPlayerLine()
    {
        var line = playerLineInput != null ? playerLineInput.text : "Player gave Vale a brass key.";
        if (string.IsNullOrWhiteSpace(line) || client == null) return;

        try
        {
            var memory = await client.Memory.CreateAsync(npcId, line, tags: new[] { "unity", "sample" });
            Append($"Saved memory: {memory?.id ?? "(unknown id)"}");
        }
        catch (Exception ex)
        {
            Append($"Save failed: {ex.Message}");
        }
    }

    public async void SearchForKey()
    {
        try
        {
            if (client == null) return;
            var results = await client.Memory.SearchAsync(npcId, "key", limit: 5);
            Append($"Search returned {results.Length} memories.");
            foreach (var result in results)
            {
                Append($"- {result.content}");
            }
        }
        catch (Exception ex)
        {
            Append($"Search failed: {ex.Message}");
        }
    }

    public async void CheckCanon()
    {
        try
        {
            if (client == null) return;
            var verdict = await client.Canon.CheckAsync(npcId, "Vale reveals the sealed archive password.");
            Append($"Canon ok: {verdict?.ok ?? false}; locks checked: {verdict?.locksChecked ?? 0}");
        }
        catch (Exception ex)
        {
            Append($"Canon check failed: {ex.Message}");
        }
    }

    public void RememberWithCoroutine()
    {
        var line = playerLineInput != null ? playerLineInput.text : "Player asked about the archive.";
        if (client == null) return;
        StartCoroutine(client.Memory.CreateCoroutine(
            npcId,
            line,
            memory => Append($"Coroutine saved memory: {memory?.id ?? "(unknown id)"}"),
            error => Append($"Coroutine save failed: {error.Message}"),
            tags: new[] { "unity", "coroutine" }));
    }

    private void Append(string message)
    {
        log.AppendLine(message);
        if (memoryLog != null)
        {
            memoryLog.text = log.ToString();
        }
        Debug.Log($"[Seizn BasicNpc] {message}");
    }
}
