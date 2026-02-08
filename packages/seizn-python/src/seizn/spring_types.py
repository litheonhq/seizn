"""Spring-specific type definitions for Seizn SDK (Graph, Temporal, Ingestion)."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class EdgeType(str, Enum):
    """Types of edges in the knowledge graph."""
    RELATES_TO = "relates_to"
    SUPPORTS = "supports"
    CONTRADICTS = "contradicts"
    SUPERSEDES = "supersedes"
    DERIVED_FROM = "derived_from"
    MENTIONS = "mentions"
    PART_OF = "part_of"
    CAUSES = "causes"
    SIMILAR_TO = "similar_to"


class IngestionAction(str, Enum):
    """Actions for ingestion rules."""
    STORE = "store"
    REDACT = "redact"
    DENY = "deny"
    STORE_AS_CANDIDATE = "store_as_candidate"


class StrictnessLevel(str, Enum):
    """Strictness levels for ingestion."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"


# ==================== Graph Types ====================


@dataclass
class Edge:
    """An edge in the knowledge graph."""
    id: str
    src_memory_id: str
    dst_memory_id: str
    edge_type: str
    weight: float
    reason: Optional[str]
    direction: str
    created_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "Edge":
        return cls(
            id=data["id"],
            src_memory_id=data.get("srcMemoryId", data.get("src_memory_id", "")),
            dst_memory_id=data.get("dstMemoryId", data.get("dst_memory_id", "")),
            edge_type=data.get("edgeType", data.get("edge_type", "relates_to")),
            weight=data.get("weight", 1.0),
            reason=data.get("reason"),
            direction=data.get("direction", "outgoing"),
            created_at=data.get("createdAt", data.get("created_at")),
        )


@dataclass
class GraphNeighbor:
    """A neighboring memory in the graph."""
    memory_id: str
    content: str
    edge_type: str
    weight: float
    direction: str
    hops: int

    @classmethod
    def from_dict(cls, data: dict) -> "GraphNeighbor":
        return cls(
            memory_id=data.get("memoryId", data.get("memory_id", "")),
            content=data.get("content", ""),
            edge_type=data.get("edgeType", data.get("edge_type", "relates_to")),
            weight=data.get("weight", 1.0),
            direction=data.get("direction", "outgoing"),
            hops=data.get("hops", 1),
        )


# ==================== Temporal Types ====================


@dataclass
class TemporalResult:
    """A temporal search result."""
    id: str
    content: str
    type: str
    similarity: Optional[float]
    valid_from: Optional[str]
    valid_to: Optional[str]
    event_time: Optional[str]
    created_at: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "TemporalResult":
        return cls(
            id=data["id"],
            content=data["content"],
            type=data.get("type", "fact"),
            similarity=data.get("similarity"),
            valid_from=data.get("validFrom", data.get("valid_from")),
            valid_to=data.get("validTo", data.get("valid_to")),
            event_time=data.get("eventTime", data.get("event_time")),
            created_at=data.get("createdAt", data.get("created_at", "")),
            metadata=data.get("metadata", {}),
        )


@dataclass
class TimelineEntry:
    """An entry in the memory timeline."""
    id: str
    content: str
    type: str
    event_time: str
    valid_from: Optional[str]
    valid_to: Optional[str]
    is_currently_valid: bool

    @classmethod
    def from_dict(cls, data: dict) -> "TimelineEntry":
        return cls(
            id=data["id"],
            content=data["content"],
            type=data.get("type", "fact"),
            event_time=data.get("eventTime", data.get("event_time", "")),
            valid_from=data.get("validFrom", data.get("valid_from")),
            valid_to=data.get("validTo", data.get("valid_to")),
            is_currently_valid=data.get("isCurrentlyValid", data.get("is_currently_valid", True)),
        )


@dataclass
class FactHistoryEntry:
    """A historical version of a fact."""
    id: str
    content: str
    type: str
    similarity: Optional[float]
    valid_from: Optional[str]
    valid_to: Optional[str]
    event_time: Optional[str]
    created_at: str
    superseded_by_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "FactHistoryEntry":
        return cls(
            id=data["id"],
            content=data["content"],
            type=data.get("type", "fact"),
            similarity=data.get("similarity"),
            valid_from=data.get("validFrom", data.get("valid_from")),
            valid_to=data.get("validTo", data.get("valid_to")),
            event_time=data.get("eventTime", data.get("event_time")),
            created_at=data.get("createdAt", data.get("created_at", "")),
            superseded_by_id=data.get("supersededById", data.get("superseded_by_id")),
            metadata=data.get("metadata", {}),
        )


@dataclass
class ChangedFact:
    """A fact that changed within a time range."""
    old_fact: TemporalResult
    new_fact: TemporalResult
    changed_at: str

    @classmethod
    def from_dict(cls, data: dict) -> "ChangedFact":
        return cls(
            old_fact=TemporalResult.from_dict(data.get("oldFact", data.get("old_fact", {}))),
            new_fact=TemporalResult.from_dict(data.get("newFact", data.get("new_fact", {}))),
            changed_at=data.get("changedAt", data.get("changed_at", "")),
        )


@dataclass
class TemporalStatus:
    """Temporal status counts."""
    active: int
    expired: int
    superseded: int
    expiring_soon: int

    @classmethod
    def from_dict(cls, data: dict) -> "TemporalStatus":
        return cls(
            active=data.get("active", 0),
            expired=data.get("expired", 0),
            superseded=data.get("superseded", 0),
            expiring_soon=data.get("expiringSoon", data.get("expiring_soon", 0)),
        )


# ==================== Ingestion Types ====================


@dataclass
class IngestionRule:
    """An ingestion rule for memory processing."""
    id: str
    name: str
    action: str
    description: Optional[str] = None
    priority: int = 0
    enabled: bool = True
    workspace_id: Optional[str] = None
    namespace: Optional[str] = None
    agent_id: Optional[str] = None
    note_types: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    tag_patterns: Optional[List[str]] = None
    content_patterns: Optional[List[str]] = None
    confidence_threshold: float = 0.75
    redact_replacement: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "IngestionRule":
        return cls(
            id=data["id"],
            name=data["name"],
            action=data.get("action", "store"),
            description=data.get("description"),
            priority=data.get("priority", 0),
            enabled=data.get("enabled", True),
            workspace_id=data.get("workspaceId", data.get("workspace_id")),
            namespace=data.get("namespace"),
            agent_id=data.get("agentId", data.get("agent_id")),
            note_types=data.get("noteTypes", data.get("note_types")),
            categories=data.get("categories"),
            tag_patterns=data.get("tagPatterns", data.get("tag_patterns")),
            content_patterns=data.get("contentPatterns", data.get("content_patterns")),
            confidence_threshold=data.get("confidenceThreshold",
                                          data.get("confidence_threshold", 0.75)),
            redact_replacement=data.get("redactReplacement", data.get("redact_replacement")),
            metadata=data.get("metadata"),
            created_at=data.get("createdAt", data.get("created_at")),
            updated_at=data.get("updatedAt", data.get("updated_at")),
        )


@dataclass
class IngestionSettings:
    """Ingestion settings for memory processing."""
    auto_save_enabled: bool = True
    candidate_mode_enabled: bool = False
    default_confidence_threshold: float = 0.75
    strictness: str = "medium"
    blocked_categories: List[str] = field(default_factory=list)
    blocked_patterns: List[str] = field(default_factory=list)
    sensitive_capsule_enabled: bool = False
    sensitive_categories: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "IngestionSettings":
        return cls(
            auto_save_enabled=data.get("autoSaveEnabled",
                                       data.get("auto_save_enabled", True)),
            candidate_mode_enabled=data.get("candidateModeEnabled",
                                            data.get("candidate_mode_enabled", False)),
            default_confidence_threshold=data.get("defaultConfidenceThreshold",
                                                  data.get("default_confidence_threshold", 0.75)),
            strictness=data.get("strictness", "medium"),
            blocked_categories=data.get("blockedCategories",
                                        data.get("blocked_categories", [])),
            blocked_patterns=data.get("blockedPatterns",
                                      data.get("blocked_patterns", [])),
            sensitive_capsule_enabled=data.get("sensitiveCapsuleEnabled",
                                               data.get("sensitive_capsule_enabled", False)),
            sensitive_categories=data.get("sensitiveCategories",
                                          data.get("sensitive_categories", [])),
        )
