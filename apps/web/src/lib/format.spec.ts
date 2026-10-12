import { describe, expect, it } from 'vitest';
import {
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatPValue,
  formatRelative,
  formatScore,
  formatSigned,
  MISSING,
} from './format';

describe('format', () => {
  it('distinguishes missing values from zero', () => {
    expect(formatScore(null)).toBe(MISSING);
    expect(formatScore(0)).toBe('0.00');
    expect(formatCost(undefined)).toBe(MISSING);
    expect(formatCost(0)).toBe('$0');
  });

  it('signs differences with a true minus and no negative zero', () => {
    expect(formatSigned(0.125)).toBe('+0.125');
    expect(formatSigned(-0.125)).toBe('−0.125');
    expect(formatSigned(-0.0001)).toBe('0.000');
  });

  it('formats durations across magnitudes', () => {
    expect(formatDuration(820)).toBe('820 ms');
    expect(formatDuration(12_400)).toBe('12.4 s');
    expect(formatDuration(185_000)).toBe('3 m 05 s');
  });

  it('abbreviates counts', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(15_497)).toBe('15k');
    expect(formatCount(1_500)).toBe('1.5k');
  });

  it('formats percents, p-values and small costs', () => {
    expect(formatPercent(0.833)).toBe('83%');
    expect(formatPValue(0.0312)).toBe('p = 0.031');
    expect(formatPValue(0.00001)).toBe('p < 0.001');
    expect(formatCost(0.0012)).toBe('$0.0012');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(formatRelative('2026-10-12T11:59:40Z', now)).toBe('just now');
    expect(formatRelative('2026-10-12T11:30:00Z', now)).toBe('30 min ago');
    expect(formatRelative('2026-10-10T12:00:00Z', now)).toBe('2 d ago');
  });
});
