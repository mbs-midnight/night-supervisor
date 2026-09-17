/**
 * Key derivation for the supervised wallet.
 *
 * Runs unchanged in the browser (Vite) and under Node (src/derive-keys.ts).
 * Follows the wallet-sdk 2.0 derivation exactly: BIP-39 mnemonic (or raw hex
 * seed) -> HDWallet -> account 0 / role Zswap / index 0 -> ZswapSecretKeys.
 * This is the same path WalletSeeds.fromMasterSeed() takes in
 * @midnight-ntwrk/wallet-sdk-hd 3.1, so the keys here match what Lace and the
 * wallet SDK derive for the same phrase.
 *
 * What the supervisory pattern needs from these keys:
 *
 *   - viewingKey (mn_shield-esk_<network>1...) goes to the indexer's
 *     `connect` mutation. The indexer uses it to trial-decrypt outputs and
 *     tell us which transactions are relevant. It cannot spend.
 *   - zswapSecretKeys stay in the browser and drive
 *     ZswapLocalState.replayEventsWithChanges, which is the only decryption
 *     entry point ledger-v9 exposes. See ledger-decrypt.ts for why this still
 *     requires the coin secret key today.
 */

import * as ledger from '@midnightntwrk/ledger-v9';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
  ShieldedEncryptionSecretKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';

export interface SupervisedWalletKeys {
  /** Full zswap key set; kept in memory only, never serialized. */
  zswapSecretKeys: ledger.ZswapSecretKeys;
  /** Bech32m viewing key, e.g. mn_shield-esk_stagenet1... */
  viewingKey: string;
  /** Bech32m shielded address, e.g. mn_shield-addr_stagenet1... */
  shieldedAddress: string;
  /** Hex coin public key (needed to recognize self-transfers). */
  coinPublicKey: string;
}

/**
 * Accepts a BIP-39 mnemonic (whitespace-separated words) or an even-length
 * hex string of 32 or 64 bytes, matching the load-test harness convention.
 */
export function seedToBytes(secret: string): Uint8Array {
  const raw = secret.trim();
  if (/\s/.test(raw)) {
    const words = raw.split(/\s+/).join(' ');
    if (!validateMnemonic(words, english)) {
      throw new Error('Seed phrase failed BIP-39 validation');
    }
    return mnemonicToSeedSync(words);
  }
  const hex = raw.replace(/^0x/, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Seed must be a BIP-39 mnemonic or an even-length hex string');
  }
  const bytes = hex.length / 2;
  if (bytes !== 32 && bytes !== 64) {
    throw new Error(`Hex seed is ${bytes} bytes; expected 32 or 64`);
  }
  return Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

export function deriveSupervisedWalletKeys(
  secret: string,
  networkId: string,
  account = 0,
  index = 0,
): SupervisedWalletKeys {
  const master = seedToBytes(secret);
  const hd = HDWallet.fromSeed(master);
  master.fill(0);
  if (hd.type !== 'seedOk') {
    throw new Error('HDWallet.fromSeed rejected the seed');
  }
  const derived = hd.hdWallet.selectAccount(account).selectRole(Roles.Zswap).deriveKeyAt(index);
  hd.hdWallet.clear();
  if (derived.type !== 'keyDerived') {
    throw new Error('Zswap role key derivation failed');
  }

  const zswapSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.key);
  derived.key.fill(0);

  const esk = new ShieldedEncryptionSecretKey(zswapSecretKeys.encryptionSecretKey);
  const viewingKey = ShieldedEncryptionSecretKey.codec.encode(networkId, esk).asString();

  const address = new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(zswapSecretKeys.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(zswapSecretKeys.encryptionPublicKey),
  );
  const shieldedAddress = MidnightBech32m.encode(networkId, address).asString();

  return {
    zswapSecretKeys,
    viewingKey,
    shieldedAddress,
    coinPublicKey: zswapSecretKeys.coinPublicKey,
  };
}
