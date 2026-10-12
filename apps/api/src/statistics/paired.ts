import { createRandom } from './random.js';

export const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export interface Interval {
  lower: number;
  upper: number;
}

/**
 * Percentile bootstrap interval for the mean of paired differences. Tasks are
 * the resampling unit: callers must average repetitions per task first, so
 * repeated runs of one task are not mistaken for independent evidence.
 */
export function pairedBootstrapInterval(
  differences: readonly number[],
  options: { resamples: number; level: number; seed: number },
): Interval {
  if (differences.length === 0) throw new RangeError('At least one difference is required');
  const random = createRandom(options.seed);
  const n = differences.length;
  const means = new Float64Array(options.resamples);
  for (let resample = 0; resample < options.resamples; resample++) {
    let sum = 0;
    for (let draw = 0; draw < n; draw++) {
      sum += differences[Math.floor(random() * n)] ?? 0;
    }
    means[resample] = sum / n;
  }
  means.sort();
  const alpha = (1 - options.level) / 2;
  return {
    lower: quantile(means, alpha),
    upper: quantile(means, 1 - alpha),
  };
}

function quantile(sorted: Float64Array, probability: number): number {
  const position = (sorted.length - 1) * probability;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const low = sorted[below] ?? 0;
  const high = sorted[above] ?? low;
  return low + (high - low) * (position - below);
}

/**
 * Two-sided paired sign-flip permutation test of "mean difference = 0".
 * Exact enumeration for small samples; seeded Monte Carlo otherwise, with the
 * +1 correction so the p-value is never reported as exactly zero.
 */
export function signFlipPValue(
  differences: readonly number[],
  options: { seed: number; exactLimit?: number; resamples?: number },
): number {
  const n = differences.length;
  if (n === 0) throw new RangeError('At least one difference is required');
  const observed = Math.abs(mean(differences));
  const epsilon = 1e-12;
  const exactLimit = options.exactLimit ?? 16;

  if (n <= exactLimit) {
    const total = 2 ** n;
    let extreme = 0;
    for (let mask = 0; mask < total; mask++) {
      let sum = 0;
      for (let index = 0; index < n; index++) {
        const value = differences[index] ?? 0;
        sum += mask & (1 << index) ? -value : value;
      }
      if (Math.abs(sum / n) >= observed - epsilon) extreme++;
    }
    return extreme / total;
  }

  const resamples = options.resamples ?? 20_000;
  const random = createRandom(options.seed);
  let extreme = 0;
  for (let resample = 0; resample < resamples; resample++) {
    let sum = 0;
    for (const value of differences) sum += random() < 0.5 ? -value : value;
    if (Math.abs(sum / n) >= observed - epsilon) extreme++;
  }
  return (extreme + 1) / (resamples + 1);
}
