/**
 * useSupervisorState — central state management for the dashboard.
 *
 * Wires the IndexerClient (mock or production) to React state, runs detection
 * rules on every incoming transaction, and maintains alerts.
 *
 * This hook is the integration seam: the indexer client is dependency-injected,
 * so swapping mock for production is one constructor change.
 */

import { useEffect, useReducer, useRef } from 'react';
import type {
  Transaction,
  ComplianceAlert,
  WalletSession,
  WalletEvent,
} from '../types';
import type { IndexerClient } from './indexer-client';
import { screenTransactionForSanctions } from './sanctions-screening';
import { detectStructuring, structuringFindingToAlert } from './structuring-detection';

interface State {
  session: WalletSession | null;
  transactions: Transaction[];
  alerts: ComplianceAlert[];
  lastEventAt: string | null;
}

type Action =
  | { type: 'SESSION_UPDATE'; session: WalletSession }
  | { type: 'WALLET_EVENT'; event: WalletEvent }
  | { type: 'TRANSACTION_INGESTED'; tx: Transaction }
  | { type: 'ALERT_TRIGGERED'; alert: ComplianceAlert }
  | { type: 'ALERT_STATUS_CHANGED'; alertId: string; status: ComplianceAlert['status'] }
  | { type: 'RESET' };

const initialState: State = {
  session: null,
  transactions: [],
  alerts: [],
  lastEventAt: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SESSION_UPDATE':
      return { ...state, session: action.session };
    case 'WALLET_EVENT':
      return { ...state, lastEventAt: new Date().toISOString() };
    case 'TRANSACTION_INGESTED':
      // Insert in chronological order (newest first for display)
      return {
        ...state,
        transactions: [action.tx, ...state.transactions],
        lastEventAt: new Date().toISOString(),
      };
    case 'ALERT_TRIGGERED': {
      // Dedupe by alert ID
      if (state.alerts.some((a) => a.id === action.alert.id)) return state;
      return {
        ...state,
        alerts: [action.alert, ...state.alerts],
      };
    }
    case 'ALERT_STATUS_CHANGED':
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.alertId ? { ...a, status: action.status } : a,
        ),
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export interface UseSupervisorStateOptions {
  client: IndexerClient;
  viewingKey: string;
  walletAddress: string;
  autoConnect?: boolean;
}

export interface SupervisorStateApi {
  session: WalletSession | null;
  transactions: Transaction[];
  alerts: ComplianceAlert[];
  lastEventAt: string | null;
  setAlertStatus: (alertId: string, status: ComplianceAlert['status']) => void;
}

export function useSupervisorState({
  client,
  viewingKey,
  walletAddress,
  autoConnect = true,
}: UseSupervisorStateOptions): SupervisorStateApi {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Keep a ref to recent transactions for the structuring rule's window lookup
  const recentTxsRef = useRef<Transaction[]>([]);

  useEffect(() => {
    recentTxsRef.current = state.transactions;
  }, [state.transactions]);

  useEffect(() => {
    if (!autoConnect) return;

    let unsubEvents: (() => void) | null = null;
    let unsubSession: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      unsubSession = client.onSessionUpdate((session) => {
        if (!cancelled) dispatch({ type: 'SESSION_UPDATE', session });
      });

      await client.connect(viewingKey, walletAddress);

      if (cancelled) return;

      unsubEvents = client.subscribe((event) => {
        if (cancelled) return;
        dispatch({ type: 'WALLET_EVENT', event });
        if (event.__typename !== 'ViewingUpdate') return;
        if (event.update.__typename !== 'RelevantTransaction') return;

        const tx = event.update.transaction;
        dispatch({ type: 'TRANSACTION_INGESTED', tx });

        // Run detection rules on the new transaction
        const sanctionsAlert = screenTransactionForSanctions(tx);
        if (sanctionsAlert) {
          dispatch({ type: 'ALERT_TRIGGERED', alert: sanctionsAlert });
        }

        const structuringFinding = detectStructuring(tx, recentTxsRef.current);
        if (structuringFinding) {
          dispatch({
            type: 'ALERT_TRIGGERED',
            alert: structuringFindingToAlert(structuringFinding),
          });
        }
      });
    };

    setup();

    return () => {
      cancelled = true;
      unsubEvents?.();
      unsubSession?.();
      client.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, viewingKey, walletAddress, autoConnect]);

  return {
    session: state.session,
    transactions: state.transactions,
    alerts: state.alerts,
    lastEventAt: state.lastEventAt,
    setAlertStatus: (alertId, status) =>
      dispatch({ type: 'ALERT_STATUS_CHANGED', alertId, status }),
  };
}
