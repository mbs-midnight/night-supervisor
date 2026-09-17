/**
 * Minimal browser stand-in for Node's `assert`, aliased in vite.config.ts.
 * @midnight-ntwrk/wallet-sdk-address-format pulls in @subsquid/scale-codec,
 * which does `require('assert')` and only ever calls assert(condition).
 */
function assert(condition: unknown, message?: string | Error): asserts condition {
  if (!condition) {
    if (message instanceof Error) throw message;
    throw new Error(message ?? 'Assertion failed');
  }
}
assert.ok = assert;
assert.strictEqual = (a: unknown, b: unknown, message?: string) =>
  assert(a === b, message ?? `Expected ${String(a)} to equal ${String(b)}`);
assert.equal = assert.strictEqual;

export default assert;
