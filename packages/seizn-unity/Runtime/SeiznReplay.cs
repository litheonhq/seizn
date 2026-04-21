using System;
using System.Collections;
using System.Threading.Tasks;

namespace Seizn
{
    public sealed class SeiznReplayApi
    {
        private readonly SeiznClient client;

        internal SeiznReplayApi(SeiznClient client)
        {
            this.client = client;
        }

        public async Task<SeiznReplaySnapshot> FetchAsync(string traceId)
        {
            var envelope = await client.RequestAsync<ReplayEnvelope>("GET", $"/api/v1/replay/{traceId}");
            return envelope?.data?.snapshot;
        }

        public IEnumerator FetchCoroutine(
            string traceId,
            Action<SeiznReplaySnapshot> onSuccess,
            Action<SeiznException> onError)
        {
            return client.RequestCoroutine<ReplayEnvelope>(
                "GET",
                $"/api/v1/replay/{traceId}",
                null,
                envelope => onSuccess?.Invoke(envelope?.data?.snapshot),
                onError);
        }
    }

    [Serializable]
    public sealed class SeiznReplaySnapshot
    {
        public string id;
        public string trace_id;
        public string organization_id;
        public string started_at;
        public string completed_at;
        public string status;
    }

    [Serializable]
    internal sealed class ReplayEnvelope
    {
        public bool success;
        public ReplayData data;
    }

    [Serializable]
    internal sealed class ReplayData
    {
        public SeiznReplaySnapshot snapshot;
    }
}
