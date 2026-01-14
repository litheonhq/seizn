"""
Seizn Python SDK Client

Provides semantic memory capabilities for AI applications.
"""

import time
from typing import Any, Dict, List, Optional

import httpx

from .types import (
    AddMemoryRequest,
    AddMessagesRequest,
    Memory,
    MemoryMessage,
    SearchRequest,
    SearchResult,
    SeizConfig,
    SeizError,
)


class SeizClient:
    """
    Seizn client for semantic memory operations.

    Example:
        >>> client = SeizClient(api_key="szn_xxx")
        >>> client.add("User prefers dark mode", user_id="user123")
        >>> results = client.search("preferences", user_id="user123")
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://seizn.com/api",
        timeout: float = 30.0,
        retries: int = 3,
    ):
        """
        Initialize Seizn client.

        Args:
            api_key: Seizn API key (starts with szn_)
            base_url: Base URL for Seizn API
            timeout: Request timeout in seconds
            retries: Number of retries for failed requests
        """
        if not api_key:
            raise SeizError("API key is required")

        self.config = SeizConfig(
            api_key=api_key,
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            retries=retries,
        )

        self._client = httpx.Client(
            base_url=self.config.base_url,
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "seizn-python/0.1.0",
            },
            timeout=self.config.timeout,
        )

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    def _request(
        self,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request with retries."""
        last_error: Optional[Exception] = None

        for attempt in range(self.config.retries):
            try:
                response = self._client.request(
                    method=method,
                    url=path,
                    json=json,
                    params=params,
                )

                if response.status_code >= 400:
                    error_data = response.json() if response.content else {}
                    raise SeizError(
                        message=error_data.get("error", f"Request failed: {response.status_code}"),
                        code=error_data.get("code"),
                        status=response.status_code,
                        details=error_data,
                    )

                return response.json()

            except httpx.TimeoutException:
                last_error = SeizError(
                    message=f"Request timed out after {self.config.timeout}s",
                    code="TIMEOUT",
                )
            except httpx.RequestError as e:
                last_error = SeizError(
                    message=f"Network error: {str(e)}",
                    code="NETWORK_ERROR",
                )
            except SeizError:
                raise

            if attempt < self.config.retries - 1:
                time.sleep(2 ** attempt)

        if last_error:
            raise last_error
        raise SeizError("Unknown error occurred")

    # ==================== Memory Operations ====================

    def add(
        self,
        content: str,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        namespace: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Memory:
        """
        Add a memory.

        Args:
            content: The memory content
            user_id: User ID to associate with the memory
            agent_id: Agent ID to associate with the memory
            namespace: Namespace for organization
            metadata: Additional metadata

        Returns:
            The created memory

        Example:
            >>> memory = client.add("User prefers dark mode", user_id="user123")
        """
        request = AddMemoryRequest(
            content=content,
            user_id=user_id,
            agent_id=agent_id,
            namespace=namespace,
            metadata=metadata,
        )

        response = self._request("POST", "/memories", json=request.model_dump(exclude_none=True))
        return Memory(**response["memory"])

    def add_messages(
        self,
        messages: List[MemoryMessage],
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        namespace: Optional[str] = None,
    ) -> List[Memory]:
        """
        Add messages and automatically extract memories.

        Args:
            messages: List of conversation messages
            user_id: User ID
            agent_id: Agent ID
            namespace: Namespace

        Returns:
            List of extracted memories

        Example:
            >>> messages = [
            ...     MemoryMessage(role="user", content="I love hiking"),
            ...     MemoryMessage(role="assistant", content="Great! Do you have a favorite trail?"),
            ... ]
            >>> memories = client.add_messages(messages, user_id="user123")
        """
        request = AddMessagesRequest(
            messages=messages,
            user_id=user_id,
            agent_id=agent_id,
            namespace=namespace,
        )

        response = self._request(
            "POST",
            "/memories/messages",
            json=request.model_dump(exclude_none=True),
        )
        return [Memory(**m) for m in response.get("memories", [])]

    def search(
        self,
        query: str,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        namespace: Optional[str] = None,
        top_k: int = 10,
        threshold: float = 0.0,
    ) -> List[SearchResult]:
        """
        Search memories.

        Args:
            query: Search query
            user_id: Filter by user ID
            agent_id: Filter by agent ID
            namespace: Filter by namespace
            top_k: Maximum number of results (1-100)
            threshold: Minimum relevance score (0.0-1.0)

        Returns:
            List of search results with relevance scores

        Example:
            >>> results = client.search("user preferences", user_id="user123")
            >>> for r in results:
            ...     print(f"{r.score:.2f}: {r.content}")
        """
        request = SearchRequest(
            query=query,
            user_id=user_id,
            agent_id=agent_id,
            namespace=namespace,
            top_k=top_k,
            threshold=threshold,
        )

        response = self._request(
            "POST",
            "/memories/search",
            json=request.model_dump(exclude_none=True),
        )
        return [SearchResult(**r) for r in response.get("results", [])]

    def get(self, memory_id: str) -> Memory:
        """
        Get a memory by ID.

        Args:
            memory_id: The memory ID

        Returns:
            The memory
        """
        response = self._request("GET", f"/memories/{memory_id}")
        return Memory(**response["memory"])

    def delete(self, memory_id: str) -> bool:
        """
        Delete a memory.

        Args:
            memory_id: The memory ID

        Returns:
            True if deleted successfully
        """
        self._request("DELETE", f"/memories/{memory_id}")
        return True

    def delete_all(
        self,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        namespace: Optional[str] = None,
    ) -> int:
        """
        Delete all memories matching the filters.

        Args:
            user_id: Filter by user ID
            agent_id: Filter by agent ID
            namespace: Filter by namespace

        Returns:
            Number of deleted memories
        """
        params = {}
        if user_id:
            params["user_id"] = user_id
        if agent_id:
            params["agent_id"] = agent_id
        if namespace:
            params["namespace"] = namespace

        response = self._request("DELETE", "/memories", params=params)
        return response.get("deleted", 0)

    def list(
        self,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        namespace: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Memory]:
        """
        List memories.

        Args:
            user_id: Filter by user ID
            agent_id: Filter by agent ID
            namespace: Filter by namespace
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of memories
        """
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if user_id:
            params["user_id"] = user_id
        if agent_id:
            params["agent_id"] = agent_id
        if namespace:
            params["namespace"] = namespace

        response = self._request("GET", "/memories", params=params)
        return [Memory(**m) for m in response.get("memories", [])]
