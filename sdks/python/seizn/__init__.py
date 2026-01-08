"""
Seizn - AI Memory Infrastructure for Developers

Usage:
    from seizn import Seizn

    client = Seizn(api_key="sk_...")

    # Add a memory
    client.add("User prefers dark mode")

    # Search memories
    results = client.search("user preferences")

    # Extract from conversation
    memories = client.extract("User: I work at Google...")

    # Query with memory context
    response = client.query("What do you know about me?")
"""

from .client import Seizn
from .types import Memory, MemoryType, SearchResult, ExtractedMemory

__version__ = "0.1.0"
__all__ = ["Seizn", "Memory", "MemoryType", "SearchResult", "ExtractedMemory"]
