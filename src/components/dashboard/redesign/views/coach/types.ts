import type { AntiClicheCategory } from '@/lib/author/frameworks';

export interface CoachAnalysisResponse {
  hash: string;
  storyLayers: Array<{ layer: string; present: boolean; evidence: string }>;
  characterArcs: Array<{
    characterName: string;
    inferredSacredFlaw: string;
    inferredInternalNeed: string;
    inferredExternalWant: string;
    arcPhaseFit: string;
    arcDirection?: 'positive' | 'negative' | 'flat' | null;
  }>;
  criticNotes: Array<{
    critic: string;
    rating: number;
    suggestions: string[];
  }>;
  antiCliche: import('@/lib/author/frameworks').AntiClicheFinding[];
  latencyMs: number;
  cached: boolean;
}

export const CATEGORY_LABEL: Record<AntiClicheCategory, string> = {
  opening: 'Opening',
  emotional: 'Emotional',
  description: 'Description',
  action: 'Action',
  dialogue: 'Dialogue',
  ai_specific: 'AI patterns',
};

export type DashboardTranslate = (key: string) => string;
