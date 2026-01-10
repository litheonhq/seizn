"""Seizn Async Python SDK Client."""

import httpx
from typing import List, Optional, Dict, Any, Union
import asyncio

from .types import (
    Memory,
    MemoryType,
    SearchResult,
    SearchMode,
    ExtractedMemory,
    QueryResponse,
    ConversationSummary,
    Webhook,
)


class SeiznAsyncError(Exception):
    """Base exception for Seizn async client errors."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class AsyncSeizn:
    """
    Async Seizn Memory API Client.

    Usage:
        async with AsyncSeizn(api_key="sk_...") as client:
            await client.add("User prefers TypeScript")
            results = await client.search("programming preferences")
    """

    DEFAULT_BASE_URL = "https://seizn.com"
    DEFAULT_RETRIES = 3
    DEFAULT_RETRY_DELAY = 1.0

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        retries: int = DEFAULT_RETRIES,
        retry_delay: float = DEFAULT_RETRY_DELAY,
    ):
        """
        Initialize the async Seizn client.

        Args:
            api_key: Your Seizn API key (starts with sk_)
            base_url: Override the API base URL (for testing)
            timeout: Request timeout in seconds
            retries: Number of retry attempts for transient failures
            retry_delay: Base delay between retries (exponential backoff)
        """
        self.api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.retry_delay = retry_delay
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={"X-API-Key": self.api_key},
                timeout=self.timeout,
            )
        return self._client

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        json: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API with retries."""
        client = await self._get_client()
        last_exception = None

        for attempt in range(self.retries):
            try:
                response = await client.request(method, path, params=params, json=json)

                if response.status_code >= 500:
                    # Server error - retry
                    raise SeiznAsyncError(f"Server error: {response.status_code}", response.status_code)

                if response.status_code >= 400:
                    # Client error - don't retry
                    try:
                        error_data = response.json()
                        message = error_data.get("error", response.text)
                    except Exception:
                        message = response.text
                    raise SeiznAsyncError(message, response.status_code)

                return response.json()

            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_exception = SeiznAsyncError(str(e))
                if attempt < self.retries - 1:
                    delay = self.retry_delay * (2 ** attempt)
                    await asyncio.sleep(delay)
                continue

            except SeiznAsyncError as e:
                if e.status_code and e.status_code >= 500:
                    last_exception = e
                    if attempt < self.retries - 1:
                        delay = self.retry_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                    continue
                raise

        if last_exception:
            raise last_exception
        raise SeiznAsyncError("Request failed after retries")

    # ==================== Memory Operations ====================

    async def add(
        self,
        content: str,
        memory_type: Union[MemoryType, str] = MemoryType.FACT,
        tags: Optional[List[str]] = None,
        namespace: str = "default",
        **kwargs,
    ) -> Memory:
        """Add a new memory."""
        data = {
            "content": content,
            "memory_type": memory_type.value if isinstance(memory_type, MemoryType) else memory_type,
            "tags": tags or [],
            "namespace": namespace,
            **kwargs,
        }
        result = await self._request("POST", "/api/memories", json=data)
        return Memory.from_dict(result["memory"])

    async def add_many(
        self,
        memories: List[Dict[str, Any]],
        namespace: str = "default",
    ) -> List[Memory]:
        """
        Add multiple memories in parallel.

        Args:
            memories: List of memory dicts with 'content', 'memory_type', 'tags'
            namespace: Default namespace for all memories

        Returns:
            List of created Memory objects
        """
        tasks = []
        for mem in memories:
            task = self.add(
                content=mem["content"],
                memory_type=mem.get("memory_type", "fact"),
                tags=mem.get("tags", []),
                namespace=mem.get("namespace", namespace),
            )
            tasks.append(task)
        return await asyncio.gather(*tasks)

    async def get(self, memory_id: str) -> Memory:
        """Get a specific memory by ID."""
        result = await self._request("GET", f"/api/memories/{memory_id}")
        return Memory.from_dict(result["memory"])

    async def update(
        self,
        memory_id: str,
        memory_type: Optional[Union[MemoryType, str]] = None,
        tags: Optional[List[str]] = None,
        importance: Optional[int] = None,
    ) -> Memory:
        """Update a memory."""
        data = {}
        if memory_type:
            data["memory_type"] = memory_type.value if isinstance(memory_type, MemoryType) else memory_type
        if tags is not None:
            data["tags"] = tags
        if importance is not None:
            data["importance"] = importance

        result = await self._request("PATCH", f"/api/memories/{memory_id}", json=data)
        return Memory.from_dict(result["memory"])

    async def delete(self, memory_id: str) -> bool:
        """Delete a memory."""
        await self._request("DELETE", f"/api/memories/{memory_id}")
        return True

    async def delete_many(self, memory_ids: List[str]) -> int:
        """Delete multiple memories."""
        result = await self._request("DELETE", "/api/memories", params={"ids": ",".join(memory_ids)})
        return result.get("deleted", 0)

    async def search(
        self,
        query: str,
        mode: Union[SearchMode, str] = SearchMode.VECTOR,
        limit: int = 10,
        threshold: float = 0.7,
        namespace: Optional[str] = None,
    ) -> List[SearchResult]:
        """Search memories."""
        params = {
            "query": query,
            "mode": mode.value if isinstance(mode, SearchMode) else mode,
            "limit": limit,
            "threshold": threshold,
        }
        if namespace:
            params["namespace"] = namespace

        result = await self._request("GET", "/api/memories", params=params)
        return [SearchResult.from_dict(r) for r in result.get("results", [])]

    # ==================== AI Operations ====================

    async def extract(
        self,
        conversation: str,
        model: str = "haiku",
        auto_store: bool = True,
        namespace: str = "default",
    ) -> List[ExtractedMemory]:
        """Extract memories from a conversation."""
        data = {
            "conversation": conversation,
            "model": model,
            "auto_store": auto_store,
            "namespace": namespace,
        }
        result = await self._request("POST", "/api/extract", json=data)
        return [ExtractedMemory.from_dict(m) for m in result.get("extracted", [])]


    async def extract_image(
        self,
        image: str,
        media_type: str = "image/png",
        model: str = "haiku",
        auto_store: bool = True,
        namespace: str = "default",
        context: Optional[str] = None,
    ) -> List[ExtractedMemory]:
        """
        Extract memories from an image using Claude Vision.

        Args:
            image: Base64 encoded image data
            media_type: Image MIME type (image/png, image/jpeg, image/gif, image/webp)
            model: AI model to use (haiku or sonnet)
            auto_store: Automatically store extracted memories
            namespace: Namespace for stored memories
            context: Optional context about the image

        Returns:
            List of ExtractedMemory objects
        """
        data = {
            "image": image,
            "media_type": media_type,
            "model": model,
            "auto_store": auto_store,
            "namespace": namespace,
        }
        if context:
            data["context"] = context

        result = await self._request("POST", "/api/extract/image", json=data)
        return [ExtractedMemory.from_dict(m) for m in result.get("extracted", [])]

    async def query(
        self,
        query: str,
        model: str = "haiku",
        top_k: int = 5,
        namespace: Optional[str] = None,
        include_memories: bool = True,
    ) -> QueryResponse:
        """Query with memory-augmented context (RAG)."""
        data = {
            "query": query,
            "model": model,
            "top_k": top_k,
            "include_memories": include_memories,
        }
        if namespace:
            data["namespace"] = namespace

        result = await self._request("POST", "/api/query", json=data)

        memories_used = []
        if include_memories and result.get("memories_used"):
            memories_used = [SearchResult.from_dict(m) for m in result["memories_used"]]

        return QueryResponse(
            response=result["response"],
            memories_used=memories_used,
            model_used=result.get("model_used", model),
        )

    async def summarize(
        self,
        messages: List[Dict[str, str]],
        model: str = "haiku",
        save_memories: bool = False,
        namespace: str = "default",
    ) -> ConversationSummary:
        """Summarize a conversation."""
        data = {
            "messages": messages,
            "model": model,
            "save_memories": save_memories,
            "namespace": namespace,
        }
        result = await self._request("POST", "/api/summarize", json=data)
        summary = result.get("summary", {})

        return ConversationSummary(
            text=summary.get("text", ""),
            topic=summary.get("topic", ""),
            key_points=summary.get("key_points", []),
            message_count=summary.get("message_count", 0),
        )

    # ==================== Export/Import Operations ====================

    async def export_memories(
        self,
        format: str = "json",
        namespace: Optional[str] = None,
        memory_type: Optional[str] = None,
        limit: int = 10000,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Export memories.

        Args:
            format: Export format (json or csv)
            namespace: Filter by namespace
            memory_type: Filter by memory type
            limit: Maximum memories to export (max 10000)
            offset: Pagination offset

        Returns:
            Dict with export metadata and memories (for json)
            or raw CSV string (for csv)
        """
        params = {
            "format": format,
            "limit": limit,
            "offset": offset,
        }
        if namespace:
            params["namespace"] = namespace
        if memory_type:
            params["memory_type"] = memory_type

        if format == "csv":
            client = await self._get_client()
            response = await client.request("GET", "/api/memories/export", params=params)
            if response.status_code >= 400:
                raise SeiznAsyncError(response.text, response.status_code)
            return {"csv": response.text}

        return await self._request("GET", "/api/memories/export", params=params)

    async def import_memories(
        self,
        memories: List[Dict[str, Any]],
        skip_duplicates: bool = True,
    ) -> Dict[str, Any]:
        """
        Import memories in bulk.

        Args:
            memories: List of memory dicts with 'content' (required),
                     'memory_type', 'tags', 'namespace', 'importance'
            skip_duplicates: Skip memories with duplicate content

        Returns:
            Dict with import results (imported, skipped, failed counts)
        """
        data = {
            "memories": memories,
            "skip_duplicates": skip_duplicates,
        }
        return await self._request("POST", "/api/memories/import", json=data)

    # ==================== Webhook Operations ====================

    async def list_webhooks(self) -> List[Webhook]:
        """List all webhooks."""
        result = await self._request("GET", "/api/webhooks")
        return [Webhook.from_dict(w) for w in result.get("webhooks", [])]

    async def create_webhook(
        self,
        name: str,
        url: str,
        events: Optional[List[str]] = None,
        namespace: Optional[str] = None,
    ) -> Webhook:
        """Create a webhook."""
        data = {
            "name": name,
            "url": url,
            "events": events or ["memory.created"],
        }
        if namespace:
            data["namespace"] = namespace

        result = await self._request("POST", "/api/webhooks", json=data)
        return Webhook.from_dict(result["webhook"])

    async def delete_webhook(self, webhook_id: str) -> bool:
        """Delete a webhook."""
        await self._request("DELETE", "/api/webhooks", params={"id": webhook_id})
        return True

    # ==================== Context Manager ====================

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
