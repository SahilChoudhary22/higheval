import { mean, pairedBootstrapInterval, signFlipPValue } from './paired.js';
import { createRandom } from './random.js';

const options = { resamples: 5_000, level: 0.95, seed: 42 };

describe('createRandom', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = createRandom(7);
    const b = createRandom(7);
    const values = Array.from({ length: 1_000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1_000 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('pairedBootstrapInterval', () => {
  it('collapses to a point when every difference is identical', () => {
    expect(pairedBootstrapInterval([0, 0, 0, 0, 0], options)).toEqual({ lower: 0, upper: 0 });
  });

  it('excludes zero for a consistent improvement', () => {
    const interval = pairedBootstrapInterval([0.5, 1, 0.5, 1, 0.75, 1, 0.5, 1], options);
    expect(interval.lower).toBeGreaterThan(0);
    expect(interval.upper).toBeLessThanOrEqual(1);
  });

  it('spans zero for mixed results and contains the sample mean', () => {
    const differences = [1, -1, 0.5, -0.5, 0, 1, -1, 0];
    const interval = pairedBootstrapInterval(differences, options);
    expect(interval.lower).toBeLessThan(0);
    expect(interval.upper).toBeGreaterThan(0);
    expect(mean(differences)).toBeGreaterThanOrEqual(interval.lower);
    expect(mean(differences)).toBeLessThanOrEqual(interval.upper);
  });

  it('is reproducible for the same seed', () => {
    const differences = [0.2, -0.1, 0.4, 0, 0.3, -0.2];
    expect(pairedBootstrapInterval(differences, options)).toEqual(
      pairedBootstrapInterval(differences, options),
    );
  });
});

describe('signFlipPValue', () => {
  it('returns 1 when there is no difference', () => {
    expect(signFlipPValue([0, 0, 0, 0], { seed: 1 })).toBe(1);
  });

  it('matches the exact value for a uniform improvement', () => {
    // Only the all-positive and all-negative sign patterns are as extreme: 2 / 2^6.
    expect(signFlipPValue([1, 1, 1, 1, 1, 1], { seed: 1 })).toBeCloseTo(2 / 64, 10);
  });

  it('uses Monte Carlo above the exact limit and never returns zero', () => {
    const differences = Array.from({ length: 30 }, () => 1);
    const p = signFlipPValue(differences, { seed: 1, resamples: 2_000 });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.01);
  });
});
