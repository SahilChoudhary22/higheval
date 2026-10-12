import type { HermesResult } from './hermes-stream-parser.js';
import { classifyHermesExit } from './run-classification.js';

const result = (overrides: Partial<HermesResult>): HermesResult => ({
  exitCode: 0,
  text: 'ok',
  sessionId: 's',
  tokens: { input: 0, output: 0, cacheRead: 0, total: 0 },
  durationMs: 1,
  error: null,
  ...overrides,
});

describe('classifyHermesExit', () => {
  it('treats a clean exit as completed', () => {
    expect(classifyHermesExit(result({}), '')).toEqual({ kind: 'completed' });
  });

  it('marks rate limits as retryable provider errors', () => {
    expect(
      classifyHermesExit(result({ exitCode: 1, error: 'HTTP 429: Provider returned error' }), ''),
    ).toMatchObject({
      kind: 'provider',
      retryable: true,
    });
  });

  it('marks authentication failures as non-retryable', () => {
    expect(
      classifyHermesExit(result({ exitCode: 1, error: 'HTTP 401: invalid api key' }), ''),
    ).toMatchObject({
      kind: 'provider',
      retryable: false,
    });
  });

  it('treats a non-zero exit without an error as an incomplete but scorable run', () => {
    expect(classifyHermesExit(result({ exitCode: 1 }), '')).toEqual({ kind: 'incomplete' });
  });

  it('reports a crash with the last stderr line when no result was emitted', () => {
    expect(classifyHermesExit(null, 'Traceback...\nModuleNotFoundError: x\n')).toEqual({
      kind: 'crash',
      message: 'Hermes exited without a result event: ModuleNotFoundError: x',
    });
  });
});
