using System;
using System.Collections;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Seizn
{
    public sealed class SeiznClient
    {
        public const string DefaultBaseUrl = "https://www.seizn.com";

        private readonly string apiKey;
        private readonly string baseUrl;

        public SeiznMemoryApi Memory { get; }
        public SeiznCanonApi Canon { get; }
        public SeiznReplayApi Replay { get; }

        public SeiznClient(string apiKey, string baseUrl = DefaultBaseUrl)
        {
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new ArgumentException("A Seizn API key is required.", nameof(apiKey));
            }

            this.apiKey = apiKey.Trim();
            this.baseUrl = (string.IsNullOrWhiteSpace(baseUrl) ? DefaultBaseUrl : baseUrl).TrimEnd('/');
            Memory = new SeiznMemoryApi(this);
            Canon = new SeiznCanonApi(this);
            Replay = new SeiznReplayApi(this);
        }

        internal async Task<TResponse> RequestAsync<TResponse>(string method, string path, object payload = null)
        {
            using var request = CreateRequest(method, path, payload);
            var operation = request.SendWebRequest();
            var completion = new TaskCompletionSource<bool>();
            operation.completed += _ => completion.TrySetResult(true);
            await completion.Task;

            if (request.result != UnityWebRequest.Result.Success)
            {
                throw new SeiznException(request.responseCode, request.error, request.downloadHandler?.text);
            }

            var body = request.downloadHandler?.text ?? "{}";
            return JsonUtility.FromJson<TResponse>(body);
        }

        internal IEnumerator RequestCoroutine<TResponse>(
            string method,
            string path,
            object payload,
            Action<TResponse> onSuccess,
            Action<SeiznException> onError)
        {
            using var request = CreateRequest(method, path, payload);
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke(new SeiznException(request.responseCode, request.error, request.downloadHandler?.text));
                yield break;
            }

            var body = request.downloadHandler?.text ?? "{}";
            onSuccess?.Invoke(JsonUtility.FromJson<TResponse>(body));
        }

        internal string Query(params (string Key, string Value)[] parameters)
        {
            var builder = new StringBuilder();
            foreach (var parameter in parameters)
            {
                if (string.IsNullOrWhiteSpace(parameter.Value)) continue;
                builder.Append(builder.Length == 0 ? '?' : '&');
                builder.Append(UnityWebRequest.EscapeURL(parameter.Key));
                builder.Append('=');
                builder.Append(UnityWebRequest.EscapeURL(parameter.Value));
            }

            return builder.ToString();
        }

        private UnityWebRequest CreateRequest(string method, string path, object payload)
        {
            var request = new UnityWebRequest($"{baseUrl}{path}", method)
            {
                downloadHandler = new DownloadHandlerBuffer(),
            };

            if (payload != null)
            {
                var json = JsonUtility.ToJson(payload);
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
                request.SetRequestHeader("Content-Type", "application/json");
            }

            request.SetRequestHeader("Accept", "application/json");
            request.SetRequestHeader("Authorization", $"Bearer {apiKey}");
            return request;
        }
    }

    public sealed class SeiznException : Exception
    {
        public long StatusCode { get; }
        public string ResponseBody { get; }

        public SeiznException(long statusCode, string message, string responseBody)
            : base($"Seizn request failed ({statusCode}): {message}")
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
        }
    }
}
