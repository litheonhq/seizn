"""
Seizn Python SDK Client
"""

import os
from typing import Optional, List, Dict, Any
import httpx

from .exceptions import SeiznError, AuthenticationError, RateLimitError


class Seizn:
    """
    Seizn AI Memory client for Python.

    Usage:
        from seizn import Seizn

        client = Seizn(api_key="your_api_key")

        # Add a memory
        memory = client.add("User prefers dark mode")

        # Search memories
        results = client.search("user preferences")

        # Extract memories from conversation
        extracted = client.extract("User: I love Python!")
    """

    DEFAULT_BASE_URL = "https://seizn.com"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the Seizn client.

        Args:
            api_key: Your Seizn API key. Falls back to SEIZN_API_KEY env var.
            base_url: API base URL. Defaults to https://seizn.com
            timeout: Request timeout in seconds.
        """
        self.api_key = api_key or os.environ.get("SEIZN_API_KEY")
        if not self.api_key:
            raise AuthenticationError(
                "API key required. Pass api_key or set SEIZN_API_KEY environment variable."
            )

        self.base_url = (base_url or os.environ.get("SEIZN_BASE_URL") or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

        self._client = httpx.Client(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    def _handle_response(self, response: httpx.Response) -> Dict[str, Any]:
        """Handle API response and raise appropriate errors."""
        if response.status_code == 401:
            raise AuthenticationError("Invalid API key")
        elif response.status_code == 429:
            raise RateLimitError("Rate limit exceeded. Please upgrade your plan or wait.")
        elif response.status_code >= 400:
            try:
                error = response.json().get("error", "Unknown error")
            except Exception:
                error = response.text
            raise SeiznError(f"API error ({response.status_code}): {error}")

        return response.json()

    def add(
        self,
        content: str,
        memory_type: str = "fact",
        tags: Optional[List[str]] = None,
        namespace: str = "default",
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Add a new memory.

        Args:
            content: The memory content to store.
            memory_type: Type of memory (fact, preference, experience, relationship, instruction).
            tags: Optional list of tags for categorization.
            namespace: Namespace for organization.
            **kwargs: Additional fields (scope, session_id, agent_id, source).

        Returns:
            The created memory object.

        Example:
            memory = client.add(
                "User prefers dark mode interfaces",
                memory_type="preference",
                tags=["ui", "settings"]
            )
        """
        payload = {
            "content": content,
            "memory_type": memory_type,
            "namespace": namespace,
            **kwargs,
        }
        if tags:
            payload["tags"] = tags

        response = self._client.post("/api/memories", json=payload)
        result = self._handle_response(response)
        return result.get("memory", result)

    def search(
        self,
        query: str,
        limit: int = 10,
        threshold: float = 0.7,
        namespace: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search memories using semantic similarity.

        Args:
            query: Search query text.
            limit: Maximum number of results (default: 10).
            threshold: Similarity threshold 0-1 (default: 0.7).
            namespace: Filter by namespace.

        Returns:
            List of matching memories with similarity scores.

        Example:
            results = client.search("user preferences", limit=5)
            for memory in results:
                print(f"{memory['content']} (similarity: {memory['similarity']})")
        """
        params = {
            "query": query,
            "limit": limit,
            "threshold": threshold,
        }
        if namespace:
            params["namespace"] = namespace

        response = self._client.get("/api/memories", params=params)
        result = self._handle_response(response)
        return result.get("results", [])

    def delete(self, ids: List[str]) -> int:
        """
        Delete memories by their IDs.

        Args:
            ids: List of memory IDs to delete.

        Returns:
            Number of deleted memories.

        Example:
            deleted = client.delete(["mem_123", "mem_456"])
        """
        response = self._client.delete("/api/memories", params={"ids": ",".join(ids)})
        result = self._handle_response(response)
        return result.get("deleted", 0)

    def extract(
        self,
        conversation: str,
        model: str = "haiku",
        auto_store: bool = True,
        namespace: str = "default",
    ) -> Dict[str, Any]:
        """
        Extract and store memories from a conversation using AI.

        Args:
            conversation: The conversation text to extract memories from.
            model: AI model to use ("haiku" for speed, "sonnet" for quality).
            auto_store: Whether to automatically store extracted memories.
            namespace: Namespace for stored memories.

        Returns:
            Dictionary with extracted memories and stored memories (if auto_store).

        Example:
            result = client.extract(
                \"\"\"
                User: I'm a software developer who mainly works with Python.
                Assistant: That's great! What kind of projects do you work on?
                User: Mostly data science and machine learning stuff.
                \"\"\",
                model="sonnet"
            )
            print(f"Extracted {len(result['extracted'])} memories")
        """
        payload = {
            "conversation": conversation,
            "model": model,
            "auto_store": auto_store,
            "namespace": namespace,
        }

        response = self._client.post("/api/extract", json=payload)
        return self._handle_response(response)

    def query(
        self,
        query: str,
        model: str = "haiku",
        top_k: int = 5,
        namespace: Optional[str] = None,
        include_memories: bool = True,
    ) -> Dict[str, Any]:
        """
        Get AI-generated response using relevant memories as context (RAG).

        Args:
            query: The user's question or prompt.
            model: AI model to use ("haiku" or "sonnet").
            top_k: Number of memories to use as context.
            namespace: Filter memories by namespace.
            include_memories: Include used memories in response.

        Returns:
            Dictionary with response and optionally the memories used.

        Example:
            result = client.query("What are my preferences?")
            print(result["response"])

            # With memories
            for mem in result.get("memories_used", []):
                print(f"- {mem['content']}")
        """
        payload = {
            "query": query,
            "model": model,
            "top_k": top_k,
            "include_memories": include_memories,
        }
        if namespace:
            payload["namespace"] = namespace

        response = self._client.post("/api/query", json=payload)
        return self._handle_response(response)

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class AsyncSeizn:
    """
    Async version of the Seizn client.

    Usage:
        from seizn import AsyncSeizn

        async with AsyncSeizn(api_key="your_api_key") as client:
            memory = await client.add("User prefers dark mode")
    """

    DEFAULT_BASE_URL = "https://seizn.com"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.api_key = api_key or os.environ.get("SEIZN_API_KEY")
        if not self.api_key:
            raise AuthenticationError(
                "API key required. Pass api_key or set SEIZN_API_KEY environment variable."
            )

        self.base_url = (base_url or os.environ.get("SEIZN_BASE_URL") or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    async def _handle_response(self, response: httpx.Response) -> Dict[str, Any]:
        if response.status_code == 401:
            raise AuthenticationError("Invalid API key")
        elif response.status_code == 429:
            raise RateLimitError("Rate limit exceeded")
        elif response.status_code >= 400:
            try:
                error = response.json().get("error", "Unknown error")
            except Exception:
                error = response.text
            raise SeiznError(f"API error ({response.status_code}): {error}")
        return response.json()

    async def add(self, content: str, **kwargs) -> Dict[str, Any]:
        payload = {"content": content, "namespace": kwargs.pop("namespace", "default"), **kwargs}
        response = await self._client.post("/api/memories", json=payload)
        result = await self._handle_response(response)
        return result.get("memory", result)

    async def search(self, query: str, limit: int = 10, **kwargs) -> List[Dict[str, Any]]:
        params = {"query": query, "limit": limit, **kwargs}
        response = await self._client.get("/api/memories", params=params)
        result = await self._handle_response(response)
        return result.get("results", [])

    async def delete(self, ids: List[str]) -> int:
        response = await self._client.delete("/api/memories", params={"ids": ",".join(ids)})
        result = await self._handle_response(response)
        return result.get("deleted", 0)

    async def extract(self, conversation: str, **kwargs) -> Dict[str, Any]:
        payload = {"conversation": conversation, **kwargs}
        response = await self._client.post("/api/extract", json=payload)
        return await self._handle_response(response)

    async def query(self, query: str, **kwargs) -> Dict[str, Any]:
        payload = {"query": query, **kwargs}
        response = await self._client.post("/api/query", json=payload)
        return await self._handle_response(response)

    async def close(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
