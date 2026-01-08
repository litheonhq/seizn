"""
Seizn SDK Exceptions
"""


class SeiznError(Exception):
    """Base exception for Seizn SDK errors."""
    pass


class AuthenticationError(SeiznError):
    """Raised when API key is invalid or missing."""
    pass


class RateLimitError(SeiznError):
    """Raised when rate limit is exceeded."""
    pass


class ValidationError(SeiznError):
    """Raised when request validation fails."""
    pass
