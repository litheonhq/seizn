"""
Seizn - AI Memory Infrastructure for Developers

Sync Usage:
    from seizn import Seizn

    client = Seizn(api_key="szn_...")

    # Add a memory
    client.add("User prefers dark mode")

    # Search memories
    results = client.search("user preferences")

    # Extract from conversation
    memories = client.extract("User: I work at Google...")

    # Query with memory context
    response = client.query("What do you know about me?")

    # Graph operations
    edges = client.get_edges(memory_id="...")
    timeline = client.get_timeline()

Async Usage:
    from seizn import AsyncSeizn

    async with AsyncSeizn(api_key="szn_...") as client:
        await client.add("User prefers dark mode")
        results = await client.search("user preferences")

        # Batch add memories
        memories = await client.add_many([
            {"content": "Fact 1", "memory_type": "fact"},
            {"content": "Fact 2", "memory_type": "fact"},
        ])
"""

from .client import Seizn, SeiznError
from .async_client import AsyncSeizn, SeiznAsyncError
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

__version__ = "0.4.0"
__all__ = [
    # Clients
    "Seizn",
    "AsyncSeizn",
    # Errors
    "SeiznError",
    "SeiznAsyncError",
    # Core Types
    "Memory",
    "MemoryType",
    "SearchResult",
    "SearchMode",
    "ExtractedMemory",
    "QueryResponse",
    "ConversationSummary",
    "Webhook",
    # Spring Types
    "Edge",
    "GraphNeighbor",
    "TemporalResult",
    "TimelineEntry",
    "FactHistoryEntry",
    "ChangedFact",
    "TemporalStatus",
    "IngestionRule",
    "IngestionSettings",
]
