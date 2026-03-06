"use client";

const STEP_STORAGE_KEYS: Record<SeiznOnboardingStepId, string> = {
  create_org: "seizn_org_created",
  api_key: "seizn_api_key_created",
  install_sdk: "seizn_sdk_copied",
  first_query: "seizn_first_query",
  view_trace: "seizn_trace_viewed",
};

const DISMISSED_PREFIX = "seizn_onboarding_dismissed_";
const STEP_COMPLETED_EVENT = "seizn:onboarding-step-completed";

export function getOnboardingDismissedStorageKey(userId: string) {
  return `${DISMISSED_PREFIX}${userId}`;
}

export function isOnboardingStepStoredComplete(stepId: SeiznOnboardingStepId) {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(STEP_STORAGE_KEYS[stepId]) === "true";
}

export function markOnboardingStepComplete(stepId: SeiznOnboardingStepId) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(STEP_STORAGE_KEYS[stepId], "true");
  window.dispatchEvent(
    new CustomEvent<SeiznOnboardingStepCompletedDetail>(STEP_COMPLETED_EVENT, {
      detail: { stepId },
    })
  );
}

export function dismissOnboarding(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(getOnboardingDismissedStorageKey(userId), "true");
}

export function isOnboardingDismissed(userId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(getOnboardingDismissedStorageKey(userId)) === "true";
}

export function subscribeToOnboardingStepCompleted(
  listener: (stepId: SeiznOnboardingStepId) => void
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SeiznOnboardingStepCompletedDetail>).detail;
    if (detail?.stepId) {
      listener(detail.stepId);
    }
  };

  window.addEventListener(STEP_COMPLETED_EVENT, handler);
  return () => window.removeEventListener(STEP_COMPLETED_EVENT, handler);
}
