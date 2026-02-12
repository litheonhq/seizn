/**
 * Healing Strategies
 *
 * Implementation of various self-healing strategies for fixing
 * contract validation failures.
 */

import type { AssertionResult } from '../contracts/types';
import type {
  HealingStrategy,
  HealingResult,
  HealingAction,
  RetryConfig,
  FallbackConfig,
  TransformConfig,
  CoerceConfig,
  DefaultValueConfig,
  TruncateConfig,
} from './types';
import { getValueAtPath } from '../contracts/assertions';

// ============================================
// Strategy Executor Type
// ============================================

export type StrategyExecutor = (
  data: unknown,
  action: HealingAction,
  context: StrategyContext
) => Promise<StrategyExecutionResult>;

export interface StrategyContext {
  assertionResult?: AssertionResult;
  originalRequest?: Record<string, unknown>;
  retryFn?: (params?: Record<string, unknown>) => Promise<unknown>;
  config?: Record<string, unknown>;
}

export interface StrategyExecutionResult {
  success: boolean;
  healedData?: unknown;
  message: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Set value at a JSON path in an object
 */
export function setValueAtPath(obj: unknown, path: string, value: unknown): unknown {
  if (!path) return value;

  const result = deepClone(obj) as Record<string, unknown>;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      // Create intermediate objects/arrays as needed
      const nextPart = parts[i + 1];
      current[part] = /^\d+$/.test(nextPart) ? [] : {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;

  return result;
}

/**
 * Delete value at a JSON path in an object
 */
export function deleteValueAtPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;

  const result = deepClone(obj) as Record<string, unknown>;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      return result; // Path doesn't exist, return unchanged
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (Array.isArray(current)) {
    current.splice(parseInt(lastPart), 1);
  } else {
    delete current[lastPart];
  }

  return result;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T;

  const cloned: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Retry Strategy
// ============================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

export const retryStrategy: StrategyExecutor = async (data, action, context) => {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...(action.params as Partial<RetryConfig>),
  };

  if (!context.retryFn) {
    return {
      success: false,
      message: 'Retry function not provided in context',
    };
  }

  const attemptNumber = action.currentAttempt;
  if (attemptNumber > config.maxRetries) {
    return {
      success: false,
      message: `Max retries (${config.maxRetries}) exceeded`,
    };
  }

  // Calculate delay with exponential backoff
  const delay = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1),
    config.maxDelayMs
  );

  await sleep(delay);

  try {
    const result = await context.retryFn(context.originalRequest);
    return {
      success: true,
      healedData: result,
      message: `Retry succeeded on attempt ${attemptNumber}`,
      metadata: { attemptNumber, delay },
    };
  } catch (error) {
    return {
      success: false,
      message: `Retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: { attemptNumber, delay },
    };
  }
};

// ============================================
// Retry Modified Strategy
// ============================================

export const retryModifiedStrategy: StrategyExecutor = async (data, action, context) => {
  const modifications = action.params?.modifications as Record<string, unknown> | undefined;

  if (!context.retryFn) {
    return {
      success: false,
      message: 'Retry function not provided in context',
    };
  }

  const modifiedRequest = {
    ...context.originalRequest,
    ...modifications,
  };

  try {
    const result = await context.retryFn(modifiedRequest);
    return {
      success: true,
      healedData: result,
      message: 'Retry with modifications succeeded',
      metadata: { modifications },
    };
  } catch (error) {
    return {
      success: false,
      message: `Modified retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

// ============================================
// Fallback Strategy
// ============================================

export const fallbackStrategy: StrategyExecutor = async (data, action) => {
  const config = action.params as FallbackConfig | undefined;

  if (!config?.fallbackValue) {
    return {
      success: false,
      message: 'Fallback value not configured',
    };
  }

  const field = action.field;
  let healedData: unknown;

  if (field) {
    healedData = setValueAtPath(data, field, config.fallbackValue);
  } else {
    healedData = config.fallbackValue;
  }

  return {
    success: true,
    healedData,
    message: `Applied fallback value${field ? ` to ${field}` : ''}`,
    metadata: { fallbackValue: config.fallbackValue },
  };
};

// ============================================
// Transform Strategy
// ============================================

export const transformStrategy: StrategyExecutor = async (data, action) => {
  const config = action.params as TransformConfig | undefined;
  const blockedDynamicOperations: string[] = [];

  if (!config?.transformations || config.transformations.length === 0) {
    return {
      success: false,
      message: 'No transformations configured',
    };
  }

  let healedData = deepClone(data);

  for (const transform of config.transformations) {
    const { field, operation, params } = transform;

    switch (operation) {
      case 'set':
        healedData = setValueAtPath(healedData, field, params?.value);
        break;

      case 'delete':
        healedData = deleteValueAtPath(healedData, field);
        break;

      case 'rename': {
        const { found, value } = getValueAtPath(healedData, field);
        if (found && params?.newName) {
          healedData = deleteValueAtPath(healedData, field);
          healedData = setValueAtPath(healedData, params.newName as string, value);
        }
        break;
      }

      case 'map': {
        blockedDynamicOperations.push(`${field}:map`);
        break;
      }

      case 'filter': {
        blockedDynamicOperations.push(`${field}:filter`);
        break;
      }

      case 'default': {
        const { found, value } = getValueAtPath(healedData, field);
        if (!found || value === null || value === undefined) {
          healedData = setValueAtPath(healedData, field, params?.defaultValue);
        }
        break;
      }
    }
  }

  if (blockedDynamicOperations.length > 0) {
    return {
      success: false,
      healedData,
      message:
        'Blocked insecure dynamic transform operations (map/filter) in healing config',
      metadata: {
        transformationsApplied: config.transformations.length,
        blockedDynamicOperations,
      },
    };
  }

  return {
    success: true,
    healedData,
    message: `Applied ${config.transformations.length} transformation(s)`,
    metadata: { transformationsApplied: config.transformations.length },
  };
};

// ============================================
// Default Value Strategy
// ============================================

export const defaultValueStrategy: StrategyExecutor = async (data, action) => {
  const config = action.params as DefaultValueConfig | undefined;

  if (!config?.defaults || Object.keys(config.defaults).length === 0) {
    // If no defaults configured, try to get from assertion
    const field = action.field;
    if (field) {
      const healedData = setValueAtPath(data, field, null);
      return {
        success: true,
        healedData,
        message: `Set default null value for ${field}`,
      };
    }
    return {
      success: false,
      message: 'No default values configured',
    };
  }

  let healedData = deepClone(data);

  for (const [field, defaultValue] of Object.entries(config.defaults)) {
    const { found, value } = getValueAtPath(healedData, field);
    if (!found || value === null || value === undefined) {
      healedData = setValueAtPath(healedData, field, defaultValue);
    }
  }

  return {
    success: true,
    healedData,
    message: `Applied default values for ${Object.keys(config.defaults).length} field(s)`,
    metadata: { fieldsWithDefaults: Object.keys(config.defaults) },
  };
};

// ============================================
// Truncate Strategy
// ============================================

export const truncateStrategy: StrategyExecutor = async (data, action) => {
  const config = action.params as TruncateConfig | undefined;
  const field = config?.field || action.field;

  if (!field) {
    return {
      success: false,
      message: 'Field not specified for truncation',
    };
  }

  const maxLength = config?.maxLength;
  if (maxLength === undefined) {
    return {
      success: false,
      message: 'Max length not specified for truncation',
    };
  }

  const { found, value } = getValueAtPath(data, field);
  if (!found) {
    return {
      success: false,
      message: `Field ${field} not found`,
    };
  }

  let truncatedValue: unknown;

  if (typeof value === 'string') {
    const ellipsis = config?.ellipsis || '...';
    if (value.length > maxLength) {
      if (config?.truncateFrom === 'start') {
        truncatedValue = ellipsis + value.slice(-(maxLength - ellipsis.length));
      } else {
        truncatedValue = value.slice(0, maxLength - ellipsis.length) + ellipsis;
      }
    } else {
      truncatedValue = value;
    }
  } else if (Array.isArray(value)) {
    truncatedValue = config?.truncateFrom === 'start'
      ? value.slice(-maxLength)
      : value.slice(0, maxLength);
  } else {
    return {
      success: false,
      message: `Cannot truncate value of type ${typeof value}`,
    };
  }

  const healedData = setValueAtPath(data, field, truncatedValue);

  return {
    success: true,
    healedData,
    message: `Truncated ${field} to max length ${maxLength}`,
    metadata: { originalLength: Array.isArray(value) ? value.length : (value as string).length, maxLength },
  };
};

// ============================================
// Coerce Strategy
// ============================================

export const coerceStrategy: StrategyExecutor = async (data, action) => {
  const config = action.params as CoerceConfig | undefined;
  const field = config?.field || action.field;

  if (!field) {
    return {
      success: false,
      message: 'Field not specified for coercion',
    };
  }

  const targetType = config?.targetType;
  if (!targetType) {
    return {
      success: false,
      message: 'Target type not specified for coercion',
    };
  }

  const { found, value } = getValueAtPath(data, field);
  if (!found) {
    return {
      success: false,
      message: `Field ${field} not found`,
    };
  }

  let coercedValue: unknown;

  try {
    switch (targetType) {
      case 'string':
        coercedValue = value === null || value === undefined ? '' : String(value);
        break;

      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          if (config?.strict) {
            return {
              success: false,
              message: `Cannot coerce ${value} to number`,
            };
          }
          coercedValue = 0;
        } else {
          coercedValue = num;
        }
        break;
      }

      case 'boolean':
        if (typeof value === 'string') {
          coercedValue = value.toLowerCase() === 'true' || value === '1';
        } else {
          coercedValue = Boolean(value);
        }
        break;

      case 'array':
        if (Array.isArray(value)) {
          coercedValue = value;
        } else if (value === null || value === undefined) {
          coercedValue = [];
        } else {
          coercedValue = [value];
        }
        break;

      case 'object':
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          coercedValue = value;
        } else if (typeof value === 'string') {
          try {
            coercedValue = JSON.parse(value);
          } catch {
            coercedValue = {};
          }
        } else {
          coercedValue = {};
        }
        break;

      default:
        return {
          success: false,
          message: `Unknown target type: ${targetType}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      message: `Coercion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  const healedData = setValueAtPath(data, field, coercedValue);

  return {
    success: true,
    healedData,
    message: `Coerced ${field} to ${targetType}`,
    metadata: { originalType: typeof value, targetType },
  };
};

// ============================================
// Skip Strategy
// ============================================

export const skipStrategy: StrategyExecutor = async (data) => {
  return {
    success: true,
    healedData: data,
    message: 'Assertion skipped (warning only)',
  };
};

// ============================================
// Escalate Strategy
// ============================================

export const escalateStrategy: StrategyExecutor = async (data, action, context) => {
  // In a real implementation, this would call a webhook or create a ticket
  const webhookUrl = context.config?.escalationWebhook as string | undefined;

  return {
    success: false, // Escalation means healing failed, needs human intervention
    healedData: data,
    message: webhookUrl
      ? `Escalated to ${webhookUrl} for human review`
      : 'Escalated for human review (no webhook configured)',
    metadata: {
      assertionId: action.assertionId,
      field: action.field,
      reason: context.assertionResult?.message,
    },
  };
};

// ============================================
// Strategy Registry
// ============================================

export const strategyExecutors: Record<HealingStrategy, StrategyExecutor> = {
  retry: retryStrategy,
  retry_modified: retryModifiedStrategy,
  fallback: fallbackStrategy,
  transform: transformStrategy,
  default_value: defaultValueStrategy,
  truncate: truncateStrategy,
  coerce: coerceStrategy,
  skip: skipStrategy,
  escalate: escalateStrategy,
};

/**
 * Execute a healing strategy
 */
export async function executeStrategy(
  strategy: HealingStrategy,
  data: unknown,
  action: HealingAction,
  context: StrategyContext
): Promise<StrategyExecutionResult> {
  const executor = strategyExecutors[strategy];
  if (!executor) {
    return {
      success: false,
      message: `Unknown strategy: ${strategy}`,
    };
  }
  return executor(data, action, context);
}
