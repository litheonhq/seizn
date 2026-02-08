"""Type definitions for Seizn SDK."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import List, Optional


class MemoryType(str, Enum):
    """Types of memories that can be stored."""
    FACT = "fact"
    PREFERENCE = "preference"
    EXPERIENCE = "experience"
    RELATIONSHIP = "relationship"
    INSTRUCTION = "instruction"


class SearchMode(str, Enum):
    """Search modes for memory retrieval."""
    VECTOR = "vector"
    KEYWORD = "keyword"
    HYBRID = "hybrid"


@dataclass
class Memory:
    """A stored memory."""
    id: str
    content: str
    memory_type: MemoryType
    tags: List[str]
    namespace: str
    importance: int
    confidence: float
    created_at: datetime

    @classmethod
    def from_dict(cls, data: dict) -> "Memory":
        return cls(
            id=data["id"],
            content=data["content"],
            memory_type=MemoryType(data.get("memory_type", "fact")),
            tags=data.get("tags", []),
            namespace=data.get("namespace", "default"),
            importance=data.get("importance", 5),
            confidence=data.get("confidence", 1.0),
            created_at=datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
            if isinstance(data.get("created_at"), str)
            else datetime.now(),
        )


@dataclass
class SearchResult:
    """A memory search result with similarity score."""
    id: str
    content: str
    memory_type: MemoryType
    tags: List[str]
    similarity: float
    keyword_rank: Optional[float] = None
    combined_score: Optional[float] = None

    @classmethod
    def from_dict(cls, data: dict) -> "SearchResult":
        return cls(
            id=data["id"],
            content=data["content"],
            memory_type=MemoryType(data.get("memory_type", "fact")),
            tags=data.get("tags", []),
            similarity=data.get("similarity", 0),
            keyword_rank=data.get("keyword_rank"),
            combined_score=data.get("combined_score"),
        )


@dataclass
class ExtractedMemory:
    """A memory extracted from conversation."""
    content: str
    memory_type: MemoryType
    tags: List[str]
    confidence: float
    importance: int

    @classmethod
    def from_dict(cls, data: dict) -> "ExtractedMemory":
        return cls(
            content=data["content"],
            memory_type=MemoryType(data.get("memory_type", "fact")),
            tags=data.get("tags", []),
            confidence=data.get("confidence", 0.8),
            importance=data.get("importance", 5),
        )


@dataclass
class QueryResponse:
    """Response from a memory-augmented query."""
    response: str
    memories_used: List[SearchResult]
    model_used: str


@dataclass
class ConversationSummary:
    """Summary of a conversation."""
    text: str
    topic: str
    key_points: List[str]
    message_count: int


@dataclass
class Webhook:
    """A webhook configuration."""
    id: str
    name: str
    url: str
    events: List[str]
    namespace: Optional[str]
    is_active: bool
    secret: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "Webhook":
        return cls(
            id=data["id"],
            name=data["name"],
            url=data["url"],
            events=data.get("events", ["memory.created"]),
            namespace=data.get("namespace"),
            is_active=data.get("is_active", True),
            secret=data.get("secret"),
        )
