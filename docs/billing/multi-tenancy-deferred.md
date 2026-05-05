# Track 2 Multi-Tenancy Deferred

**Date:** 2026-05-06  
**Scope:** Track 2 API + MCP Phase 0

Multi-tenancy for real Studio seats is deferred to a Phase 8+ cycle.

Phase 0 keeps `api_keys.org_id` nullable for future migration readiness, but v1 operation is one user with that user's own keys. Studio is represented as five API keys per user, not five organization seats.

The later multi-seat implementation must introduce the real organization membership contract before making `api_keys.org_id` required or granting shared key administration.
