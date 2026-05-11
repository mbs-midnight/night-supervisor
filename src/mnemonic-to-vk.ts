import * as ledger from '@midnight-ntwrk/ledger-v8';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';
import { Buffer } from 'buffer';
import {
  ShieldedEncryptionSecretKey,
  MidnightBech32m,
} from '@midnight-ntwrk/wallet-sdk-address-format';

// Network ID — change to 'preprod', 'preview', or 'undeployed' as needed
const NETWORK_ID = 'preprod';

/**
 * Convert a BIP-39 mnemonic phrase to a binary seed buffer.
 */
const mnemonicToSeed = async (mnemonic: string): Promise<Buffer> => {
  const words = mnemonic.trim().split(/\s+/);
  if (!bip39.validateMnemonic(words.join(' '), english)) {
    throw new Error('Invalid mnemonic phrase');
  }
  const seed = await bip39.mnemonicToSeed(words.join(' '));
  return Buffer.from(seed);
};

/**
 * Derive the viewing key in Bech32m format from a mnemonic phrase.
 */
const getViewingKeyFromMnemonic = async (mnemonic: string): Promise<void> => {
  // Step 1: Convert mnemonic to binary seed
  const seed = await mnemonicToSeed(mnemonic);

  // Step 2: Initialize HD wallet from seed
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== 'seedOk') {
    throw new Error('Failed to initialize HDWallet from seed');
  }

  // Step 3: Derive the Zswap role key
  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRole(Roles.Zswap)
    .deriveKeyAt(0);

  if (derivationResult.type !== 'keyDerived') {
    throw new Error('Failed to derive Zswap key');
  }

  const shieldedSeed = Buffer.from(derivationResult.key);

  // Step 4: Clear sensitive HD wallet material from memory
  hdWallet.hdWallet.clear();
  seed.fill(0);

  // Step 5: Derive ZswapSecretKeys from the shielded seed
  const zswapKeys = ledger.ZswapSecretKeys.fromSeed(shieldedSeed);

  // Step 6: Serialize the ESK bytes
  const eskBytes = Buffer.from(
    zswapKeys.encryptionSecretKey.yesIKnowTheSecurityImplicationsOfThis_serialize()
  );

  const esk = new ShieldedEncryptionSecretKey(
    ledger.EncryptionSecretKey.deserialize(eskBytes)
  );
  const viewingKeyBech32m = ShieldedEncryptionSecretKey.codec.encode(NETWORK_ID, esk).asString();

  console.log('Viewing key (Bech32m, for indexer):', viewingKeyBech32m);

};

// ─── Usage ────────────────────────────────────────────────────────────────────

const mnemonic = 'valley ship venue champion profit leaf chief survey battle label easy home coral lizard loan cloth gain panel topple east chicken number toy spray';

getViewingKeyFromMnemonic(mnemonic).catch(console.error);