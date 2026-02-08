"""Spring-specific mixin for Seizn SDK (Graph, Temporal, Ingestion operations)."""

from typing import Any, Dict, List, Optional

from .spring_types import (
    Edge,
    GraphNeighbor,
    TemporalResult,
    TimelineEntry,
    FactHistoryEntry,
    ChangedFact,
    TemporalStatus,
    IngestionRule,
    IngestionSettings,
)


class SpringMixin:
    """
    Mixin class providing Spring Memory v4 features.

    Adds graph operations, temporal queries, and ingestion rule management
    to the base Seizn client. This mixin expects the class to have a
    `_request(method, path, params, json)` method.
    """

    # ==================== Graph Operations ====================

    def get_edges(
        self,
        memory_id: str,
        direction: str = "both",
        edge_types: Optional[List[str]] = None,
        min_weight: float = 0,
    ) -> List[Edge]:
        """
        Get edges for a memory.

        Args:
            memory_id: The memory UUID
            direction: Edge direction (outgoing, incoming, both)
            edge_types: Filter by edge types
            min_weight: Minimum edge weight
        """
        params: Dict[str, Any] = {
            "memory_id": memory_id,
            "direction": direction,
            "min_weight": min_weight,
        }
        if edge_types:
            params["edge_types"] = ",".join(edge_types)

        result = self._request("GET", "/api/spring/edges", params=params)
        return [Edge.from_dict(e) for e in result.get("edges", [])]

    def create_edge(
        self,
        src_memory_id: str,
        dst_memory_id: str,
        edge_type: str = "relates_to",
        weight: float = 1.0,
        reason: Optional[str] = None,
        confidence: Optional[float] = None,
        agent_id: Optional[str] = None,
    ) -> Edge:
        """
        Create an edge between two memories.

        Args:
            src_memory_id: Source memory UUID
            dst_memory_id: Destination memory UUID
            edge_type: Type of relationship
            weight: Edge weight (0-1)
            reason: Why this edge exists
            confidence: Confidence score
            agent_id: Agent that created this edge
        """
        data: Dict[str, Any] = {
            "srcMemoryId": src_memory_id,
            "dstMemoryId": dst_memory_id,
            "edgeType": edge_type,
            "weight": weight,
        }
        if reason:
            data["reason"] = reason
        if confidence is not None:
            data["confidence"] = confidence
        if agent_id:
            data["agentId"] = agent_id

        result = self._request("POST", "/api/spring/edges", json=data)
        return Edge.from_dict(result["edge"])

    def delete_edge(self, edge_id: str) -> bool:
        """Delete an edge."""
        self._request("DELETE", f"/api/spring/edges/{edge_id}")
        return True

    def get_neighborhood(
        self,
        memory_id: str,
        max_hops: int = 2,
        limit: int = 50,
        min_weight: float = 0,
        edge_types: Optional[List[str]] = None,
    ) -> List[GraphNeighbor]:
        """
        Get graph neighborhood of a memory.

        Args:
            memory_id: Starting memory UUID
            max_hops: Maximum traversal depth
            limit: Maximum neighbors to return
            min_weight: Minimum edge weight
            edge_types: Filter by edge types
        """
        params: Dict[str, Any] = {
            "memory_id": memory_id,
            "max_hops": max_hops,
            "limit": limit,
            "min_weight": min_weight,
        }
        if edge_types:
            params["edge_types"] = ",".join(edge_types)

        result = self._request("GET", "/api/spring/graph/neighborhood", params=params)
        return [GraphNeighbor.from_dict(n) for n in result.get("neighbors", [])]

    # ==================== Temporal Operations ====================

    def search_valid_at(
        self,
        valid_at: str,
        query: Optional[str] = None,
        types: Optional[List[str]] = None,
        top_k: int = 20,
        min_similarity: float = 0.5,
        exclude_expired: bool = True,
        include_superseded: bool = False,
    ) -> List[TemporalResult]:
        """
        Search memories valid at a specific point in time.

        Args:
            valid_at: ISO datetime string
            query: Optional semantic search query
            types: Filter by memory types
            top_k: Maximum results
            min_similarity: Minimum similarity threshold
            exclude_expired: Exclude expired memories
            include_superseded: Include superseded memories
        """
        params: Dict[str, Any] = {
            "valid_at": valid_at,
            "top_k": top_k,
            "min_similarity": min_similarity,
            "exclude_expired": exclude_expired,
            "include_superseded": include_superseded,
        }
        if query:
            params["query"] = query
        if types:
            params["types"] = ",".join(types)

        result = self._request("GET", "/api/spring/temporal/search", params=params)
        return [TemporalResult.from_dict(r) for r in result.get("results", [])]

    def get_timeline(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        types: Optional[List[str]] = None,
        limit: int = 50,
    ) -> List[TimelineEntry]:
        """
        Get memory timeline.

        Args:
            start_date: Start of time range (ISO)
            end_date: End of time range (ISO)
            types: Filter by memory types
            limit: Maximum entries
        """
        params: Dict[str, Any] = {"limit": limit}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        if types:
            params["types"] = ",".join(types)

        result = self._request("GET", "/api/spring/temporal/timeline", params=params)
        return [TimelineEntry.from_dict(e) for e in result.get("entries", [])]

    def get_fact_history(self, fact_id: str) -> List[FactHistoryEntry]:
        """
        Get the version history of a fact.

        Args:
            fact_id: The fact/memory UUID
        """
        result = self._request("GET", f"/api/spring/temporal/history/{fact_id}")
        return [FactHistoryEntry.from_dict(h) for h in result.get("history", [])]

    def get_changed_facts(
        self,
        start_date: str,
        end_date: str,
    ) -> List[ChangedFact]:
        """
        Get facts that changed within a time range.

        Args:
            start_date: Start of range (ISO)
            end_date: End of range (ISO)
        """
        params = {"start_date": start_date, "end_date": end_date}
        result = self._request("GET", "/api/spring/temporal/changes", params=params)
        return [ChangedFact.from_dict(c) for c in result.get("changes", [])]

    def get_temporal_status(self) -> TemporalStatus:
        """Get temporal status counts (active, expired, superseded, expiring soon)."""
        result = self._request("GET", "/api/spring/temporal/status")
        return TemporalStatus.from_dict(result)

    # ==================== Ingestion Rules ====================

    def list_ingestion_rules(
        self,
        workspace_id: Optional[str] = None,
        enabled_only: bool = False,
    ) -> List[IngestionRule]:
        """List ingestion rules."""
        params: Dict[str, Any] = {}
        if workspace_id:
            params["workspace_id"] = workspace_id
        if enabled_only:
            params["enabled_only"] = True

        result = self._request("GET", "/api/spring/ingestion/rules", params=params)
        return [IngestionRule.from_dict(r) for r in result.get("rules", [])]

    def create_ingestion_rule(
        self,
        name: str,
        action: str,
        **kwargs,
    ) -> IngestionRule:
        """
        Create an ingestion rule.

        Args:
            name: Rule name
            action: Action (store, redact, deny, store_as_candidate)
            **kwargs: description, priority, enabled, workspace_id, namespace,
                      agent_id, note_types, categories, tag_patterns,
                      content_patterns, confidence_threshold, redact_replacement
        """
        data: Dict[str, Any] = {"name": name, "action": action, **kwargs}
        result = self._request("POST", "/api/spring/ingestion/rules", json=data)
        return IngestionRule.from_dict(result["rule"])

    def update_ingestion_rule(self, rule_id: str, **kwargs) -> IngestionRule:
        """Update an ingestion rule."""
        result = self._request("PUT", f"/api/spring/ingestion/rules/{rule_id}", json=kwargs)
        return IngestionRule.from_dict(result["rule"])

    def delete_ingestion_rule(self, rule_id: str) -> bool:
        """Delete an ingestion rule."""
        self._request("DELETE", f"/api/spring/ingestion/rules/{rule_id}")
        return True

    def get_ingestion_settings(self) -> IngestionSettings:
        """Get ingestion settings."""
        result = self._request("GET", "/api/spring/ingestion/settings")
        return IngestionSettings.from_dict(result.get("settings", result))

    def update_ingestion_settings(self, **kwargs) -> IngestionSettings:
        """Update ingestion settings."""
        result = self._request("PUT", "/api/spring/ingestion/settings", json=kwargs)
        return IngestionSettings.from_dict(result.get("settings", result))
