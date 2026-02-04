/**
 * Time-Travel Debugger & Deterministic Replay
 *
 * Provides checkpoint-based debugging for FALL agent runs:
 * - Create checkpoints at each step
 * - Replay from any checkpoint
 * - Fork runs for what-if analysis
 * - Diff between checkpoints or runs
 *
 * @module fall/time-travel
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface FallRun {
  id: string;
  organization_id: string;
  trace_id: string;
  root_span_id?: string;
  name?: string;
  description?: string;
  agent_config: Record<string, unknown>;
  model_id?: string;
  system_prompt?: string;
  initial_input: Record<string, unknown>;
  final_output?: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'forked';
  error_message?: string;
  total_steps: number;
  total_tokens: number;
  total_latency_ms: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface CheckpointState {
  messages: Message[];
  context: Record<string, unknown>;
  memory: Record<string, unknown>;
  toolCalls: ToolCall[];
  customState?: Record<string, unknown>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface Checkpoint {
  id: string;
  run_id: string;
  step_number: number;
  span_id?: string;
  checkpoint_type: 'auto' | 'manual' | 'breakpoint' | 'error';
  state_json: CheckpointState;
  messages_snapshot: Message[];
  context_snapshot: Record<string, unknown>;
  memory_snapshot: Record<string, unknown>;
  tool_calls_snapshot: ToolCall[];
  step_type?: string;
  step_input?: Record<string, unknown>;
  step_output?: Record<string, unknown>;
  tokens_used: number;
  latency_ms: number;
  state_hash: string;
  prev_checkpoint_hash?: string;
  created_at: string;
}

export interface Fork {
  id: string;
  parent_run_id: string;
  fork_run_id: string;
  fork_checkpoint_id: string;
  fork_step_number: number;
  reason?: string;
  patch_json: Record<string, unknown>;
  modified_input: boolean;
  modified_context: boolean;
  modified_system_prompt: boolean;
  modified_model: boolean;
  created_by?: string;
  created_at: string;
}

export interface Breakpoint {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  condition_type: 'step_number' | 'tool_call' | 'token_threshold' | 'output_pattern' | 'custom';
  condition_value: Record<string, unknown>;
  action: 'pause' | 'checkpoint' | 'log';
  is_active: boolean;
  hit_count: number;
  last_hit_at?: string;
  created_by?: string;
  created_at: string;
}

export interface StateDiff {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

export interface ReplayOptions {
  fromStep?: number;
  toStep?: number;
  patches?: Record<string, unknown>[];
  breakpoints?: string[];
  stepByStep?: boolean;
  onCheckpoint?: (checkpoint: Checkpoint) => Promise<void>;
  onBreakpoint?: (breakpoint: Breakpoint, checkpoint: Checkpoint) => Promise<'continue' | 'pause'>;
}

export interface ForkOptions {
  fromCheckpointId?: string;
  fromStep?: number;
  patches: Record<string, unknown>;
  reason?: string;
  name?: string;
}

// ============================================
// Time Travel Debugger Class
// ============================================

export class TimeTravelDebugger {
  private supabase = createServerClient();
  private currentRun: FallRun | null = null;
  private checkpoints: Map<number, Checkpoint> = new Map();

  /**
   * Start a new run for time-travel debugging
   */
  async startRun(params: {
    organizationId: string;
    traceId: string;
    initialInput: Record<string, unknown>;
    agentConfig?: Record<string, unknown>;
    modelId?: string;
    systemPrompt?: string;
    name?: string;
    description?: string;
    userId?: string;
  }): Promise<FallRun> {
    const { data, error } = await this.supabase
      .from('fall_runs')
      .insert({
        organization_id: params.organizationId,
        trace_id: params.traceId,
        initial_input: params.initialInput,
        agent_config: params.agentConfig || {},
        model_id: params.modelId,
        system_prompt: params.systemPrompt,
        name: params.name,
        description: params.description,
        created_by: params.userId,
        status: 'running',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to start run: ${error.message}`);

    this.currentRun = data as FallRun;
    this.checkpoints.clear();

    return this.currentRun;
  }

  /**
   * Load an existing run
   */
  async loadRun(runId: string): Promise<FallRun> {
    const { data: run, error: runError } = await this.supabase
      .from('fall_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError) throw new Error(`Failed to load run: ${runError.message}`);

    this.currentRun = run as FallRun;

    // Load all checkpoints
    const { data: checkpoints, error: checkpointError } = await this.supabase
      .from('fall_run_checkpoints')
      .select('*')
      .eq('run_id', runId)
      .order('step_number', { ascending: true });

    if (checkpointError) throw new Error(`Failed to load checkpoints: ${checkpointError.message}`);

    this.checkpoints.clear();
    for (const cp of checkpoints || []) {
      this.checkpoints.set(cp.step_number, cp as Checkpoint);
    }

    return this.currentRun;
  }

  /**
   * Create a checkpoint at current step
   */
  async createCheckpoint(params: {
    stepNumber: number;
    state: CheckpointState;
    stepType?: string;
    stepInput?: Record<string, unknown>;
    stepOutput?: Record<string, unknown>;
    tokensUsed?: number;
    latencyMs?: number;
    checkpointType?: 'auto' | 'manual' | 'breakpoint' | 'error';
    spanId?: string;
  }): Promise<Checkpoint> {
    if (!this.currentRun) {
      throw new Error('No active run. Call startRun() or loadRun() first.');
    }

    // Get previous checkpoint hash
    const prevCheckpoint = this.checkpoints.get(params.stepNumber - 1);
    const prevHash = prevCheckpoint?.state_hash || null;

    // Compute state hash
    const stateHash = this.computeStateHash(
      this.currentRun.id,
      params.stepNumber,
      params.state,
      prevHash
    );

    const { data, error } = await this.supabase
      .from('fall_run_checkpoints')
      .insert({
        run_id: this.currentRun.id,
        step_number: params.stepNumber,
        span_id: params.spanId,
        checkpoint_type: params.checkpointType || 'auto',
        state_json: params.state,
        messages_snapshot: params.state.messages,
        context_snapshot: params.state.context,
        memory_snapshot: params.state.memory,
        tool_calls_snapshot: params.state.toolCalls,
        step_type: params.stepType,
        step_input: params.stepInput,
        step_output: params.stepOutput,
        tokens_used: params.tokensUsed || 0,
        latency_ms: params.latencyMs || 0,
        state_hash: stateHash,
        prev_checkpoint_hash: prevHash,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create checkpoint: ${error.message}`);

    const checkpoint = data as Checkpoint;
    this.checkpoints.set(params.stepNumber, checkpoint);

    return checkpoint;
  }

  /**
   * Get checkpoint at specific step
   */
  async getCheckpoint(stepNumber: number): Promise<Checkpoint | null> {
    // Check cache first
    if (this.checkpoints.has(stepNumber)) {
      return this.checkpoints.get(stepNumber)!;
    }

    if (!this.currentRun) {
      throw new Error('No active run');
    }

    const { data, error } = await this.supabase
      .from('fall_run_checkpoints')
      .select('*')
      .eq('run_id', this.currentRun.id)
      .eq('step_number', stepNumber)
      .single();

    if (error) return null;

    const checkpoint = data as Checkpoint;
    this.checkpoints.set(stepNumber, checkpoint);

    return checkpoint;
  }

  /**
   * Get all checkpoints for current run
   */
  async getAllCheckpoints(): Promise<Checkpoint[]> {
    if (!this.currentRun) {
      throw new Error('No active run');
    }

    const { data, error } = await this.supabase
      .from('fall_run_checkpoints')
      .select('*')
      .eq('run_id', this.currentRun.id)
      .order('step_number', { ascending: true });

    if (error) throw new Error(`Failed to get checkpoints: ${error.message}`);

    return (data || []) as Checkpoint[];
  }

  /**
   * Replay run from a specific checkpoint
   */
  async replay(runId: string, options: ReplayOptions = {}): Promise<CheckpointState> {
    await this.loadRun(runId);

    const fromStep = options.fromStep || 0;
    const checkpoint = await this.getCheckpoint(fromStep);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found at step ${fromStep}`);
    }

    // Apply patches if provided
    let state = { ...checkpoint.state_json };
    if (options.patches) {
      for (const patch of options.patches) {
        state = this.applyPatch(state, patch);
      }
    }

    return state;
  }

  /**
   * Fork run from a checkpoint for what-if analysis
   */
  async forkRun(runId: string, options: ForkOptions): Promise<FallRun> {
    const parentRun = await this.loadRun(runId);

    // Find the checkpoint to fork from
    let checkpoint: Checkpoint | null = null;
    if (options.fromCheckpointId) {
      const checkpoints = await this.getAllCheckpoints();
      checkpoint = checkpoints.find((c) => c.id === options.fromCheckpointId) || null;
    } else if (options.fromStep !== undefined) {
      checkpoint = await this.getCheckpoint(options.fromStep);
    } else {
      // Fork from latest checkpoint
      const checkpoints = await this.getAllCheckpoints();
      checkpoint = checkpoints[checkpoints.length - 1] || null;
    }

    if (!checkpoint) {
      throw new Error('No checkpoint found to fork from');
    }

    // Apply patches to get new initial state
    const forkedState = this.applyPatch(checkpoint.state_json, options.patches);

    // Determine what was modified
    const modifiedInput = 'input' in options.patches;
    const modifiedContext = 'context' in options.patches;
    const modifiedSystemPrompt = 'systemPrompt' in options.patches;
    const modifiedModel = 'model' in options.patches;

    // Create new run
    const newRun = await this.startRun({
      organizationId: parentRun.organization_id,
      traceId: `fork-${parentRun.trace_id}-${Date.now()}`,
      initialInput: forkedState as Record<string, unknown>,
      agentConfig: parentRun.agent_config,
      modelId: modifiedModel ? (options.patches.model as string) : parentRun.model_id,
      systemPrompt: modifiedSystemPrompt
        ? (options.patches.systemPrompt as string)
        : parentRun.system_prompt,
      name: options.name || `Fork of ${parentRun.name || parentRun.id}`,
      description: options.reason,
    });

    // Record the fork relationship
    const { error: forkError } = await this.supabase.from('fall_run_forks').insert({
      parent_run_id: runId,
      fork_run_id: newRun.id,
      fork_checkpoint_id: checkpoint.id,
      fork_step_number: checkpoint.step_number,
      reason: options.reason,
      patch_json: options.patches,
      modified_input: modifiedInput,
      modified_context: modifiedContext,
      modified_system_prompt: modifiedSystemPrompt,
      modified_model: modifiedModel,
    });

    if (forkError) {
      console.error('Failed to record fork:', forkError);
    }

    // Update parent run status
    await this.supabase.from('fall_runs').update({ status: 'forked' }).eq('id', runId);

    return newRun;
  }

  /**
   * Compute diff between two checkpoints
   */
  diffCheckpoints(checkpoint1: Checkpoint, checkpoint2: Checkpoint): StateDiff[] {
    return this.deepDiff(checkpoint1.state_json, checkpoint2.state_json);
  }

  /**
   * Compute diff between two runs at same step
   */
  async diffRuns(
    runId1: string,
    runId2: string,
    step: number
  ): Promise<{ diffs: StateDiff[]; checkpoint1?: Checkpoint; checkpoint2?: Checkpoint }> {
    const debugger1 = new TimeTravelDebugger();
    const debugger2 = new TimeTravelDebugger();

    await debugger1.loadRun(runId1);
    await debugger2.loadRun(runId2);

    const checkpoint1 = await debugger1.getCheckpoint(step);
    const checkpoint2 = await debugger2.getCheckpoint(step);

    if (!checkpoint1 || !checkpoint2) {
      return { diffs: [], checkpoint1: checkpoint1 || undefined, checkpoint2: checkpoint2 || undefined };
    }

    return {
      diffs: this.diffCheckpoints(checkpoint1, checkpoint2),
      checkpoint1,
      checkpoint2,
    };
  }

  /**
   * Verify checkpoint chain integrity
   */
  async verifyIntegrity(): Promise<{
    valid: boolean;
    checkedCount: number;
    firstInvalidStep?: number;
    error?: string;
  }> {
    if (!this.currentRun) {
      throw new Error('No active run');
    }

    const checkpoints = await this.getAllCheckpoints();
    let prevHash: string | null = null;

    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];

      // Verify hash chain
      if (cp.prev_checkpoint_hash !== prevHash) {
        return {
          valid: false,
          checkedCount: i + 1,
          firstInvalidStep: cp.step_number,
          error: `Hash chain broken at step ${cp.step_number}`,
        };
      }

      // Verify state hash
      const expectedHash = this.computeStateHash(
        this.currentRun.id,
        cp.step_number,
        cp.state_json,
        prevHash
      );

      if (cp.state_hash !== expectedHash) {
        return {
          valid: false,
          checkedCount: i + 1,
          firstInvalidStep: cp.step_number,
          error: `State hash mismatch at step ${cp.step_number}`,
        };
      }

      prevHash = cp.state_hash;
    }

    return { valid: true, checkedCount: checkpoints.length };
  }

  /**
   * Complete the current run
   */
  async completeRun(finalOutput?: Record<string, unknown>, error?: string): Promise<void> {
    if (!this.currentRun) {
      throw new Error('No active run');
    }

    const status = error ? 'failed' : 'completed';

    await this.supabase
      .from('fall_runs')
      .update({
        status,
        final_output: finalOutput,
        error_message: error,
        completed_at: new Date().toISOString(),
      })
      .eq('id', this.currentRun.id);

    this.currentRun.status = status;
    this.currentRun.final_output = finalOutput;
    this.currentRun.error_message = error;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private computeStateHash(
    runId: string,
    stepNumber: number,
    state: CheckpointState,
    prevHash: string | null
  ): string {
    const hashInput = `${runId}|${stepNumber}|${JSON.stringify(state)}|${prevHash || 'genesis'}`;
    return createHash('sha256').update(hashInput).digest('hex');
  }

  private applyPatch(state: CheckpointState, patch: Record<string, unknown>): CheckpointState {
    const result = JSON.parse(JSON.stringify(state)) as CheckpointState;

    for (const [key, value] of Object.entries(patch)) {
      if (key === 'messages' && Array.isArray(value)) {
        result.messages = value as Message[];
      } else if (key === 'context' && typeof value === 'object') {
        result.context = { ...result.context, ...(value as Record<string, unknown>) };
      } else if (key === 'memory' && typeof value === 'object') {
        result.memory = { ...result.memory, ...(value as Record<string, unknown>) };
      } else if (key === 'toolCalls' && Array.isArray(value)) {
        result.toolCalls = value as ToolCall[];
      } else if (key in result) {
        (result as Record<string, unknown>)[key] = value;
      }
    }

    return result;
  }

  private deepDiff(
    obj1: unknown,
    obj2: unknown,
    path: string = ''
  ): StateDiff[] {
    const diffs: StateDiff[] = [];

    if (obj1 === obj2) return diffs;

    const type1 = typeof obj1;
    const type2 = typeof obj2;

    if (type1 !== type2) {
      diffs.push({
        path: path || '.',
        type: 'changed',
        oldValue: obj1,
        newValue: obj2,
      });
      return diffs;
    }

    if (type1 !== 'object' || obj1 === null || obj2 === null) {
      if (obj1 !== obj2) {
        diffs.push({
          path: path || '.',
          type: 'changed',
          oldValue: obj1,
          newValue: obj2,
        });
      }
      return diffs;
    }

    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      const maxLen = Math.max(obj1.length, obj2.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = path ? `${path}[${i}]` : `[${i}]`;
        if (i >= obj1.length) {
          diffs.push({ path: itemPath, type: 'added', newValue: obj2[i] });
        } else if (i >= obj2.length) {
          diffs.push({ path: itemPath, type: 'removed', oldValue: obj1[i] });
        } else {
          diffs.push(...this.deepDiff(obj1[i], obj2[i], itemPath));
        }
      }
      return diffs;
    }

    const record1 = obj1 as Record<string, unknown>;
    const record2 = obj2 as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(record1), ...Object.keys(record2)]);

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key;
      if (!(key in record1)) {
        diffs.push({ path: keyPath, type: 'added', newValue: record2[key] });
      } else if (!(key in record2)) {
        diffs.push({ path: keyPath, type: 'removed', oldValue: record1[key] });
      } else {
        diffs.push(...this.deepDiff(record1[key], record2[key], keyPath));
      }
    }

    return diffs;
  }
}

// ============================================
// Breakpoint Utilities
// ============================================

export class BreakpointManager {
  private supabase = createServerClient();

  async createBreakpoint(params: {
    organizationId: string;
    name: string;
    conditionType: Breakpoint['condition_type'];
    conditionValue: Record<string, unknown>;
    action?: Breakpoint['action'];
    description?: string;
    userId?: string;
  }): Promise<Breakpoint> {
    const { data, error } = await this.supabase
      .from('fall_breakpoints')
      .insert({
        organization_id: params.organizationId,
        name: params.name,
        description: params.description,
        condition_type: params.conditionType,
        condition_value: params.conditionValue,
        action: params.action || 'pause',
        created_by: params.userId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create breakpoint: ${error.message}`);
    return data as Breakpoint;
  }

  async getActiveBreakpoints(organizationId: string): Promise<Breakpoint[]> {
    const { data, error } = await this.supabase
      .from('fall_breakpoints')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error) throw new Error(`Failed to get breakpoints: ${error.message}`);
    return (data || []) as Breakpoint[];
  }

  async evaluateBreakpoints(
    breakpoints: Breakpoint[],
    context: {
      stepNumber: number;
      toolName?: string;
      totalTokens: number;
      output?: string;
      state: CheckpointState;
    }
  ): Promise<Breakpoint[]> {
    const triggered: Breakpoint[] = [];

    for (const bp of breakpoints) {
      if (this.shouldTrigger(bp, context)) {
        triggered.push(bp);
        // Update hit count
        await this.supabase
          .from('fall_breakpoints')
          .update({
            hit_count: bp.hit_count + 1,
            last_hit_at: new Date().toISOString(),
          })
          .eq('id', bp.id);
      }
    }

    return triggered;
  }

  private shouldTrigger(
    bp: Breakpoint,
    context: {
      stepNumber: number;
      toolName?: string;
      totalTokens: number;
      output?: string;
      state: CheckpointState;
    }
  ): boolean {
    switch (bp.condition_type) {
      case 'step_number':
        return context.stepNumber === bp.condition_value.step;

      case 'tool_call':
        return context.toolName === bp.condition_value.toolName;

      case 'token_threshold':
        return context.totalTokens >= (bp.condition_value.threshold as number);

      case 'output_pattern':
        if (!context.output) return false;
        const pattern = new RegExp(bp.condition_value.pattern as string);
        return pattern.test(context.output);

      case 'custom':
        // Custom conditions would need a safe eval sandbox
        // For now, just return false
        return false;

      default:
        return false;
    }
  }
}

// ============================================
// Export convenience functions
// ============================================

export async function createDebugger(): Promise<TimeTravelDebugger> {
  return new TimeTravelDebugger();
}

export async function createBreakpointManager(): Promise<BreakpointManager> {
  return new BreakpointManager();
}
