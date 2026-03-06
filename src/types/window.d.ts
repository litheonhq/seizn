export {};

declare global {
  type SeiznOnboardingStepId =
    | 'create_org'
    | 'api_key'
    | 'install_sdk'
    | 'first_query'
    | 'view_trace';

  interface SeiznOnboardingStepCompletedDetail {
    stepId: SeiznOnboardingStepId;
  }

  interface Window {
    seiznOnboarding?: {
      markComplete: (stepId: SeiznOnboardingStepId) => void;
    };
  }
}
