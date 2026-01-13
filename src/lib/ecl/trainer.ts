/**
 * ECL Trainer - Learns vector space translation
 *
 * Implements linear algebra-based translation learning between
 * embedding spaces using least squares optimization.
 */

import type {
  TrainingConfig,
  TrainingResult,
  TrainingMetrics,
  TranslationType,
  DEFAULT_TRAINING_CONFIG,
} from './types';

// ============================================
// Linear Algebra Utilities
// ============================================

/**
 * Matrix transpose
 */
function transpose(matrix: number[][]): number[][] {
  if (matrix.length === 0) return [];
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: number[][] = Array(cols)
    .fill(null)
    .map(() => Array(rows).fill(0));

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}

/**
 * Matrix multiplication: A (m x n) * B (n x p) = C (m x p)
 */
function matmul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const p = B[0].length;

  if (n !== B.length) {
    throw new Error(`Matrix dimension mismatch: ${m}x${n} * ${B.length}x${p}`);
  }

  const result: number[][] = Array(m)
    .fill(null)
    .map(() => Array(p).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

/**
 * Matrix-vector multiplication: A (m x n) * v (n x 1) = r (m x 1)
 */
function matvec(A: number[][], v: number[]): number[] {
  const m = A.length;
  const n = A[0].length;

  if (n !== v.length) {
    throw new Error(`Dimension mismatch: ${m}x${n} matrix * ${v.length} vector`);
  }

  const result: number[] = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += A[i][j] * v[j];
    }
    result[i] = sum;
  }
  return result;
}

/**
 * Add scalar * identity to a square matrix (for regularization)
 */
function addScaledIdentity(matrix: number[][], scalar: number): number[][] {
  const n = matrix.length;
  const result = matrix.map((row) => [...row]);

  for (let i = 0; i < n; i++) {
    result[i][i] += scalar;
  }
  return result;
}

/**
 * Solve linear system Ax = b using Gaussian elimination with partial pivoting
 * Returns x
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;

  // Create augmented matrix [A|b]
  const augmented = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(augmented[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > maxVal) {
        maxVal = Math.abs(augmented[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];
    }

    // Check for singular matrix
    if (Math.abs(augmented[col][col]) < 1e-12) {
      throw new Error('Matrix is singular or nearly singular');
    }

    // Eliminate column
    for (let row = col + 1; row < n; row++) {
      const factor = augmented[row][col] / augmented[col][col];
      for (let j = col; j <= n; j++) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  // Back substitution
  const x = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = augmented[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= augmented[row][col] * x[col];
    }
    x[row] = sum / augmented[row][row];
  }

  return x;
}

/**
 * Compute vector L2 norm
 */
function vectorNorm(v: number[]): number {
  return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
}

/**
 * Normalize vector to unit length
 */
function normalizeVector(v: number[]): number[] {
  const norm = vectorNorm(v);
  if (norm < 1e-12) return v.map(() => 0);
  return v.map((x) => x / norm);
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0;
  return dotProduct / denom;
}

/**
 * Compute mean squared error between two arrays
 */
function meanSquaredError(predicted: number[][], actual: number[][]): number {
  if (predicted.length !== actual.length) {
    throw new Error('Array lengths must match');
  }

  let totalError = 0;
  let count = 0;

  for (let i = 0; i < predicted.length; i++) {
    for (let j = 0; j < predicted[i].length; j++) {
      const diff = predicted[i][j] - actual[i][j];
      totalError += diff * diff;
      count++;
    }
  }

  return count > 0 ? totalError / count : 0;
}

// ============================================
// Training Functions
// ============================================

export interface TrainingData {
  source: number[];  // Source embedding
  target: number[];  // Target embedding
}

/**
 * Split data into training and validation sets
 */
function splitData(
  data: TrainingData[],
  validationSplit: number,
  seed?: number
): { train: TrainingData[]; validation: TrainingData[] } {
  // Simple random shuffle (could use seeded random for reproducibility)
  const shuffled = [...data];

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const splitIdx = Math.floor(shuffled.length * (1 - validationSplit));

  return {
    train: shuffled.slice(0, splitIdx),
    validation: shuffled.slice(splitIdx),
  };
}

/**
 * Train a linear translation model using least squares
 *
 * Solves: minimize ||X * W - Y||^2 + lambda * ||W||^2
 *
 * Where:
 * - X is the source vectors matrix (n x sourceDim)
 * - Y is the target vectors matrix (n x targetDim)
 * - W is the weight matrix (sourceDim x targetDim)
 * - lambda is the regularization strength
 *
 * Solution: W = (X^T * X + lambda * I)^-1 * X^T * Y
 */
function trainLinear(
  sourceVectors: number[][],
  targetVectors: number[][],
  regularization: number
): number[][] {
  const n = sourceVectors.length;
  const sourceDim = sourceVectors[0].length;
  const targetDim = targetVectors[0].length;

  // X^T (sourceDim x n)
  const Xt = transpose(sourceVectors);

  // X^T * X (sourceDim x sourceDim)
  const XtX = matmul(Xt, sourceVectors);

  // Add regularization: X^T * X + lambda * I
  const regularized = addScaledIdentity(XtX, regularization * n);

  // X^T * Y (sourceDim x targetDim)
  const XtY = matmul(Xt, targetVectors);

  // Solve (X^T * X + lambda * I) * W = X^T * Y for each column of W
  // W is (sourceDim x targetDim)
  const W: number[][] = Array(sourceDim)
    .fill(null)
    .map(() => Array(targetDim).fill(0));

  // Solve column by column
  for (let j = 0; j < targetDim; j++) {
    // Extract j-th column of X^T * Y
    const column = XtY.map((row) => row[j]);

    // Solve for j-th column of W
    const wColumn = solveLinearSystem(regularized, column);

    // Store in W
    for (let i = 0; i < sourceDim; i++) {
      W[i][j] = wColumn[i];
    }
  }

  return W;
}

/**
 * Train an affine translation model (with bias)
 *
 * Solves: minimize ||X * W + b - Y||^2 + lambda * ||W||^2
 *
 * Augment X with column of 1s to incorporate bias into linear solve
 */
function trainAffine(
  sourceVectors: number[][],
  targetVectors: number[][],
  regularization: number
): { weights: number[][]; bias: number[] } {
  // Augment source vectors with column of 1s
  const augmented = sourceVectors.map((v) => [...v, 1]);

  // Use linear solve
  const augmentedW = trainLinear(augmented, targetVectors, regularization);

  // Extract weights and bias
  const sourceDim = sourceVectors[0].length;
  const targetDim = targetVectors[0].length;

  const weights: number[][] = Array(sourceDim)
    .fill(null)
    .map(() => Array(targetDim).fill(0));

  const bias: number[] = Array(targetDim).fill(0);

  for (let i = 0; i < sourceDim; i++) {
    for (let j = 0; j < targetDim; j++) {
      weights[i][j] = augmentedW[i][j];
    }
  }

  for (let j = 0; j < targetDim; j++) {
    bias[j] = augmentedW[sourceDim][j];
  }

  return { weights, bias };
}

/**
 * Apply translation to vectors
 */
export function applyTranslation(
  vector: number[],
  weights: number[][],
  bias?: number[]
): number[] {
  // W is (sourceDim x targetDim), vector is (sourceDim)
  // Result is (targetDim)
  const sourceDim = weights.length;
  const targetDim = weights[0].length;

  if (vector.length !== sourceDim) {
    throw new Error(`Vector dimension ${vector.length} doesn't match weight matrix ${sourceDim}`);
  }

  const result = Array(targetDim).fill(0);

  for (let j = 0; j < targetDim; j++) {
    let sum = 0;
    for (let i = 0; i < sourceDim; i++) {
      sum += vector[i] * weights[i][j];
    }
    result[j] = sum + (bias ? bias[j] : 0);
  }

  return result;
}

/**
 * Apply translation to multiple vectors
 */
export function applyTranslationBatch(
  vectors: number[][],
  weights: number[][],
  bias?: number[]
): number[][] {
  return vectors.map((v) => applyTranslation(v, weights, bias));
}

/**
 * Compute validation metrics
 */
function computeMetrics(
  predictions: number[][],
  targets: number[][],
  trainingPairs: number,
  validationPairs: number,
  trainingTimeMs: number
): TrainingMetrics {
  const mse = meanSquaredError(predictions, targets);
  const rmse = Math.sqrt(mse);

  // Compute cosine similarities
  const similarities = predictions.map((pred, i) =>
    cosineSimilarity(pred, targets[i])
  );

  const cosineMean =
    similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

  const cosineVariance =
    similarities.reduce((sum, s) => sum + (s - cosineMean) ** 2, 0) /
    similarities.length;
  const cosineStd = Math.sqrt(cosineVariance);

  // Compute R-squared
  // R2 = 1 - SS_res / SS_tot
  // SS_res = sum((y - y_pred)^2)
  // SS_tot = sum((y - y_mean)^2)

  // Compute mean of targets
  const targetMeans = Array(targets[0].length).fill(0);
  for (const target of targets) {
    for (let j = 0; j < target.length; j++) {
      targetMeans[j] += target[j] / targets.length;
    }
  }

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < targets.length; i++) {
    for (let j = 0; j < targets[i].length; j++) {
      ssRes += (targets[i][j] - predictions[i][j]) ** 2;
      ssTot += (targets[i][j] - targetMeans[j]) ** 2;
    }
  }

  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    rmse,
    r2,
    mse,
    cosineSimilarityMean: cosineMean,
    cosineSimilarityStd: cosineStd,
    trainingPairs,
    validationPairs,
    trainingTimeMs,
  };
}

/**
 * Main training function
 *
 * Trains a translation model from source to target embedding space
 */
export async function trainTranslation(
  sourceDim: number,
  targetDim: number,
  pairs: TrainingData[],
  config: TrainingConfig
): Promise<TrainingResult> {
  const startTime = performance.now();

  try {
    // Validate input
    if (pairs.length < 10) {
      return {
        success: false,
        error: 'Insufficient training pairs. Need at least 10 pairs.',
        metrics: {
          rmse: Infinity,
          mse: Infinity,
          cosineSimilarityMean: 0,
          cosineSimilarityStd: 0,
          trainingPairs: 0,
          validationPairs: 0,
          trainingTimeMs: 0,
        },
      };
    }

    // Validate dimensions
    for (const pair of pairs) {
      if (pair.source.length !== sourceDim) {
        return {
          success: false,
          error: `Source vector dimension mismatch: expected ${sourceDim}, got ${pair.source.length}`,
          metrics: {
            rmse: Infinity,
            mse: Infinity,
            cosineSimilarityMean: 0,
            cosineSimilarityStd: 0,
            trainingPairs: 0,
            validationPairs: 0,
            trainingTimeMs: 0,
          },
        };
      }
      if (pair.target.length !== targetDim) {
        return {
          success: false,
          error: `Target vector dimension mismatch: expected ${targetDim}, got ${pair.target.length}`,
          metrics: {
            rmse: Infinity,
            mse: Infinity,
            cosineSimilarityMean: 0,
            cosineSimilarityStd: 0,
            trainingPairs: 0,
            validationPairs: 0,
            trainingTimeMs: 0,
          },
        };
      }
    }

    // Limit training pairs if specified
    let limitedPairs = pairs;
    if (config.maxPairs && pairs.length > config.maxPairs) {
      limitedPairs = pairs.slice(0, config.maxPairs);
    }

    // Optional normalization
    let processedPairs = limitedPairs;
    if (config.normalizeVectors) {
      processedPairs = limitedPairs.map((p) => ({
        source: normalizeVector(p.source),
        target: normalizeVector(p.target),
      }));
    }

    // Split into train/validation
    const { train, validation } = splitData(
      processedPairs,
      config.validationSplit ?? 0.2,
      config.randomSeed
    );

    // Extract matrices
    const sourceVectors = train.map((p) => p.source);
    const targetVectors = train.map((p) => p.target);

    // Train based on type
    const regularization = config.regularization ?? 0.001;
    let weights: number[][];
    let bias: number[] | undefined;

    if (config.type === 'affine') {
      const result = trainAffine(sourceVectors, targetVectors, regularization);
      weights = result.weights;
      bias = result.bias;
    } else {
      // Default to linear
      weights = trainLinear(sourceVectors, targetVectors, regularization);
      bias = undefined;
    }

    // Validate on held-out data
    const validationSource = validation.map((p) => p.source);
    const validationTarget = validation.map((p) => p.target);
    const predictions = applyTranslationBatch(validationSource, weights, bias);

    const trainingTimeMs = performance.now() - startTime;
    const metrics = computeMetrics(
      predictions,
      validationTarget,
      train.length,
      validation.length,
      trainingTimeMs
    );

    return {
      success: true,
      weights,
      bias,
      metrics,
    };
  } catch (error) {
    const trainingTimeMs = performance.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Training failed',
      metrics: {
        rmse: Infinity,
        mse: Infinity,
        cosineSimilarityMean: 0,
        cosineSimilarityStd: 0,
        trainingPairs: 0,
        validationPairs: 0,
        trainingTimeMs,
      },
    };
  }
}

/**
 * Validate a trained model with new data
 */
export function validateModel(
  weights: number[][],
  bias: number[] | undefined,
  validationPairs: TrainingData[]
): TrainingMetrics {
  const startTime = performance.now();

  const sourceVectors = validationPairs.map((p) => p.source);
  const targetVectors = validationPairs.map((p) => p.target);
  const predictions = applyTranslationBatch(sourceVectors, weights, bias);

  const trainingTimeMs = performance.now() - startTime;

  return computeMetrics(
    predictions,
    targetVectors,
    0,
    validationPairs.length,
    trainingTimeMs
  );
}

// ============================================
// Exports
// ============================================

export {
  cosineSimilarity,
  normalizeVector,
  vectorNorm,
};
