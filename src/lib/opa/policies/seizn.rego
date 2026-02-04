# Seizn OPA/Rego Policy-as-Code
# Core policy bundle for Seizn AI Memory Platform
#
# Policy Scopes:
# - memory.write: Control memory creation and updates
# - memory.read: Control memory retrieval and search
# - trace.share: Control trace sharing permissions
# - mcp.tool.execute: Control MCP tool execution
# - pii.action: Control PII handling actions

package seizn

import rego.v1

# ============================================
# Input Schema (expected input structure)
# ============================================
# input = {
#   "action": "memory.write",
#   "user": {
#     "id": "user_xxx",
#     "role": "member",
#     "plan": "pro",
#     "org_id": "org_xxx"
#   },
#   "resource": {
#     "type": "memory",
#     "id": "mem_xxx",
#     "namespace": "default",
#     "collection_id": "col_xxx"
#   },
#   "context": {
#     "ip_address": "1.2.3.4",
#     "user_agent": "...",
#     "timestamp": "2024-01-15T10:30:00Z"
#   },
#   "data": {
#     "content": "...",
#     "pii_detected": ["email", "phone"],
#     "memory_type": "fact"
#   },
#   "policy_config": {
#     "pii_action": "mask",
#     "retention_days": 30,
#     "ip_allowlist": [],
#     "require_2fa": false
#   }
# }

# ============================================
# Default Decisions
# ============================================

default allow := false
default deny_reason := []
default pii_action := "mask"
default rate_limit := 60
default audit_required := true

# ============================================
# Main Decision Rule
# ============================================

# Allow if no deny reasons and specific action is allowed
allow if {
    count(deny_reason) == 0
    action_allowed
}

# Collect all deny reasons
deny_reason := reasons if {
    reasons := [reason |
        some rule in deny_rules
        reason := rule
    ]
}

# All deny rules
deny_rules contains reason if {
    not valid_user
    reason := "invalid_user"
}

deny_rules contains reason if {
    ip_blocked
    reason := "ip_blocked"
}

deny_rules contains reason if {
    rate_limit_exceeded
    reason := "rate_limit_exceeded"
}

deny_rules contains reason if {
    plan_limit_exceeded
    reason := "plan_limit_exceeded"
}

deny_rules contains reason if {
    pii_denied
    reason := "pii_denied"
}

deny_rules contains reason if {
    requires_2fa
    not has_2fa
    reason := "2fa_required"
}

# ============================================
# Action-Specific Rules
# ============================================

action_allowed if {
    input.action == "memory.write"
    memory_write_allowed
}

action_allowed if {
    input.action == "memory.read"
    memory_read_allowed
}

action_allowed if {
    input.action == "trace.share"
    trace_share_allowed
}

action_allowed if {
    input.action == "mcp.tool.execute"
    mcp_tool_allowed
}

action_allowed if {
    input.action == "pii.action"
    pii_action_allowed
}

# ============================================
# Memory Write Policy
# ============================================

memory_write_allowed if {
    valid_user
    has_write_permission
    within_memory_limit
    content_allowed
}

has_write_permission if {
    input.user.role in ["owner", "admin", "member"]
}

within_memory_limit if {
    plan_limits := plan_memory_limits[input.user.plan]
    plan_limits == -1  # Unlimited
}

within_memory_limit if {
    plan_limits := plan_memory_limits[input.user.plan]
    plan_limits > 0
    input.context.current_memory_count < plan_limits
}

content_allowed if {
    not contains_blocked_content
}

contains_blocked_content if {
    input.data.safety_flags[_] == "blocked"
}

# Plan memory limits (sync with src/lib/policy.ts)
plan_memory_limits := {
    "free": 10000,
    "starter": 50000,
    "plus": 100000,
    "pro": 1000000,
    "enterprise": -1  # Unlimited
}

# ============================================
# Memory Read Policy
# ============================================

memory_read_allowed if {
    valid_user
    has_read_permission
    namespace_accessible
}

has_read_permission if {
    input.user.role in ["owner", "admin", "member", "viewer"]
}

namespace_accessible if {
    # User can access their own namespace
    input.resource.namespace == concat(":", ["user", input.user.id])
}

namespace_accessible if {
    # User can access org namespace if member
    startswith(input.resource.namespace, concat(":", ["org", input.user.org_id]))
}

namespace_accessible if {
    # Default namespace accessible to all members
    input.resource.namespace == "default"
}

namespace_accessible if {
    # Explicit namespace grant
    input.user.allowed_namespaces[_] == input.resource.namespace
}

# ============================================
# Trace Share Policy
# ============================================

trace_share_allowed if {
    valid_user
    is_trace_owner
    share_target_valid
}

trace_share_allowed if {
    valid_user
    input.user.role in ["owner", "admin"]
    share_target_valid
}

is_trace_owner if {
    input.resource.owner_id == input.user.id
}

share_target_valid if {
    # Internal sharing within org
    input.data.share_target.type == "internal"
    input.data.share_target.org_id == input.user.org_id
}

share_target_valid if {
    # External sharing allowed for enterprise
    input.data.share_target.type == "external"
    input.user.plan == "enterprise"
}

# ============================================
# MCP Tool Execute Policy
# ============================================

mcp_tool_allowed if {
    valid_user
    tool_enabled
    not tool_blocked
}

tool_enabled if {
    # Check if tool is in allowed list
    input.data.tool_name in input.policy_config.allowed_tools
}

tool_enabled if {
    # All tools allowed if no restriction
    not input.policy_config.allowed_tools
}

tool_blocked if {
    input.data.tool_name in input.policy_config.blocked_tools
}

# ============================================
# PII Action Policy
# ============================================

pii_action_allowed if {
    count(input.data.pii_detected) == 0
}

pii_action_allowed if {
    count(input.data.pii_detected) > 0
    pii_action != "deny"
}

pii_denied if {
    count(input.data.pii_detected) > 0
    input.policy_config.pii_action == "deny"
}

# Determine PII action based on policy and detected types
pii_action := action if {
    count(input.data.pii_detected) == 0
    action := "allow"
}

pii_action := action if {
    count(input.data.pii_detected) > 0
    action := input.policy_config.pii_action
}

# Per-type PII action override
pii_type_actions[pii_type] := action if {
    some pii_type in input.data.pii_detected
    type_override := input.policy_config.pii_type_actions[pii_type]
    action := type_override
}

pii_type_actions[pii_type] := action if {
    some pii_type in input.data.pii_detected
    not input.policy_config.pii_type_actions[pii_type]
    action := input.policy_config.pii_action
}

# ============================================
# User Validation
# ============================================

valid_user if {
    input.user.id
    input.user.role
}

# ============================================
# IP Access Control
# ============================================

ip_blocked if {
    count(input.policy_config.ip_denylist) > 0
    input.context.ip_address in input.policy_config.ip_denylist
}

ip_blocked if {
    count(input.policy_config.ip_allowlist) > 0
    not input.context.ip_address in input.policy_config.ip_allowlist
}

# ============================================
# Rate Limiting
# ============================================

rate_limit := limit if {
    plan_rate := plan_rate_limits[input.user.plan]
    limit := plan_rate
}

rate_limit_exceeded if {
    input.context.request_count_minute > rate_limit
}

plan_rate_limits := {
    "free": 60,
    "starter": 120,
    "plus": 300,
    "pro": 600,
    "enterprise": 3000
}

# ============================================
# 2FA Requirements
# ============================================

requires_2fa if {
    input.policy_config.require_2fa == true
}

requires_2fa if {
    input.action in ["policy.update", "member.role_change", "billing.plan_change"]
}

has_2fa if {
    input.user.has_2fa == true
}

# ============================================
# Plan Limits
# ============================================

plan_limit_exceeded if {
    input.action == "memory.write"
    not within_memory_limit
}

plan_limit_exceeded if {
    input.action == "api_key.create"
    api_key_limit_exceeded
}

api_key_limit_exceeded if {
    limit := plan_api_key_limits[input.user.plan]
    input.context.current_api_key_count >= limit
}

plan_api_key_limits := {
    "free": 2,
    "starter": 3,
    "plus": 5,
    "pro": 10,
    "enterprise": 100
}

# ============================================
# Audit Decision
# ============================================

audit_required if {
    input.action in [
        "memory.write",
        "memory.delete",
        "trace.share",
        "api_key.create",
        "api_key.revoke",
        "policy.update",
        "member.role_change"
    ]
}

audit_required if {
    input.policy_config.log_all_api_calls == true
}

# ============================================
# Output Decision Bundle
# ============================================

decision := {
    "allow": allow,
    "deny_reasons": deny_reason,
    "pii_action": pii_action,
    "pii_type_actions": pii_type_actions,
    "rate_limit": rate_limit,
    "audit_required": audit_required,
    "evaluated_at": input.context.timestamp
}
