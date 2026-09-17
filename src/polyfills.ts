// Must be the first import in main.tsx. ESM evaluates imports depth-first in
// source order, so this runs before any module that reaches
// @midnight-ntwrk/wallet-sdk-address-format (which expects a global Buffer).
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer;
}
