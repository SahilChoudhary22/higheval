import { HERMES_TOOL_OUTPUT_LIMIT, HermesStreamParser } from './hermes-stream-parser.js';

// Lines captured from a real Hermes run (paths shortened).
const FIXTURE = [
  '{"type": "system", "subtype": "init", "model": "cohere/north-mini-code:free", "session_id": "s1", "timestamp": 1791792168871}',
  '{"type": "tool_use", "name": "read_file", "input": {"path": "invoices.csv"}, "timestamp": 1791792179400}',
  '{"type": "tool_result", "name": "read_file", "output": "{\\"content\\": \\"1|id\\"}", "duration_ms": 121, "is_error": false, "timestamp": 1791792179521}',
  '{"type": "text", "text": "\\n\\nDone", "timestamp": 1791792208456}',
  '{"type": "text", "text": ". Three invoices.", "timestamp": 1791792208457}',
  '{"type": "result", "session_id": "s1", "exit_code": 0, "text": "Done. Three invoices.", "tokens": {"input": 4211, "output": 736, "total": 15315, "cache_read": 10368, "cache_write": 0}, "duration_ms": 19759, "timestamp": 1791792209000}',
].join('\n');

function parseAll(text: string, chunkSize = text.length) {
  const parser = new HermesStreamParser();
  const events = [];
  let result = null;
  for (let index = 0; index < text.length; index += chunkSize) {
    const parsed = parser.push(text.slice(index, index + chunkSize));
    events.push(...parsed.events);
    result ??= parsed.result;
  }
  const tail = parser.end();
  events.push(...tail.events);
  result ??= tail.result;
  return { events, result };
}

describe('HermesStreamParser', () => {
  it('normalizes a complete run', () => {
    const { events, result } = parseAll(FIXTURE + '\n');
    expect(events.map((event) => event.type)).toEqual([
      'session',
      'tool_call',
      'tool_result',
      'text',
    ]);
    expect(events[0]).toMatchObject({ model: 'cohere/north-mini-code:free', sessionId: 's1' });
    expect(events[1]).toMatchObject({ tool: 'read_file', arguments: { path: 'invoices.csv' } });
    expect(events[2]).toMatchObject({ isError: false, durationMs: 121, truncated: false });
    expect(events[3]).toMatchObject({ text: '\n\nDone. Three invoices.' });
    expect(result).toEqual({
      exitCode: 0,
      text: 'Done. Three invoices.',
      sessionId: 's1',
      tokens: { input: 4211, output: 736, cacheRead: 10368, total: 15315 },
      durationMs: 19759,
      error: null,
    });
  });

  it('produces identical output regardless of chunk boundaries', () => {
    const whole = parseAll(FIXTURE);
    for (const size of [1, 7, 64]) {
      expect(parseAll(FIXTURE, size)).toEqual(whole);
    }
  });

  it('surfaces malformed lines as error events and keeps going', () => {
    const { events, result } = parseAll('not json\n{"type": "tool_use"}\n' + FIXTURE);
    expect(events[0]).toMatchObject({
      type: 'error',
      message: 'Unparseable output line: not json',
    });
    expect(events[1]).toMatchObject({ type: 'error' });
    expect(result?.exitCode).toBe(0);
  });

  it('ignores unknown event types', () => {
    const { events } = parseAll('{"type": "reasoning", "text": "hmm"}\n');
    expect(events).toEqual([]);
  });

  it('returns no result when the process died before the terminal event', () => {
    const lines = FIXTURE.split('\n').slice(0, 3).join('\n');
    expect(parseAll(lines).result).toBeNull();
  });

  it('captures provider errors from the result envelope', () => {
    const { result } = parseAll(
      '{"type": "result", "session_id": "s2", "exit_code": 1, "text": "rate limited", "tokens": {"input": 0, "output": 0, "total": 0, "cache_read": 0}, "duration_ms": 12700, "error": "HTTP 429: Provider returned error"}',
    );
    expect(result).toMatchObject({ exitCode: 1, error: 'HTTP 429: Provider returned error' });
  });

  it('flags tool output at the stream cap as truncated', () => {
    const output = 'x'.repeat(HERMES_TOOL_OUTPUT_LIMIT);
    const { events } = parseAll(
      JSON.stringify({ type: 'tool_result', name: 'read_file', output, is_error: false }),
    );
    expect(events[0]).toMatchObject({ type: 'tool_result', truncated: true });
  });
});
