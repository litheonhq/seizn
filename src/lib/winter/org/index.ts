/**
 * Seizn Winter - Organization Governance Module
 *
 * Enterprise-grade organization management and governance system including:
 * - Organization and team management
 * - Member lifecycle management
 * - Role-based access control (RBAC)
 * - Policy enforcement
 * - Comprehensive audit logging
 * - Compliance reporting
 */

// Types
export * from './types';

// Organization Management
export {
  createOrganization,
  getOrganization,
  getOrganizationBySlug,
  getUserOrganizations,
  updateOrganization,
  updateOrganizationSettings,
  deleteOrganization,
  getOrganizationUsage,
  checkOrganizationLimits,
  getOrgContext,
  hasOrgAccess,
  getUserOrgRole,
} from './organization';

export type {
  CreateOrganizationParams,
  UpdateOrganizationParams,
  OrganizationUsageStats,
} from './organization';

// Member Management
export {
  listMembers,
  getMember,
  getMemberByUser,
  inviteMember,
  acceptInvite,
  getPendingInvites,
  cancelInvite,
  updateMember,
  removeMember,
  transferOwnership,
  getMemberActivity,
} from './members';

export type {
  ListMembersParams,
  InviteMemberParams,
  UpdateMemberParams,
  OrgInvite,
} from './members';

// Role & Permission Management
export {
  DEFAULT_ORG_ROLES,
  DEFAULT_TEAM_ROLES,
  getRolePermissions,
  getEffectivePermissions,
  hasPermission,
  checkMemberPermission,
  checkUserPermission,
  requirePermission,
  isRoleHigherOrEqual,
  canManageRole,
  createCustomRole,
  getCustomRoles,
  updateCustomRole,
  deleteCustomRole,
  getReadOnlyPermissions,
  getFullAccessPermissions,
  grantPermission,
  denyPermission,
  getAllOrgRoles,
  getAllTeamRoles,
  getRoleDisplayName,
  getRoleDescription,
} from './roles';

export type { CustomRole } from './roles';

// Policy Management
export {
  DEFAULT_RETENTION_POLICY,
  DEFAULT_PII_POLICY,
  DEFAULT_ACCESS_POLICY,
  DEFAULT_AUDIT_POLICY,
  DEFAULT_SECURITY_POLICY,
  getDefaultPolicyConfig,
  createPolicy,
  getPolicy,
  listPolicies,
  updatePolicy,
  deletePolicy,
  activatePolicy,
  deactivatePolicy,
  getEffectivePolicy,
  getRetentionPolicy,
  getPiiPolicy,
  getAccessPolicy,
  getAuditPolicy,
  getSecurityPolicy,
  validatePolicyConfig,
  getPolicyTemplates,
} from './policies';

export type {
  CreatePolicyParams,
  UpdatePolicyParams,
  ListPoliciesParams,
} from './policies';

// Policy Versioning
export {
  createPolicyVersion,
  getPolicyVersion,
  getCurrentVersion,
  getDraftVersion,
  listPolicyVersions,
  updateDraftVersion,
  deleteDraftVersion,
  publishVersion,
  rollbackToVersion,
  compareVersions,
  compareWithCurrent,
  getVersionHistory,
  getVersionAtTime,
  hasDraftChanges,
  getVersionChangeSummary,
  discardDraftChanges,
} from './policy-versions';

export type {
  PolicyVersion,
  PolicyVersionState,
  PolicyVersionChangeType,
  PolicyVersionDiff,
  CreateVersionParams,
  ListVersionsParams,
  RollbackParams,
  UpdateDraftParams,
} from './policy-versions';

// Audit Log Management
export {
  logAuditEvent,
  logAuditEventRpc,
  getAuditLogEntry,
  queryAuditLogs,
  getAuditSummary,
  getSecurityEvents,
  getAdminEvents,
  getDataAccessEvents,
  exportAuditLogs,
  exportAuditLogsAsCsv,
  cleanupOldAuditLogs,
  getActionDescription,
  getActionCategory,
} from './audit-log';

export type {
  LogAuditEventParams,
  AuditSummary,
  ExportedAuditLog,
} from './audit-log';

// Report Generation
export {
  generateReport,
  getReport,
  listReports,
  generateWeeklyReports,
  generateMonthlyReports,
} from './reports';

export type {
  GenerateReportParams,
  ListReportsParams,
} from './reports';
