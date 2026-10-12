import { canonicalJson, sha256Hex } from './hash.js';

describe('canonicalJson', () => {
  it('is independent of key order at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}',
    );
  });

  it('preserves array order', () => {
    expect(sha256Hex([1, 2])).not.toBe(sha256Hex([2, 1]));
  });
});
