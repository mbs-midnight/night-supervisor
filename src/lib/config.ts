/**
 * Runtime configuration. Defaults target Midnight Stagenet (the ledger-9 /
 * protocol 2000000 network served by indexer.stagenet.shielded.tools, GraphQL
 * schema v4). Endpoints can be overridden through Vite env vars.
 *
 * Deliberately no seed or key material here: the supervised wallet's seed is
 * typed into the app at runtime (see components/EntryScreen.tsx), lives only
 * in memory for the session, and is never read from env, storage, or a build.
 */

// `import.meta.env` is undefined outside Vite (e.g. the Node CLIs in src/).
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;

export const NETWORK_ID: string = env.VITE_NETWORK_ID ?? 'stagenet';

export const INDEXER_HTTP: string =
  env.VITE_INDEXER_HTTP ?? 'https://indexer.stagenet.shielded.tools/api/v4/graphql';

export const INDEXER_WS: string =
  env.VITE_INDEXER_WS ?? 'wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws';

export const INDEXER_HOST: string = (() => {
  try {
    return new URL(INDEXER_HTTP).host;
  } catch {
    return INDEXER_HTTP;
  }
})();

export const STACK_LABEL = 'ledger-v9 1.0.0-rc.4 · indexer schema v4';
