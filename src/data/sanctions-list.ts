/**
 * Sample sanctions data.
 *
 * In production, replace this static array with a daily-refreshed pull from:
 *   - OFAC SDN List XML feed: https://www.treasury.gov/ofac/downloads/sdn.xml
 *   - OFSI consolidated list: https://www.gov.uk/government/publications/the-uk-sanctions-list
 *   - EU consolidated financial sanctions list (CFSL):
 *     https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content
 *
 * The entries below are STRUCTURALLY PLAUSIBLE bech32m addresses on
 * `mn_shield-addr_test1...` format used for the testnet. They are not real
 * sanctioned addresses; they exist solely to demonstrate the screening logic.
 *
 * Tornado Cash Ethereum addresses are referenced in comments for context, but
 * we use Midnight-shaped addresses here because the dashboard operates on
 * Midnight chain data.
 */

import type { SanctionedAddressEntry } from '../types';

export const SAMPLE_SANCTIONS_LIST: SanctionedAddressEntry[] = [
  {
    address: 'mn_shield-addr_test1q9rzef4nfwy7v3zw8s3xl6t9k8m4d2f7g0a1b5c9e2h7j0p3r6s9t2u5w8y1z4',
    listSource: 'OFAC-SDN',
    designation: 'CYBER2 — Cyber-related sanctions, illicit mixing services',
    designatedDate: '2024-08-15',
  },
  {
    address: 'mn_shield-addr_test1q8txn5mqv6c2y1pq4f8h3j7w0d5e2g6k9n4r8t1u5v9x2y6z3a7b0c4e8f1g5',
    listSource: 'OFAC-SDN',
    designation: 'DPRK3 — Democratic People\'s Republic of Korea sanctions',
    designatedDate: '2025-01-22',
  },
  {
    address: 'mn_shield-addr_test1q5kr3p9wn2v8t6b4f1h7j5e9d3c0g6m4r8u2x5y1a4b7c0e3f6h9j2k5m8n1p',
    listSource: 'OFSI',
    designation: 'RUS — Russia sanctions, designated entity associate',
    designatedDate: '2024-11-03',
  },
  {
    address: 'mn_shield-addr_test1qg7h4j8k2m5n9p3r6s0t4u7w1y5z8a2b6c9d3e7f1g5h8j2k6m0n4p7r1s5t9',
    listSource: 'EU-CFSL',
    designation: 'IRA — Iran proliferation sanctions',
    designatedDate: '2025-04-18',
  },
  {
    address: 'mn_shield-addr_test1qz1y4w7v0u3t6s9r2q5p8n1m4k7j0h3g6f9e2d5c8b1a4z7y0x3w6v9u2t5s8',
    listSource: 'OFAC-SDN',
    designation: 'TCO — Transnational criminal organization, narcotics',
    designatedDate: '2024-06-30',
  },
];

/**
 * O(1) lookup for screening transactions in real-time.
 */
export const SANCTIONS_LOOKUP: Map<string, SanctionedAddressEntry> = new Map(
  SAMPLE_SANCTIONS_LIST.map((entry) => [entry.address, entry]),
);
