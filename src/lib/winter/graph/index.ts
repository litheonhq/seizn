/**
 * Seizn Winter - Graph Module
 *
 * Graph data structures, builders, and permission resolution for
 * visualizing data relationships and access control.
 */

// Types
export * from './types';

// Graph Builder
export {
  GraphBuilder,
  buildPermissionGraph,
  buildFederatedGraph,
  filterGraphData,
} from './graph-builder';

// Permission Resolver
export {
  PermissionResolver,
  createPermissionResolver,
  getPermissionResolver,
  comparePermissionLevels,
  hasPermissionLevel,
  getHighestPermissionLevel,
  type PermissionContext,
  type PermissionResolutionResult,
  type PermissionHierarchyNode,
} from './permission-resolver';
