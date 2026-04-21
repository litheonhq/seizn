using System;
using System.Collections;
using System.Threading.Tasks;

namespace Seizn
{
    public sealed class SeiznMemoryApi
    {
        private readonly SeiznClient client;

        internal SeiznMemoryApi(SeiznClient client)
        {
            this.client = client;
        }

        public async Task<SeiznMemoryRecord> CreateAsync(
            string npcId,
            string content,
            string memoryType = "fact",
            string[] tags = null,
            string namespaceName = "default")
        {
            var request = new MemoryCreateRequest
            {
                content = content,
                agent_id = npcId,
                memory_type = string.IsNullOrWhiteSpace(memoryType) ? "fact" : memoryType,
                tags = tags ?? Array.Empty<string>(),
                @namespace = string.IsNullOrWhiteSpace(namespaceName) ? "default" : namespaceName,
                source = "unity-sdk",
            };
            var envelope = await client.RequestAsync<MemoryCreateEnvelope>("POST", "/api/v1/memories", request);
            return envelope?.data?.memory;
        }

        public async Task<SeiznMemoryRecord[]> SearchAsync(
            string npcId,
            string query,
            int limit = 10,
            string mode = "hybrid",
            string namespaceName = "default")
        {
            var path = "/api/v1/memories" + client.Query(
                ("query", query),
                ("agent_id", npcId),
                ("limit", Math.Max(1, Math.Min(100, limit)).ToString()),
                ("mode", mode),
                ("namespace", namespaceName));
            var envelope = await client.RequestAsync<MemoryListEnvelope>("GET", path);
            return envelope?.data?.memories ?? envelope?.data?.results ?? Array.Empty<SeiznMemoryRecord>();
        }

        public IEnumerator CreateCoroutine(
            string npcId,
            string content,
            Action<SeiznMemoryRecord> onSuccess,
            Action<SeiznException> onError,
            string memoryType = "fact",
            string[] tags = null,
            string namespaceName = "default")
        {
            var request = new MemoryCreateRequest
            {
                content = content,
                agent_id = npcId,
                memory_type = string.IsNullOrWhiteSpace(memoryType) ? "fact" : memoryType,
                tags = tags ?? Array.Empty<string>(),
                @namespace = string.IsNullOrWhiteSpace(namespaceName) ? "default" : namespaceName,
                source = "unity-sdk",
            };
            return client.RequestCoroutine<MemoryCreateEnvelope>(
                "POST",
                "/api/v1/memories",
                request,
                envelope => onSuccess?.Invoke(envelope?.data?.memory),
                onError);
        }

        public IEnumerator SearchCoroutine(
            string npcId,
            string query,
            Action<SeiznMemoryRecord[]> onSuccess,
            Action<SeiznException> onError,
            int limit = 10,
            string mode = "hybrid",
            string namespaceName = "default")
        {
            var path = "/api/v1/memories" + client.Query(
                ("query", query),
                ("agent_id", npcId),
                ("limit", Math.Max(1, Math.Min(100, limit)).ToString()),
                ("mode", mode),
                ("namespace", namespaceName));
            return client.RequestCoroutine<MemoryListEnvelope>(
                "GET",
                path,
                null,
                envelope => onSuccess?.Invoke(envelope?.data?.memories ?? envelope?.data?.results ?? Array.Empty<SeiznMemoryRecord>()),
                onError);
        }
    }

    [Serializable]
    public sealed class SeiznMemoryRecord
    {
        public string id;
        public string content;
        public string memory_type;
        public string[] tags;
        public string @namespace;
        public string agent_id;
        public int importance;
        public string created_at;
        public string updated_at;
    }

    [Serializable]
    internal sealed class MemoryCreateRequest
    {
        public string content;
        public string agent_id;
        public string memory_type;
        public string[] tags;
        public string @namespace;
        public string source;
    }

    [Serializable]
    internal sealed class MemoryCreateEnvelope
    {
        public bool success;
        public MemoryCreateData data;
    }

    [Serializable]
    internal sealed class MemoryCreateData
    {
        public SeiznMemoryRecord memory;
    }

    [Serializable]
    internal sealed class MemoryListEnvelope
    {
        public bool success;
        public MemoryListData data;
    }

    [Serializable]
    internal sealed class MemoryListData
    {
        public SeiznMemoryRecord[] memories;
        public SeiznMemoryRecord[] results;
    }
}
