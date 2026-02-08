"""Seizn Python SDK Client."""

import httpx
from typing import List, Optional, Dict, Any, Union

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
from .spring import SpringMixin


class SeiznError(Exception):
    """Base exception for Seizn errors."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class Seizn(SpringMixin):
    """
    Seizn Memory API Client.

    Usage:
        client = Seizn(api_key="szn_...")
        client.add("User prefers TypeScript")
        results = client.search("programming preferences")
    """

    DEFAULT_BASE_URL = "https://www.seizn.com"

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self._client = httpx.Client(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        json: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API."""
        response = self._client.request(method, path, params=params, json=json)

        if response.status_code >= 400:
            try:
                error_data = response.json()
                message = error_data.get("error", response.text)
            except Exception:
                message = response.text
            raise SeiznError(message, response.status_code)

        return response.json()

    # ==================== Memory Operations ====================

    def add(
        self,
        content: str,
        memory_type: Union[MemoryType, str] = MemoryType.FACT,
        tags: Optional[List[str]] = None,
        namespace: str = "default",
        **kwargs,
    ) -> Memory:
        """
        Add a new memory.

        Args:
            content: The memory content
            memory_type: Type of memory (fact, preference, etc.)
            tags: Optional tags for categorization
            namespace: Namespace for organization
            **kwargs: Additional fields (scope, session_id, agent_id, source)
        """
        data = {
            "content": content,
            "memory_type": memory_type.value
            if isinstance(memory_type, MemoryType)
            else memory_type,
            "tags": tags or [],
            "namespace": namespace,
            **kwargs,
        }
        result = self._request("POST", "/api/memories", json=data)
        return Memory.from_dict(result["memory"])

    def get(self, memory_id: str) -> Memory:
        """Get a specific memory by ID."""
        result = self._request("GET", f"/api/memories/{memory_id}")
        return Memory.from_dict(result["memory"])

    def update(
        self,
        memory_id: str,
        memory_type: Optional[Union[MemoryType, str]] = None,
        tags: Optional[List[str]] = None,
        importance: Optional[int] = None,
    ) -> Memory:
        """Update a memory."""
        data = {}
        if memory_type:
            data["memory_type"] = (
                memory_type.value if isinstance(memory_type, MemoryType) else memory_type
            )
        if tags is not None:
            data["tags"] = tags
        if importance is not None:
            data["importance"] = importance

        result = self._request("PATCH", f"/api/memories/{memory_id}", json=data)
        return Memory.from_dict(result["memory"])

    def delete(self, memory_id: str) -> bool:
        """Delete a memory."""
        self._request("DELETE", f"/api/memories/{memory_id}")
        return True

    def delete_many(self, memory_ids: List[str]) -> int:
        """Delete multiple memories."""
        result = self._request("DELETE", "/api/memories", params={"ids": ",".join(memory_ids)})
        return result.get("deleted", 0)

    def search(
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

        result = self._request("GET", "/api/memories", params=params)
        return [SearchResult.from_dict(r) for r in result.get("results", [])]

    # ==================== AI Operations ====================

    def extract(
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
        result = self._request("POST", "/api/extract", json=data)
        return [ExtractedMemory.from_dict(m) for m in result.get("extracted", [])]

    def extract_image(
        self,
        image: str,
        media_type: str = "image/png",
        model: str = "haiku",
        auto_store: bool = True,
        namespace: str = "default",
        context: Optional[str] = None,
    ) -> List[ExtractedMemory]:
        """Extract memories from an image using Claude Vision."""
        data = {
            "image": image,
            "media_type": media_type,
            "model": model,
            "auto_store": auto_store,
            "namespace": namespace,
        }
        if context:
            data["context"] = context

        result = self._request("POST", "/api/extract/image", json=data)
        return [ExtractedMemory.from_dict(m) for m in result.get("extracted", [])]

    def query(
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

        result = self._request("POST", "/api/query", json=data)

        memories_used = []
        if include_memories and result.get("memories_used"):
            memories_used = [SearchResult.from_dict(m) for m in result["memories_used"]]

        return QueryResponse(
            response=result["response"],
            memories_used=memories_used,
            model_used=result.get("model_used", model),
        )

    def summarize(
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
        result = self._request("POST", "/api/summarize", json=data)
        summary = result.get("summary", {})

        return ConversationSummary(
            text=summary.get("text", ""),
            topic=summary.get("topic", ""),
            key_points=summary.get("key_points", []),
            message_count=summary.get("message_count", 0),
        )

    # ==================== Export/Import Operations ====================

    def export_memories(
        self,
        format: str = "json",
        namespace: Optional[str] = None,
        memory_type: Optional[str] = None,
        limit: int = 10000,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Export memories."""
        params: Dict[str, Any] = {
            "format": format,
            "limit": limit,
            "offset": offset,
        }
        if namespace:
            params["namespace"] = namespace
        if memory_type:
            params["memory_type"] = memory_type

        if format == "csv":
            response = self._client.request("GET", "/api/memories/export", params=params)
            if response.status_code >= 400:
                raise SeiznError(response.text, response.status_code)
            return {"csv": response.text}

        return self._request("GET", "/api/memories/export", params=params)

    def import_memories(
        self,
        memories: List[Dict[str, Any]],
        skip_duplicates: bool = True,
    ) -> Dict[str, Any]:
        """Import memories in bulk."""
        data = {
            "memories": memories,
            "skip_duplicates": skip_duplicates,
        }
        return self._request("POST", "/api/memories/import", json=data)

    # ==================== Webhook Operations ====================

    def list_webhooks(self) -> List[Webhook]:
        """List all webhooks."""
        result = self._request("GET", "/api/webhooks")
        return [Webhook.from_dict(w) for w in result.get("webhooks", [])]

    def create_webhook(
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

        result = self._request("POST", "/api/webhooks", json=data)
        return Webhook.from_dict(result["webhook"])

    def delete_webhook(self, webhook_id: str) -> bool:
        """Delete a webhook."""
        self._request("DELETE", "/api/webhooks", params={"id": webhook_id})
        return True

    # ==================== Context Manager ====================

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._client.close()

    def close(self):
        """Close the HTTP client."""
        self._client.close()
