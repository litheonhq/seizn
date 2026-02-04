/**
 * Seizn OPA Policy Evaluator
 *
 * TypeScript wrapper for OPA/Rego policy evaluation
 * Supports both WASM-compiled and interpreted modes
 */

import type {
  PolicyInput,
  PolicyDecision,
  K12PolicyDecision,
  PolicyEvaluationOptions,
  PolicyEvaluationResult,
  PolicyBundle,
  PolicyTrace,
} from './types';

// ============================================
// Policy Cache
// ============================================

interface PolicyCache {
  bundle: PolicyBundle | null;
  wasmInstance: WebAssembly.Instance | null;
  lastLoaded: number;
  ttlMs: number;
}

const policyCache: PolicyCache = {
  bundle: null,
  wasmInstance: null,
  lastLoaded: 0,
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================
// WASM Memory Management
// ============================================

interface WasmMemory {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  heap: Uint8Array;
  heapPtr: number;
  heapEnd: number;
}

let wasmMemory: WasmMemory | null = null;

function initWasmMemory(instance: WebAssembly.Instance): WasmMemory {
  const memory = instance.exports.memory as WebAssembly.Memory;
  const heap = new Uint8Array(memory.buffer);
  const heapBase = (instance.exports.opa_heap_ptr_get as () => number)();
  const heapEnd = (instance.exports.opa_heap_top_get as () => number)();

  return {
    instance,
    memory,
    heap,
    heapPtr: heapBase,
    heapEnd,
  };
}

function writeString(mem: WasmMemory, str: string): number {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const ptr = mem.heapPtr;

  // Ensure we have enough space
  if (ptr + bytes.length + 1 > mem.heapEnd) {
    throw new Error('WASM heap overflow');
  }

  mem.heap.set(bytes, ptr);
  mem.heap[ptr + bytes.length] = 0; // null terminator
  mem.heapPtr = ptr + bytes.length + 1;

  return ptr;
}

function readString(mem: WasmMemory, ptr: number): string {
  const decoder = new TextDecoder();
  let end = ptr;
  while (mem.heap[end] !== 0) {
    end++;
  }
  return decoder.decode(mem.heap.slice(ptr, end));
}

// ============================================
// Policy Evaluator Class
// ============================================

export class PolicyEvaluator {
  private bundlePath: string;
  private entrypoint: string;
  private strict: boolean;

  constructor(options: {
    bundlePath?: string;
    entrypoint?: string;
    strict?: boolean;
  } = {}) {
    this.bundlePath = options.bundlePath || '/policies/seizn.wasm';
    this.entrypoint = options.entrypoint || 'seizn/decision';
    this.strict = options.strict ?? true;
  }

  /**
   * Load WASM bundle from URL or cache
   */
  async loadBundle(): Promise<PolicyBundle> {
    const now = Date.now();

    // Return cached bundle if valid
    if (
      policyCache.bundle &&
      policyCache.wasmInstance &&
      now - policyCache.lastLoaded < policyCache.ttlMs
    ) {
      return policyCache.bundle;
    }

    // Fetch WASM bundle
    const response = await fetch(this.bundlePath);
    if (!response.ok) {
      throw new Error(`Failed to load policy bundle: ${response.status}`);
    }

    const wasm = await response.arrayBuffer();

    // Compile WASM module
    const module = await WebAssembly.compile(wasm);
    const instance = await WebAssembly.instantiate(module, {
      env: {
        opa_abort: (addr: number) => {
          const msg = wasmMemory ? readString(wasmMemory, addr) : 'unknown error';
          throw new Error(`OPA abort: ${msg}`);
        },
        opa_println: (addr: number) => {
          const msg = wasmMemory ? readString(wasmMemory, addr) : '';
          console.log('[OPA]', msg);
        },
        opa_builtin0: () => 0,
        opa_builtin1: () => 0,
        opa_builtin2: () => 0,
        opa_builtin3: () => 0,
        opa_builtin4: () => 0,
      },
    });

    // Initialize WASM memory
    wasmMemory = initWasmMemory(instance);

    // Update cache
    policyCache.bundle = {
      name: 'seizn',
      version: '1.0.0',
      policies: ['seizn.rego', 'k12.rego'],
      wasm,
      compiledAt: new Date().toISOString(),
    };
    policyCache.wasmInstance = instance;
    policyCache.lastLoaded = now;

    return policyCache.bundle;
  }

  /**
   * Evaluate policy with given input
   */
  async evaluate(
    input: PolicyInput,
    options?: PolicyEvaluationOptions
  ): Promise<PolicyEvaluationResult<PolicyDecision>> {
    const startTime = performance.now();
    const entrypoint = options?.entrypoint || this.entrypoint;

    try {
      // Try WASM evaluation first
      const decision = await this.evaluateWasm<PolicyDecision>(input, entrypoint);
      const endTime = performance.now();

      return {
        decision,
        evaluationTime: endTime - startTime,
        bundleVersion: policyCache.bundle?.version || '0.0.0',
      };
    } catch (wasmError) {
      // Fallback to interpreted evaluation
      console.warn('WASM evaluation failed, using fallback:', wasmError);
      const decision = this.evaluateFallback(input);
      const endTime = performance.now();

      return {
        decision,
        evaluationTime: endTime - startTime,
        bundleVersion: 'fallback',
      };
    }
  }

  /**
   * Evaluate K-12 specific policy
   */
  async evaluateK12(
    input: PolicyInput,
    options?: PolicyEvaluationOptions
  ): Promise<PolicyEvaluationResult<K12PolicyDecision>> {
    const startTime = performance.now();
    const entrypoint = options?.entrypoint || 'seizn/k12/decision';

    try {
      const decision = await this.evaluateWasm<K12PolicyDecision>(input, entrypoint);
      const endTime = performance.now();

      return {
        decision,
        evaluationTime: endTime - startTime,
        bundleVersion: policyCache.bundle?.version || '0.0.0',
      };
    } catch {
      const decision = this.evaluateK12Fallback(input);
      const endTime = performance.now();

      return {
        decision,
        evaluationTime: endTime - startTime,
        bundleVersion: 'fallback',
      };
    }
  }

  /**
   * WASM-based policy evaluation
   */
  private async evaluateWasm<T>(input: PolicyInput, entrypoint: string): Promise<T> {
    await this.loadBundle();

    if (!policyCache.wasmInstance || !wasmMemory) {
      throw new Error('WASM instance not loaded');
    }

    const instance = policyCache.wasmInstance;
    const exports = instance.exports as Record<string, WebAssembly.ExportValue>;

    // Reset heap
    const heapReset = exports.opa_heap_ptr_set as (ptr: number) => void;
    const heapBase = (exports.opa_heap_ptr_get as () => number)();
    heapReset(heapBase);
    wasmMemory.heapPtr = heapBase;

    // Write input JSON to memory
    const inputJson = JSON.stringify(input);
    const inputPtr = writeString(wasmMemory, inputJson);

    // Parse input
    const jsonParse = exports.opa_json_parse as (ptr: number, len: number) => number;
    const inputAddr = jsonParse(inputPtr, inputJson.length);

    // Evaluate policy
    const eval_ = exports.opa_eval as (
      reserved: number,
      entrypoint: number,
      data: number,
      input: number,
      inputLen: number,
      heapPtr: number,
      format: number
    ) => number;

    // Convert entrypoint to numeric ID (simplified - actual OPA uses entrypoint index)
    const entrypointId = entrypoint === 'seizn/k12/decision' ? 1 : 0;

    const resultAddr = eval_(
      0, // reserved
      entrypointId, // entrypoint
      0, // data (empty)
      inputAddr, // input
      0, // input length (not used for parsed input)
      wasmMemory.heapPtr, // heap pointer
      0 // format: json
    );

    // Read result
    const jsonDump = exports.opa_json_dump as (addr: number) => number;
    const resultPtr = jsonDump(resultAddr);
    const resultJson = readString(wasmMemory, resultPtr);

    return JSON.parse(resultJson) as T;
  }

  /**
   * Fallback policy evaluation (TypeScript implementation)
   */
  private evaluateFallback(input: PolicyInput): PolicyDecision {
    const denyReasons: string[] = [];
    let allow = true;

    // Validate user
    if (!input.user?.id || !input.user?.role) {
      denyReasons.push('invalid_user');
      allow = false;
    }

    // Check IP blocklist
    if (input.policy_config?.ip_denylist?.includes(input.context.ip_address || '')) {
      denyReasons.push('ip_blocked');
      allow = false;
    }

    // Check IP allowlist
    if (
      input.policy_config?.ip_allowlist?.length &&
      !input.policy_config.ip_allowlist.includes(input.context.ip_address || '')
    ) {
      denyReasons.push('ip_blocked');
      allow = false;
    }

    // Check rate limit
    const rateLimits: Record<string, number> = {
      free: 60,
      starter: 120,
      plus: 300,
      pro: 600,
      enterprise: 3000,
    };
    const rateLimit = rateLimits[input.user.plan] || 60;
    if ((input.context.request_count_minute || 0) > rateLimit) {
      denyReasons.push('rate_limit_exceeded');
      allow = false;
    }

    // Check 2FA requirement
    if (input.policy_config?.require_2fa && !input.user.has_2fa) {
      denyReasons.push('2fa_required');
      allow = false;
    }

    // Determine PII action
    const piiDetected = input.data?.pii_detected || [];
    let piiAction: 'allow' | 'mask' | 'deny' | 'encrypt' = 'allow';
    if (piiDetected.length > 0) {
      piiAction = input.policy_config?.pii_action || 'mask';
      if (piiAction === 'deny') {
        denyReasons.push('pii_denied');
        allow = false;
      }
    }

    // Determine audit requirement
    const auditActions = [
      'memory.write',
      'memory.delete',
      'trace.share',
      'api_key.create',
      'api_key.revoke',
      'policy.update',
      'member.role_change',
    ];
    const auditRequired =
      auditActions.includes(input.action) ||
      input.policy_config?.log_all_api_calls === true;

    return {
      allow: allow && denyReasons.length === 0,
      deny_reasons: denyReasons,
      pii_action: piiAction,
      rate_limit: rateLimit,
      audit_required: auditRequired,
      evaluated_at: input.context.timestamp,
    };
  }

  /**
   * Fallback K-12 policy evaluation
   */
  private evaluateK12Fallback(input: PolicyInput): K12PolicyDecision {
    const session = input.session || {};
    const config = input.policy_config || {};

    // Determine hint level
    const maxHints = config.max_hints ?? 5;
    const hintsUsed = session.hints_used ?? 0;
    const hintLevel = session.mode === 'assessment' ? 0 : Math.min(hintsUsed + 1, maxHints);

    // Determine hint type
    const hintTypes: Array<'conceptual' | 'strategy' | 'partial' | 'scaffold' | 'worked'> = [
      'conceptual',
      'strategy',
      'partial',
      'scaffold',
      'worked',
    ];
    const hintType = hintTypes[Math.min(hintLevel - 1, hintTypes.length - 1)];

    // Determine answer allowed
    const answerAllowed =
      input.user.role !== 'student' ||
      (hintsUsed >= maxHints && (session.attempts ?? 0) >= 3 && config.answer_reveal_allowed === true);

    // Determine safety action
    const contentFlags = input.data?.content_flags || [];
    const blockedForChild = ['violence', 'adult_content', 'profanity', 'scary_content'];
    const hasBlockedContent = contentFlags.some((f) => blockedForChild.includes(f));
    let safetyAction: 'allow' | 'block' | 'block_and_notify_parent' = 'allow';
    if (hasBlockedContent && config.safety_level === 'child') {
      safetyAction = 'block_and_notify_parent';
    } else if (hasBlockedContent) {
      safetyAction = 'block';
    }

    // Determine session time limit
    const timeLimits: Record<string, number> = {
      elementary: 30,
      middle: 45,
      high: 60,
    };
    const sessionTimeLimit = timeLimits[input.user.grade_band || 'middle'] || 45;

    // Grade appropriate check
    const gradeAppropriate =
      input.user.role !== 'student' ||
      !input.data?.content_level ||
      this.isGradeAppropriate(input.user.grade_band, input.data.content_level);

    return {
      allow: !hasBlockedContent,
      hint_level: hintLevel,
      hint_type: hintLevel > 0 ? hintType : undefined,
      answer_allowed: answerAllowed,
      safety_action: safetyAction,
      session_time_limit: sessionTimeLimit,
      grade_appropriate: gradeAppropriate,
    };
  }

  private isGradeAppropriate(gradeBand?: string, contentLevel?: string): boolean {
    const mapping: Record<string, string[]> = {
      elementary: ['K-2', '3-5'],
      middle: ['6-8'],
      high: ['9-12'],
    };
    return mapping[gradeBand || 'middle']?.includes(contentLevel || '') ?? true;
  }

  /**
   * Clear policy cache
   */
  clearCache(): void {
    policyCache.bundle = null;
    policyCache.wasmInstance = null;
    policyCache.lastLoaded = 0;
    wasmMemory = null;
  }

  /**
   * Get cache status
   */
  getCacheStatus(): {
    loaded: boolean;
    version: string | null;
    age: number;
    ttl: number;
  } {
    return {
      loaded: policyCache.bundle !== null,
      version: policyCache.bundle?.version || null,
      age: Date.now() - policyCache.lastLoaded,
      ttl: policyCache.ttlMs,
    };
  }
}

// ============================================
// Default Evaluator Instance
// ============================================

let defaultEvaluator: PolicyEvaluator | null = null;

export function getDefaultEvaluator(): PolicyEvaluator {
  if (!defaultEvaluator) {
    defaultEvaluator = new PolicyEvaluator();
  }
  return defaultEvaluator;
}

/**
 * Quick evaluation helper
 */
export async function evaluatePolicy(
  input: PolicyInput,
  options?: PolicyEvaluationOptions
): Promise<PolicyEvaluationResult<PolicyDecision>> {
  const evaluator = getDefaultEvaluator();
  return evaluator.evaluate(input, options);
}

/**
 * Quick K-12 evaluation helper
 */
export async function evaluateK12Policy(
  input: PolicyInput,
  options?: PolicyEvaluationOptions
): Promise<PolicyEvaluationResult<K12PolicyDecision>> {
  const evaluator = getDefaultEvaluator();
  return evaluator.evaluateK12(input, options);
}
