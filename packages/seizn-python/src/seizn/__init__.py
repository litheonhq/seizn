"""
Seizn - Semantic Memory & RAG Infrastructure SDK for AI Applications

>>> from seizn import SeizClient
>>> client = SeizClient(api_key="szn_xxx")
>>> memory = client.add("User prefers dark mode", user_id="user123")
>>> results = client.search("What are user preferences?", user_id="user123")
"""

from .client import SeizClient
from .types import (
    Memory,
    MemoryMessage,
    SearchResult,
    SeizConfig,
    SeizError,
)

__version__ = "0.1.0"
__all__ = [
    "SeizClient",
    "Memory",
    "MemoryMessage",
    "SearchResult",
    "SeizConfig",
    "SeizError",
]
