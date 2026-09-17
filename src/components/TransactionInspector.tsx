import { ShieldAlert, X } from 'lucide-react';
import type { Transaction } from '../types';
import { formatAtomic, formatAbsoluteTime } from '../lib/format';
import { SANCTIONS_LOOKUP } from '../data/sanctions-list';

interface TransactionInspectorProps {
  transaction: Transaction | null;
  onClose: () => void;
  live?: boolean;
}

export function TransactionInspector({ transaction, onClose, live = false }: TransactionInspectorProps) {
  if (!transaction) {
    return (
      <div className="panel p-5 h-full">
        <div className="label-micro mb-3">Inspector</div>
        <div className="font-mono text-sm text-ink-tertiary">
          Select a transaction to inspect its decrypted payload.
        </div>
      </div>
    );
  }

  const sanctionsHit = SANCTIONS_LOOKUP.get(transaction.counterpartyAddress);

  return (
    <div className="panel h-full overflow-auto">
      <div className="px-5 py-4 border-b border-rule-subtle flex items-center justify-between sticky top-0 bg-bg-panel z-10">
        <div className="label-micro">Transaction Inspector</div>
        <button
          onClick={onClose}
          className="text-ink-tertiary hover:text-ink-primary transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {sanctionsHit && (
        <div className="border-l-2 border-l-signal-critical bg-signal-critical/5 px-5 py-3 border-b border-rule-subtle">
          <div className="flex items-start gap-2">
            <ShieldAlert size={14} className="text-signal-critical mt-0.5 shrink-0" />
            <div>
              <div className="font-sans text-sm text-signal-critical font-medium">
                Sanctioned counterparty
              </div>
              <div className="font-mono text-2xs text-ink-secondary mt-1.5 leading-relaxed">
                {sanctionsHit.designation}
                <br />
                {sanctionsHit.listSource} · designated {sanctionsHit.designatedDate}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        <Field label="Direction">
          <span
            className={`font-mono text-sm uppercase tracking-wider ${
              transaction.direction === 'incoming'
                ? 'text-signal-ok'
                : transaction.direction === 'self'
                  ? 'text-ink-secondary'
                  : 'text-ink-primary'
            }`}
          >
            {transaction.direction}
          </span>
          {transaction.direction === 'self' && (
            <div className="font-mono text-2xs text-ink-tertiary mt-1">
              spent and received net to zero for this wallet (consolidation / split)
            </div>
          )}
        </Field>

        <Field label={transaction.direction === 'self' ? 'Turnover' : 'Amount'}>
          <div className="font-mono text-base text-ink-primary tabular-nums">
            {formatAtomic(transaction.amount, transaction.tokenType, { withSymbol: true })}
          </div>
          <div className="font-mono text-2xs text-ink-tertiary mt-1">
            atomic: {String(transaction.amount)}
            {transaction.receivedAtomic !== undefined && transaction.spentAtomic !== undefined && (
              <>
                <br />
                received {transaction.receivedAtomic} · spent {transaction.spentAtomic}
              </>
            )}
          </div>
        </Field>

        {transaction.rawTokenType && (
          <Field label="Raw Token Type">
            <div className="font-mono text-2xs text-ink-tertiary break-all leading-relaxed">
              {transaction.rawTokenType}
            </div>
          </Field>
        )}

        {transaction.fee && (
          <Field label="Fee Paid">
            <div className="font-mono text-2xs text-ink-secondary tabular-nums">
              {transaction.fee} Specks
            </div>
            <div className="font-mono text-2xs text-ink-tertiary mt-1">1 DUST = 10^15 Specks</div>
          </Field>
        )}

        <Field label="Apply Stage">
          <span
            className={`font-mono text-sm ${
              transaction.applyStage === 'Success'
                ? 'text-signal-ok'
                : transaction.applyStage === 'PartialSuccess'
                  ? 'text-signal-warning'
                  : 'text-signal-critical'
            }`}
          >
            {transaction.applyStage}
          </span>
        </Field>

        <Field label="Block Height">
          <div className="font-mono text-sm text-ink-primary tabular-nums">
            {transaction.blockHeight.toLocaleString()}
          </div>
        </Field>

        <Field label="Timestamp">
          <div className="font-mono text-2xs text-ink-secondary">
            {formatAbsoluteTime(transaction.timestamp)}
          </div>
        </Field>

        <Field label="Transaction Hash">
          <div className="font-mono text-2xs text-ink-secondary break-all leading-relaxed">
            {transaction.hash}
          </div>
        </Field>

        <Field label="Block Hash">
          <div className="font-mono text-2xs text-ink-tertiary break-all leading-relaxed">
            {transaction.blockHash}
          </div>
        </Field>

        <Field label="Counterparty Address">
          <div className="font-mono text-2xs text-ink-secondary break-all leading-relaxed">
            {transaction.counterpartyAddress}
          </div>
          {transaction.counterpartyAddress.startsWith('undisclosed') && (
            <div className="font-mono text-2xs text-ink-tertiary mt-1 leading-relaxed">
              A viewing key decrypts what this wallet received and recognizes what it
              spent; it does not reveal the other party. Attribution requires memo,
              contract context, or off-chain Travel Rule pairing.
            </div>
          )}
        </Field>

        {transaction.contractAddress && (
          <Field label="Contract Address">
            <div className="font-mono text-2xs text-ink-tertiary break-all leading-relaxed">
              {transaction.contractAddress}
            </div>
          </Field>
        )}

        {transaction.memo && (
          <Field label="Memo">
            <div className="font-mono text-sm text-ink-primary">{transaction.memo}</div>
          </Field>
        )}

        <div className="border-t border-rule-subtle pt-4">
          <div className="label-micro mb-2">Decryption Source</div>
          <div className="font-mono text-2xs text-ink-tertiary leading-relaxed">
            {live ? (
              <>
                Serialized zswap ledger events streamed from the indexer and replayed
                through ledger-v9 ZswapLocalState.replayEventsWithChanges with this
                wallet's keys. Output ciphertexts are decrypted with the encryption
                secret key; spends are matched by nullifier.
              </>
            ) : (
              <>
                Synthetic record shaped like a ledger-v9 replay result. In live mode this
                view shows real decrypted coin movements.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-micro mb-1.5">{label}</div>
      {children}
    </div>
  );
}
