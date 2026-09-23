"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { LivePlayerEvent, LiveSnapshot } from "@/types";

export type LiveConnectionState = "idle" | "connecting" | "live" | "reconnecting";

/** Identifies a player's event state, so a new goal/card/save yields a new key. */
export function liveEventKey(e: LivePlayerEvent): string {
  return [e.playerId, e.goals, e.assists, e.yellowCards, e.redCards, e.saves, e.bonus].join(":");
}

/**
 * Subscribes to the backend live matchday feed (Server-Sent Events) for a league.
 *
 * Returns the latest snapshot plus what changed since the previous one:
 * - rankChanges: userId -> positions moved (positive = up), kept until ranks move again
 * - freshEventKeys: events that appeared in the latest update
 * EventSource reconnects automatically after network drops.
 */
export function useLiveLeague(leagueId: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [rankChanges, setRankChanges] = useState<Record<string, number>>({});
  const [freshEventKeys, setFreshEventKeys] = useState<Set<string>>(new Set());
  const [connection, setConnection] = useState<LiveConnectionState>("idle");
  const previous = useRef<LiveSnapshot | null>(null);

  useEffect(() => {
    if (!enabled || !leagueId) return;

    const source = new EventSource(`${API_BASE_URL}/api/v1/leagues/${leagueId}/live`);
    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection("reconnecting");

    source.addEventListener("snapshot", (message) => {
      const next = JSON.parse((message as MessageEvent<string>).data) as LiveSnapshot;
      const prev = previous.current;

      if (prev) {
        const prevRanks = new Map(prev.standings.map((s) => [s.userId, s.rank]));
        const changes: Record<string, number> = {};
        for (const entry of next.standings) {
          const before = prevRanks.get(entry.userId);
          if (before !== undefined && before !== entry.rank) {
            changes[entry.userId] = before - entry.rank;
          }
        }
        if (Object.keys(changes).length > 0) {
          setRankChanges(changes);
        }

        const prevKeys = new Set(prev.events.map(liveEventKey));
        setFreshEventKeys(
          new Set(next.events.map(liveEventKey).filter((key) => !prevKeys.has(key)))
        );
      }

      previous.current = next;
      setSnapshot(next);
      setConnection("live");
    });

    return () => source.close();
  }, [leagueId, enabled]);

  return { snapshot, rankChanges, freshEventKeys, connection };
}
