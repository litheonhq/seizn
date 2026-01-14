"""
Type definitions for Seizn SDK
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class SeizConfig(BaseModel):
    """Configuration for Seizn client"""

    api_key: str = Field(..., description="Seizn API key (szn_xxx)")
    base_url: str = Field(
        default="https://seizn.com/api",
        description="Base URL for Seizn API"
    )
    timeout: float = Field(default=30.0, description="Request timeout in seconds")
    retries: int = Field(default=3, description="Number of retries for failed requests")


class SeizError(Exception):
    """Seizn API error"""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.details = details or {}

    def __str__(self) -> str:
        if self.code:
            return f"[{self.code}] {self.message}"
        return self.message


class MemoryMessage(BaseModel):
    """A message in memory (for conversation context)"""

    role: Literal["user", "assistant", "system"]
    content: str


class Memory(BaseModel):
    """A stored memory"""

    id: str
    content: str
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    namespace: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SearchResult(BaseModel):
    """A search result with relevance score"""

    id: str
    content: str
    score: float = Field(..., ge=0.0, le=1.0)
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    namespace: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


class AddMemoryRequest(BaseModel):
    """Request to add a memory"""

    content: str
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    namespace: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class AddMessagesRequest(BaseModel):
    """Request to add messages (extracts memories automatically)"""

    messages: List[MemoryMessage]
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    namespace: Optional[str] = None


class SearchRequest(BaseModel):
    """Request to search memories"""

    query: str
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    namespace: Optional[str] = None
    top_k: int = Field(default=10, ge=1, le=100)
    threshold: float = Field(default=0.0, ge=0.0, le=1.0)
