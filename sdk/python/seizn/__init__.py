"""
Seizn - AI Memory SDK for Python

Persistent memory for your AI applications.
"""

from .client import Seizn
from .exceptions import SeiznError, AuthenticationError, RateLimitError

__version__ = "0.1.0"
__all__ = ["Seizn", "SeiznError", "AuthenticationError", "RateLimitError"]
