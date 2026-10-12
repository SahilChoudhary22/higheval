import { extractJson, getAtPath, jsonMatches, parsePath } from './json-utils.js';

describe('extractJson', () => {
  it('parses a bare JSON document', () => {
    expect(extractJson('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('parses a fenced block surrounded by prose', () => {
    const text = 'Here you go:\n```json\n{"total": 3}\n```\nLet me know!';
    expect(extractJson(text)).toEqual({ ok: true, value: { total: 3 } });
  });

  it('parses the first balanced object in prose, ignoring braces inside strings', () => {
    const text = 'Result: {"note": "use } carefully", "n": [1, 2]} done.';
    expect(extractJson(text)).toEqual({ ok: true, value: { note: 'use } carefully', n: [1, 2] } });
  });

  it('reports failure when nothing parses', () => {
    expect(extractJson('no json here').ok).toBe(false);
  });
});

describe('parsePath / getAtPath', () => {
  const doc = { items: [{ total: 5 }, { total: 7 }], meta: { ok: true } };

  it('parses dot and bracket segments', () => {
    expect(parsePath('items[1].total')).toEqual(['items', 1, 'total']);
  });

  it('selects nested values', () => {
    expect(getAtPath(doc, 'items[1].total')).toEqual({ found: true, value: 7 });
    expect(getAtPath(doc, '')).toEqual({ found: true, value: doc });
  });

  it('reports missing paths without throwing', () => {
    expect(getAtPath(doc, 'items[5].total')).toEqual({ found: false });
    expect(getAtPath(doc, 'meta.ok.deeper')).toEqual({ found: false });
    expect(getAtPath(doc, 'constructor')).toEqual({ found: false });
  });
});

describe('jsonMatches', () => {
  it('compares numbers with tolerance and numeric strings', () => {
    expect(jsonMatches(10.004, 10, { tolerance: 0.01 })).toBe(true);
    expect(jsonMatches('10', 10, {})).toBe(true);
    expect(jsonMatches(10.5, 10, { tolerance: 0.1 })).toBe(false);
  });

  it('compares arrays in order unless unordered is set', () => {
    expect(jsonMatches(['b', 'a'], ['a', 'b'], {})).toBe(false);
    expect(jsonMatches(['b', 'a'], ['a', 'b'], { unordered: true })).toBe(true);
    expect(jsonMatches(['a', 'a'], ['a', 'b'], { unordered: true })).toBe(false);
  });

  it('treats expected objects as required subsets', () => {
    expect(jsonMatches({ a: 1, extra: true }, { a: 1 }, {})).toBe(true);
    expect(jsonMatches({ b: 1 }, { a: 1 }, {})).toBe(false);
  });

  it('trims strings and distinguishes null from missing', () => {
    expect(jsonMatches(' Hooli ', 'Hooli', {})).toBe(true);
    expect(jsonMatches(undefined, null, {})).toBe(false);
  });
});

describe('extractJson prefers the final answer', () => {
  it('takes the last fenced block when a draft precedes the answer', () => {
    const text = 'Draft:\n```json\n{"total": 1}\n```\nCorrected:\n```json\n{"total": 2}\n```';
    expect(extractJson(text)).toEqual({ ok: true, value: { total: 2 } });
  });

  it('takes the last balanced span, so a bracketed citation does not win', () => {
    expect(extractJson('Per clause [1], the decision is {"decision": "deny"}.')).toEqual({
      ok: true,
      value: { decision: 'deny' },
    });
  });
});

describe('jsonMatches edge cases', () => {
  it('accepts plain decimal strings but not hex or exponent notation', () => {
    expect(jsonMatches(' 5800.50 ', 5800.5, {})).toBe(true);
    expect(jsonMatches('0x10', 16, {})).toBe(false);
    expect(jsonMatches('1e3', 1000, {})).toBe(false);
  });

  it('matches unordered arrays with tolerance where greedy pairing would fail', () => {
    // Greedy pairs expected 1.1 with actual 1.0 and then cannot place 1.0 against 1.2.
    expect(jsonMatches([1.0, 1.2], [1.1, 1.0], { unordered: true, tolerance: 0.1 })).toBe(true);
    expect(jsonMatches([1.0, 1.5], [1.1, 1.0], { unordered: true, tolerance: 0.1 })).toBe(false);
  });

  it('rejects extra keys at every level when exact is set', () => {
    expect(jsonMatches({ a: 1, extra: 2 }, { a: 1 }, { exact: true })).toBe(false);
    expect(jsonMatches({ a: { b: 1, c: 2 } }, { a: { b: 1 } }, { exact: true })).toBe(false);
    expect(jsonMatches({ a: { b: 1 } }, { a: { b: 1 } }, { exact: true })).toBe(true);
  });
});
