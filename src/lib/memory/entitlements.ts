export const ENCRYPTED_MEMORY_REQUIRED_PLAN = 'starter' as const;

export const ENCRYPTED_MEMORY_PLAN_ERROR_MESSAGE =
  'E2E encrypted memories are available on Starter plan or above.';

function normalizePlan(plan: string | null | undefined): string {
  if (!plan) return 'free';
  return plan.trim().toLowerCase();
}

export function canUseEncryptedMemories(plan: string | null | undefined): boolean {
  return normalizePlan(plan) !== 'free';
}

export function getEncryptedMemoryPlanError() {
  return {
    error: ENCRYPTED_MEMORY_PLAN_ERROR_MESSAGE,
    required_plan: ENCRYPTED_MEMORY_REQUIRED_PLAN,
  };
}

