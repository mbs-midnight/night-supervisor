import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Radio, FlaskConical, ShieldCheck } from 'lucide-react';
import { INDEXER_HOST, NETWORK_ID, STACK_LABEL } from '../lib/config';

interface EntryScreenProps {
  onSupervise: (seed: string) => string | null; // returns an error message or null
  onDemo: () => void;
}

export function EntryScreen({ onSupervise, onDemo }: EntryScreenProps) {
  const [seed, setSeed] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const words = seed.trim().split(/\s+/).filter(Boolean).length;
  const looksHex = /^(0x)?[0-9a-fA-F]{64}([0-9a-fA-F]{64})?$/.test(seed.trim());
  const ready = looksHex || words === 12 || words === 15 || words === 18 || words === 21 || words === 24;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    // Derivation is synchronous but the WASM call takes a moment; let the
    // button state paint first.
    setTimeout(() => {
      const err = onSupervise(seed);
      // Drop our copy of the seed regardless of outcome.
      setSeed('');
      setBusy(false);
      if (err) setError(err);
    }, 0);
  };

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary font-sans flex flex-col">
      <header className="border-b border-rule bg-bg-base">
        <div className="px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-gradient-to-br from-signal-ok to-signal-info flex items-center justify-center rounded-sm">
              <Eye size={14} className="text-bg-base" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-sans text-sm text-ink-primary font-medium tracking-tight">
                Midnight Supervisor
              </div>
              <div className="font-mono text-2xs text-ink-tertiary tracking-wider uppercase">
                Reference implementation · v0.2
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="label-micro mb-0.5">Network</div>
            <div className="font-mono text-2xs text-ink-secondary">{NETWORK_ID}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live */}
          <section className="panel p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Radio size={14} className="text-signal-ok" />
              <div className="label-micro">Supervise a wallet · live on {NETWORK_ID}</div>
            </div>
            <p className="font-mono text-2xs text-ink-secondary leading-relaxed">
              Enter the supervised wallet's recovery phrase or hex seed. Keys are derived in this
              tab, the viewing key is registered with {INDEXER_HOST}, and every shielded ledger
              event is decrypted locally. The seed is held in memory only for this session: it
              is never stored, never sent anywhere, and is wiped on Disconnect or when the tab
              closes or reloads.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="seed" className="label-micro">
                  Recovery phrase or 32/64-byte hex seed
                </label>
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  className="flex items-center gap-1 font-mono text-2xs text-ink-tertiary hover:text-ink-secondary"
                >
                  {reveal ? <EyeOff size={11} /> : <Eye size={11} />}
                  {reveal ? 'hide' : 'reveal'}
                </button>
              </div>
              <textarea
                id="seed"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                }}
                rows={3}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                placeholder="word word word … (24 words)"
                className={`w-full bg-bg-base border border-rule rounded-sm px-3 py-2 font-mono text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-signal-ok/60 resize-none ${
                  reveal ? '' : '[-webkit-text-security:disc]'
                }`}
                style={reveal ? undefined : ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)}
              />
              <div className="flex items-center justify-between font-mono text-2xs text-ink-tertiary">
                <span>
                  {looksHex ? 'hex seed' : words > 0 ? `${words} words` : 'BIP-39 mnemonic or hex'}
                </span>
                <span>⌘/Ctrl + Enter to connect</span>
              </div>
            </div>

            {error && (
              <div className="border-l-2 border-l-signal-critical bg-signal-critical/5 px-3 py-2 font-mono text-2xs text-signal-critical">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!ready || busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm font-mono text-xs uppercase tracking-wider bg-signal-ok/15 text-signal-ok border border-signal-ok/30 hover:bg-signal-ok/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <KeyRound size={13} />
              {busy ? 'Deriving keys…' : 'Derive keys and connect'}
            </button>

            <div className="flex items-start gap-2 pt-1">
              <ShieldCheck size={12} className="text-ink-tertiary mt-0.5 shrink-0" />
              <p className="font-mono text-2xs text-ink-tertiary leading-relaxed">
                Use a test wallet. ledger-v9 needs the full zswap key set to match spent coins
                by nullifier, so decryption requires the seed rather than the viewing key alone;
                the indexer only ever receives the viewing key.
              </p>
            </div>
          </section>

          {/* Mock */}
          <section className="panel p-6 space-y-5 flex flex-col">
            <div className="flex items-center gap-2">
              <FlaskConical size={14} className="text-signal-info" />
              <div className="label-micro">Synthetic demo · no wallet needed</div>
            </div>
            <p className="font-mono text-2xs text-ink-secondary leading-relaxed">
              Streams deterministic synthetic transactions shaped like the live client's output:
              stablecoin activity, a seeded structuring pattern, and a sanctioned-counterparty
              hit. Shows what an active, monitored wallet looks like with the detection rules,
              alert workflow, and CSV export running for real.
            </p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onDemo}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm font-mono text-xs uppercase tracking-wider bg-signal-info/15 text-signal-info border border-signal-info/30 hover:bg-signal-info/25 transition-colors"
            >
              <FlaskConical size={13} />
              Run synthetic demo
            </button>
          </section>
        </div>
      </main>

      <footer className="border-t border-rule-subtle">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="font-mono text-2xs text-ink-tertiary">
            Midnight Supervisor · Reference Implementation
          </div>
          <div className="font-mono text-2xs text-ink-muted">
            github.com/midnightntwrk/midnight-indexer · schema-v4.graphql · {STACK_LABEL}
          </div>
        </div>
      </footer>
    </div>
  );
}
