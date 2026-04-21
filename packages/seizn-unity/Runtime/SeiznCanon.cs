using System;
using System.Collections;
using System.Threading.Tasks;

namespace Seizn
{
    public sealed class SeiznCanonApi
    {
        private readonly SeiznClient client;

        internal SeiznCanonApi(SeiznClient client)
        {
            this.client = client;
        }

        public async Task<SeiznCanonCheckResult> CheckAsync(string npcId, string proposedLine)
        {
            var request = new CanonCheckRequest
            {
                npc_id = npcId,
                proposed_content = proposedLine,
            };
            var envelope = await client.RequestAsync<CanonCheckEnvelope>("POST", "/api/canon/check", request);
            return envelope?.data;
        }

        public IEnumerator CheckCoroutine(
            string npcId,
            string proposedLine,
            Action<SeiznCanonCheckResult> onSuccess,
            Action<SeiznException> onError)
        {
            var request = new CanonCheckRequest
            {
                npc_id = npcId,
                proposed_content = proposedLine,
            };
            return client.RequestCoroutine<CanonCheckEnvelope>(
                "POST",
                "/api/canon/check",
                request,
                envelope => onSuccess?.Invoke(envelope?.data),
                onError);
        }
    }

    [Serializable]
    public sealed class SeiznCanonCheckResult
    {
        public bool ok;
        public string npcId;
        public int locksChecked;
        public string verdict;
        public SeiznCanonViolation violation;
    }

    [Serializable]
    public sealed class SeiznCanonViolation
    {
        public string lockId;
        public string statement;
        public string severity;
        public string excerpt;
    }

    [Serializable]
    internal sealed class CanonCheckRequest
    {
        public string npc_id;
        public string proposed_content;
    }

    [Serializable]
    internal sealed class CanonCheckEnvelope
    {
        public bool success;
        public SeiznCanonCheckResult data;
    }
}
