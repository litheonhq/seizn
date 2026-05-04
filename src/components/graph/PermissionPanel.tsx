"use client";

import { useState, useEffect } from "react";
import type {
  GraphNode,
  Permission,
  PermissionLevel,
  EffectivePermission,
} from "@/lib/winter/graph/types";
import { formatDate } from "@/lib/format-date";

// ============================================
// Types
// ============================================

export interface PermissionPanelProps {
  node: GraphNode;
  onClose: () => void;
  onPermissionChange?: (permission: Permission) => void;
}

// ============================================
// Permission Level Config
// ============================================

const permissionLevelConfig: Record<
  PermissionLevel,
  { color: string; bgColor: string; icon: React.FC<{ className?: string }> }
> = {
  owner: {
    color: "#DC2626",
    bgColor: "#FEE2E2",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
  },
  admin: {
    color: "#F59E0B",
    bgColor: "#FEF3C7",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  write: {
    color: "#3B82F6",
    bgColor: "#DBEAFE",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  read: {
    color: "#059669",
    bgColor: "#D1FAE5",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  none: {
    color: "#6B7280",
    bgColor: "#F3F4F6",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  },
};

// ============================================
// PermissionPanel Component
// ============================================

export function PermissionPanel({
  node,
  onClose,
  onPermissionChange: _onPermissionChange,
}: PermissionPanelProps) {

  const [activeTab, setActiveTab] = useState<"direct" | "inherited" | "effective">("direct");
  const [effectivePermissions, setEffectivePermissions] = useState<Record<string, EffectivePermission>>({});
  const [loading, setLoading] = useState(false);

  // Fetch effective permissions
  useEffect(() => {
    async function fetchPermissions() {
      setLoading(true);
      try {
        const response = await fetch(`/api/winter/graph/permissions/${node.id}`);
        if (response.ok) {
          const data = await response.json();
          setEffectivePermissions(data.effectivePermissions || {});
        }
      } catch (error) {
        console.error("Failed to fetch permissions:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPermissions();
  }, [node.id]);

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 w-80 max-h-[600px] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Node Permissions</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close panel"
          >
            <CloseIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Node Info */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: node.style?.borderColor || "#E5E7EB" }}
          >
            <span className="text-white text-sm font-medium">
              {node.label[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{node.label}</p>
            <p className="text-xs text-gray-500 capitalize">{node.type}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        <TabButton
          active={activeTab === "direct"}
          onClick={() => setActiveTab("direct")}
          count={node.permissions.length}
        >
          Direct
        </TabButton>
        <TabButton
          active={activeTab === "inherited"}
          onClick={() => setActiveTab("inherited")}
        >
          Inherited
        </TabButton>
        <TabButton
          active={activeTab === "effective"}
          onClick={() => setActiveTab("effective")}
          count={Object.keys(effectivePermissions).length}
        >
          Effective
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {/* Direct Permissions */}
            {activeTab === "direct" && (
              <div className="space-y-3">
                {node.permissions.length === 0 ? (
                  <EmptyState message="No direct permissions" />
                ) : (
                  node.permissions.map((permission) => (
                    <PermissionCard key={permission.id} permission={permission} />
                  ))
                )}
              </div>
            )}

            {/* Inherited Permissions */}
            {activeTab === "inherited" && (
              <div className="space-y-3">
                <EmptyState message="No inherited permissions" />
              </div>
            )}

            {/* Effective Permissions */}
            {activeTab === "effective" && (
              <div className="space-y-3">
                {Object.keys(effectivePermissions).length === 0 ? (
                  <EmptyState message="No effective permissions" />
                ) : (
                  Object.entries(effectivePermissions).map(([subjectId, effective]) => (
                    <EffectivePermissionCard
                      key={subjectId}
                      subjectId={subjectId}
                      effective={effective}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          Last updated: {new Date(node.updatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function TabButton({
  children,
  active,
  onClick,
  count,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 px-3 py-2 text-xs font-medium transition-colors relative
        ${active ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}
      `}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={`
            ml-1 px-1.5 py-0.5 rounded-full text-xs
            ${active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}
          `}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function PermissionCard({ permission }: { permission: Permission }) {
  const config = permissionLevelConfig[permission.level];
  const Icon = config.icon;

  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: config.bgColor }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span
          className="text-sm font-medium capitalize"
          style={{ color: config.color }}
        >
          {permission.level}
        </span>
        <span className="ml-auto text-xs text-gray-400 capitalize">
          {permission.scope}
        </span>
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        <p>
          <span className="text-gray-400">Subject:</span>{" "}
          <span className="font-mono">{permission.subjectId.slice(0, 8)}...</span>
        </p>
        <p>
          <span className="text-gray-400">Type:</span>{" "}
          <span className="capitalize">{permission.subjectType}</span>
        </p>
        <p>
          <span className="text-gray-400">Granted:</span>{" "}
          {formatDate(permission.grantedAt)}
        </p>
        {permission.expiresAt && (
          <p>
            <span className="text-gray-400">Expires:</span>{" "}
            {formatDate(permission.expiresAt)}
          </p>
        )}
      </div>

      {permission.conditions && permission.conditions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Conditions:</p>
          <div className="flex flex-wrap gap-1">
            {permission.conditions.map((condition, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-0.5 bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] rounded-full"
              >
                {condition.type}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EffectivePermissionCard({
  subjectId,
  effective,
}: {
  subjectId: string;
  effective: EffectivePermission;
}) {
  const config = permissionLevelConfig[effective.level];
  const Icon = config.icon;

  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: config.bgColor }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span
          className="text-sm font-medium capitalize"
          style={{ color: config.color }}
        >
          {effective.level}
        </span>
        <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
          {effective.source}
        </span>
      </div>

      <div className="text-xs text-gray-600">
        <p>
          <span className="text-gray-400">Subject:</span>{" "}
          <span className="font-mono">{subjectId.slice(0, 8)}...</span>
        </p>
        {effective.inheritancePath && effective.inheritancePath.length > 0 && (
          <div className="mt-2">
            <p className="text-gray-400 mb-1">Inheritance Path:</p>
            <div className="flex items-center gap-1 flex-wrap">
              {effective.inheritancePath.map((nodeId, idx) => (
                <span key={nodeId}>
                  <span className="font-mono text-xs bg-gray-50 px-1 py-0.5 rounded">
                    {nodeId.slice(0, 6)}
                  </span>
                  {idx < effective.inheritancePath!.length - 1 && (
                    <span className="text-gray-300 mx-1">-</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center">
      <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
        <LockIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

export default PermissionPanel;
