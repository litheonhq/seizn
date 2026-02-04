# Seizn K-12 Education Policy
# Specialized policy rules for educational use cases
#
# Policy Scopes:
# - k12.tutor_mode: Control tutor behavior
# - k12.hint_access: Control hint ladder access
# - k12.answer_reveal: Control answer visibility
# - k12.safety: Content safety for minors

package seizn.k12

import rego.v1

# ============================================
# K-12 Input Schema Extension
# ============================================
# input = {
#   "action": "k12.hint_access",
#   "user": {
#     "id": "user_xxx",
#     "role": "student",  # student | teacher | parent | researcher
#     "grade_band": "elementary",  # elementary | middle | high
#     "age": 12,
#     "workspace_id": "ws_xxx"
#   },
#   "session": {
#     "id": "session_xxx",
#     "mode": "tutor",  # tutor | assessment | study
#     "hints_used": 2,
#     "attempts": 3
#   },
#   "policy_config": {
#     "max_hints": 5,
#     "answer_reveal_allowed": false,
#     "safety_level": "child"  # child | teen | adult
#   }
# }

# ============================================
# Default Decisions
# ============================================

default allow := false
default hint_level := 0
default answer_allowed := false
default safety_action := "block"

# ============================================
# K-12 Role Hierarchy
# ============================================

# researcher > teacher > parent > student
role_hierarchy := {
    "researcher": 4,
    "teacher": 3,
    "parent": 2,
    "student": 1,
    "guest": 0
}

has_role_at_least(required_role) if {
    role_hierarchy[input.user.role] >= role_hierarchy[required_role]
}

# ============================================
# Tutor Mode Policy
# ============================================

allow if {
    input.action == "k12.tutor_mode"
    tutor_mode_allowed
}

tutor_mode_allowed if {
    valid_student
    workspace_active
    not assessment_in_progress
}

valid_student if {
    input.user.role == "student"
    input.user.workspace_id
}

workspace_active if {
    not input.session.workspace_suspended
}

assessment_in_progress if {
    input.session.mode == "assessment"
}

# ============================================
# Hint Access Policy
# ============================================

allow if {
    input.action == "k12.hint_access"
    hint_access_allowed
}

hint_access_allowed if {
    input.session.mode != "assessment"
    input.session.hints_used < input.policy_config.max_hints
}

hint_access_allowed if {
    # Teachers can always access hints
    has_role_at_least("teacher")
}

# Calculate next hint level
hint_level := level if {
    input.session.mode == "assessment"
    level := 0  # No hints in assessment
}

hint_level := level if {
    input.session.mode != "assessment"
    input.session.hints_used < input.policy_config.max_hints
    level := input.session.hints_used + 1
}

hint_level := level if {
    input.session.mode != "assessment"
    input.session.hints_used >= input.policy_config.max_hints
    level := input.policy_config.max_hints  # Max reached
}

# Hint type progression
hint_type := type if {
    hint_level == 1
    type := "conceptual"  # Remind the concept
}

hint_type := type if {
    hint_level == 2
    type := "strategy"  # Suggest an approach
}

hint_type := type if {
    hint_level == 3
    type := "partial"  # Show first step
}

hint_type := type if {
    hint_level == 4
    type := "scaffold"  # Provide structure
}

hint_type := type if {
    hint_level >= 5
    type := "worked"  # Full worked example
}

# ============================================
# Answer Reveal Policy
# ============================================

allow if {
    input.action == "k12.answer_reveal"
    answer_reveal_allowed
}

answer_reveal_allowed if {
    # Student can reveal after max hints
    input.user.role == "student"
    input.session.hints_used >= input.policy_config.max_hints
    input.session.attempts >= 3
    input.policy_config.answer_reveal_allowed == true
}

answer_reveal_allowed if {
    # Teachers/Parents can always reveal
    has_role_at_least("parent")
}

answer_allowed := true if {
    answer_reveal_allowed
}

# ============================================
# Content Safety Policy
# ============================================

allow if {
    input.action == "k12.content"
    content_safety_passed
}

content_safety_passed if {
    not content_blocked
}

content_blocked if {
    safety_level := input.policy_config.safety_level
    safety_level == "child"
    input.data.content_flags[_] in blocked_for_child
}

content_blocked if {
    safety_level := input.policy_config.safety_level
    safety_level == "teen"
    input.data.content_flags[_] in blocked_for_teen
}

blocked_for_child := {
    "violence",
    "adult_content",
    "profanity",
    "scary_content",
    "substance_use",
    "gambling",
    "dangerous_activities"
}

blocked_for_teen := {
    "adult_content",
    "extreme_violence",
    "illegal_activities"
}

# Safety action based on detected flags
safety_action := action if {
    not content_blocked
    action := "allow"
}

safety_action := action if {
    content_blocked
    input.policy_config.safety_level == "child"
    action := "block_and_notify_parent"
}

safety_action := action if {
    content_blocked
    input.policy_config.safety_level == "teen"
    action := "block"
}

# ============================================
# Grade-Appropriate Content
# ============================================

grade_appropriate if {
    input.user.grade_band == "elementary"
    input.data.content_level in ["K-2", "3-5"]
}

grade_appropriate if {
    input.user.grade_band == "middle"
    input.data.content_level in ["6-8"]
}

grade_appropriate if {
    input.user.grade_band == "high"
    input.data.content_level in ["9-12"]
}

grade_appropriate if {
    # Teachers can access all grades
    has_role_at_least("teacher")
}

# ============================================
# Session Time Limits
# ============================================

session_time_limit := limit if {
    input.user.grade_band == "elementary"
    limit := 30  # 30 minutes
}

session_time_limit := limit if {
    input.user.grade_band == "middle"
    limit := 45  # 45 minutes
}

session_time_limit := limit if {
    input.user.grade_band == "high"
    limit := 60  # 60 minutes
}

session_time_exceeded if {
    input.session.duration_minutes > session_time_limit
}

# ============================================
# Learning Receipt Policy
# ============================================

allow if {
    input.action == "k12.receipt_view"
    receipt_view_allowed
}

receipt_view_allowed if {
    # Student can view own receipts
    input.user.role == "student"
    input.resource.student_id == input.user.id
}

receipt_view_allowed if {
    # Parent can view child's receipts
    input.user.role == "parent"
    input.user.child_ids[_] == input.resource.student_id
}

receipt_view_allowed if {
    # Teacher can view workspace students
    input.user.role == "teacher"
    input.resource.workspace_id == input.user.workspace_id
}

receipt_view_allowed if {
    # Researcher can view anonymized
    input.user.role == "researcher"
    input.data.anonymized == true
}

# ============================================
# Photo Upload Policy (OCR)
# ============================================

allow if {
    input.action == "k12.photo_upload"
    photo_upload_allowed
}

photo_upload_allowed if {
    input.data.file_size_mb <= 10
    input.data.file_type in ["image/jpeg", "image/png", "image/heic"]
    not contains_inappropriate_metadata
}

contains_inappropriate_metadata if {
    input.data.exif.gps_location
}

# ============================================
# Output Decision Bundle
# ============================================

decision := {
    "allow": allow,
    "hint_level": hint_level,
    "hint_type": hint_type,
    "answer_allowed": answer_allowed,
    "safety_action": safety_action,
    "session_time_limit": session_time_limit,
    "grade_appropriate": grade_appropriate
}
