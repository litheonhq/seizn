const BANDS: ReadonlyArray<{ min: number; max: number; key: string; strokeWidth: number }> = [
  { min: 0.7, max: 1.01, key: 'very_strong_positive', strokeWidth: 4 },
  { min: 0.3, max: 0.7, key: 'positive', strokeWidth: 3 },
  { min: 0.1, max: 0.3, key: 'weak_positive', strokeWidth: 2 },
  { min: -0.1, max: 0.1, key: 'neutral', strokeWidth: 1 },
  { min: -0.3, max: -0.1, key: 'weak_negative', strokeWidth: 2 },
  { min: -0.7, max: -0.3, key: 'negative', strokeWidth: 3 },
  { min: -1.01, max: -0.7, key: 'very_strong_negative', strokeWidth: 4 },
];

export interface IntensityBand {
  key: string;
  strokeWidth: number;
}

export function intensityBand(value: number): IntensityBand {
  const clamped = Math.max(-1, Math.min(1, value));
  return (
    BANDS.find((b) => clamped >= b.min && clamped < b.max) ??
    BANDS.find((b) => b.key === 'neutral') ??
    BANDS[3]
  );
}
