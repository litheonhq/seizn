# Seizn OPA Policy Tests
# Run with: opa test src/lib/opa/policies -v

package seizn_test

import rego.v1
import data.seizn

# ============================================
# Test: Valid User
# ============================================

test_valid_user_allowed if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "current_memory_count": 100
        },
        "data": {
            "pii_detected": []
        },
        "policy_config": {
            "pii_action": "mask"
        }
    }
    result.allow == true
    count(result.deny_reasons) == 0
}

test_invalid_user_denied if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "",
            "role": "member",
            "plan": "free"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z"
        }
    }
    result.allow == false
    "invalid_user" in result.deny_reasons
}

# ============================================
# Test: PII Policy
# ============================================

test_pii_mask_action if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z"
        },
        "data": {
            "pii_detected": ["email", "phone"]
        },
        "policy_config": {
            "pii_action": "mask"
        }
    }
    result.allow == true
    result.pii_action == "mask"
}

test_pii_deny_action if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z"
        },
        "data": {
            "pii_detected": ["ssn"]
        },
        "policy_config": {
            "pii_action": "deny"
        }
    }
    result.allow == false
    "pii_denied" in result.deny_reasons
}

test_no_pii_allow_action if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z"
        },
        "data": {
            "pii_detected": []
        },
        "policy_config": {
            "pii_action": "deny"
        }
    }
    result.allow == true
    result.pii_action == "allow"
}

# ============================================
# Test: Rate Limiting
# ============================================

test_rate_limit_free_tier if {
    result := seizn.decision with input as {
        "action": "memory.read",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "free"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "request_count_minute": 100
        }
    }
    result.allow == false
    "rate_limit_exceeded" in result.deny_reasons
}

test_rate_limit_pro_tier_allowed if {
    result := seizn.decision with input as {
        "action": "memory.read",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "request_count_minute": 500
        }
    }
    result.allow == true
    result.rate_limit == 600
}

test_rate_limit_enterprise if {
    result := seizn.rate_limit with input as {
        "user": {
            "plan": "enterprise"
        }
    }
    result == 3000
}

# ============================================
# Test: IP Access Control
# ============================================

test_ip_blocked_by_denylist if {
    result := seizn.decision with input as {
        "action": "memory.read",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "ip_address": "1.2.3.4"
        },
        "policy_config": {
            "ip_denylist": ["1.2.3.4", "5.6.7.8"]
        }
    }
    result.allow == false
    "ip_blocked" in result.deny_reasons
}

test_ip_blocked_not_in_allowlist if {
    result := seizn.decision with input as {
        "action": "memory.read",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "ip_address": "1.2.3.4"
        },
        "policy_config": {
            "ip_allowlist": ["10.0.0.1", "10.0.0.2"]
        }
    }
    result.allow == false
    "ip_blocked" in result.deny_reasons
}

test_ip_allowed_in_allowlist if {
    result := seizn.decision with input as {
        "action": "memory.read",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "ip_address": "10.0.0.1"
        },
        "policy_config": {
            "ip_allowlist": ["10.0.0.1", "10.0.0.2"]
        }
    }
    result.allow == true
}

# ============================================
# Test: 2FA Requirement
# ============================================

test_2fa_required_without_2fa if {
    result := seizn.decision with input as {
        "action": "policy.update",
        "user": {
            "id": "user_123",
            "role": "admin",
            "plan": "pro",
            "has_2fa": false
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z"
        },
        "policy_config": {
            "require_2fa": true
        }
    }
    result.allow == false
    "2fa_required" in result.deny_reasons
}

test_2fa_required_with_2fa if {
    result := seizn.decision with input as {
        "action": "policy.update",
        "user": {
            "id": "user_123",
            "role": "admin",
            "plan": "pro",
            "has_2fa": true
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z"
        },
        "policy_config": {
            "require_2fa": true
        }
    }
    result.allow == true
}

# ============================================
# Test: Memory Limits
# ============================================

test_memory_limit_exceeded_free if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "free"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "current_memory_count": 15000
        },
        "data": {
            "pii_detected": []
        }
    }
    result.allow == false
    "plan_limit_exceeded" in result.deny_reasons
}

test_memory_limit_enterprise_unlimited if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "enterprise"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z",
            "current_memory_count": 5000000
        },
        "data": {
            "pii_detected": []
        }
    }
    result.allow == true
}

# ============================================
# Test: Audit Required
# ============================================

test_audit_required_for_write if {
    result := seizn.decision with input as {
        "action": "memory.write",
        "user": {
            "id": "user_123",
            "role": "member",
            "plan": "pro"
        },
        "context": {
            "timestamp": "2024-01-15T10:00:00Z"
        },
        "data": {
            "pii_detected": []
        }
    }
    result.audit_required == true
}

test_audit_required_for_delete if {
    result := seizn.audit_required with input as {
        "action": "memory.delete"
    }
    result == true
}

test_audit_required_for_api_key if {
    result := seizn.audit_required with input as {
        "action": "api_key.create"
    }
    result == true
}
