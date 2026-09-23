/**
 * Mapping between a league UUID and the u64 `league_id` used by the escrow contract.
 *
 * The contract id is the first 16 hex digits of the UUID, so it is deterministic
 * and can be mapped back to a UUID prefix when indexing on-chain events.
 * Must stay in sync with frontend/src/lib/stellar/sorobanDeposit.ts.
 */

export function toContractLeagueId(leagueId: string): bigint {
  const hex = leagueId.replace(/-/g, "").slice(0, 16);
  if (!/^[0-9a-fA-F]{16}$/.test(hex)) {
    throw new Error(`League ID ${leagueId} is not a valid UUID`);
  }
  return BigInt(`0x${hex}`);
}

/**
 * Returns the UUID prefix ("xxxxxxxx-xxxx-xxxx") of the league with this contract id.
 */
export function leagueIdPrefixFromContractId(contractLeagueId: bigint): string {
  const hex = contractLeagueId.toString(16).padStart(16, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}
