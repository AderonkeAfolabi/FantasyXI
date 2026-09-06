"use client";

import React from "react";
import { LeagueStandingsEntry, MembershipStatus } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { IconTrophy, IconCheck, IconAlertCircle } from "@/components/ui/Icons";

export interface StandingsTableProps {
  standings: LeagueStandingsEntry[];
  entryFee?: number;
  prizePool?: number;
  currentUserId?: string;
}

export const StandingsTable: React.FC<StandingsTableProps> = ({
  standings,
  entryFee = 0,
  prizePool = 0,
  currentUserId,
}) => {
  if (standings.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 text-xs">
        No managers have registered or submitted scores in this league yet.
      </div>
    );
  }

  // Calculate projected prizes for top 3
  const firstPrize = Math.round(prizePool * 0.6 * 100) / 100;
  const secondPrize = Math.round(prizePool * 0.3 * 100) / 100;
  const thirdPrize = Math.round(prizePool * 0.1 * 100) / 100;

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center font-mono shadow-md shadow-amber-950/40">
            1
          </span>
        );
      case 2:
        return (
          <span className="w-6 h-6 rounded-full bg-slate-300 text-slate-950 font-black text-xs flex items-center justify-center font-mono shadow-md shadow-slate-950/40">
            2
          </span>
        );
      case 3:
        return (
          <span className="w-6 h-6 rounded-full bg-amber-700 text-amber-100 font-black text-xs flex items-center justify-center font-mono shadow-md">
            3
          </span>
        );
      default:
        return (
          <span className="w-6 h-6 rounded font-bold text-slate-400 text-xs flex items-center justify-center font-mono">
            {rank}
          </span>
        );
    }
  };

  const getProjectedPrize = (rank: number) => {
    if (prizePool <= 0) return null;
    if (rank === 1) return `$${firstPrize.toFixed(2)}`;
    if (rank === 2) return `$${secondPrize.toFixed(2)}`;
    if (rank === 3) return `$${thirdPrize.toFixed(2)}`;
    return null;
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-pitch-border text-slate-400 uppercase font-semibold text-[11px] bg-slate-950/50">
            <th className="py-3 px-3 w-12 text-center">Rank</th>
            <th className="py-3 px-3">Manager & Squad</th>
            <th className="py-3 px-3">Escrow Status</th>
            <th className="py-3 px-3 text-center">Best GW</th>
            <th className="py-3 px-3 text-right">Total Pts</th>
            {prizePool > 0 && <th className="py-3 px-3 text-right">Projected USDC</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 font-medium">
          {standings.map((entry) => {
            const isMe = currentUserId && entry.userId === currentUserId;
            const prize = getProjectedPrize(entry.rank);

            return (
              <tr
                key={entry.userId}
                className={`transition-colors ${
                  isMe
                    ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                    : "hover:bg-slate-900/40"
                }`}
              >
                {/* Rank */}
                <td className="py-3 px-3 text-center">
                  <div className="flex justify-center">{getRankBadge(entry.rank)}</div>
                </td>

                {/* Manager & Squad */}
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${isMe ? "text-emerald-400" : "text-white"}`}>
                      {entry.squadName || "Fantasy Squad"}
                    </span>
                    {isMe && (
                      <span className="text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-sans">
                    Manager: <span className="font-semibold text-slate-300">@{entry.username}</span>
                  </div>
                </td>

                {/* Escrow Status */}
                <td className="py-3 px-3">
                  {entryFee === 0 ? (
                    <Badge variant="neutral">Free League</Badge>
                  ) : entry.membershipStatus === MembershipStatus.ACTIVE ? (
                    <Badge variant="success" className="gap-1">
                      <IconCheck className="w-3 h-3" />
                      <span>Confirmed</span>
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1">
                      <IconAlertCircle className="w-3 h-3" />
                      <span>Pending Fee</span>
                    </Badge>
                  )}
                </td>

                {/* Best GW */}
                <td className="py-3 px-3 text-center font-mono text-slate-300">
                  {entry.bestGameweekPoints ?? "—"} pts
                </td>

                {/* Total Points */}
                <td className="py-3 px-3 text-right">
                  <span className="font-mono font-black text-sm text-white">
                    {entry.totalPoints}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-1">pts</span>
                </td>

                {/* Projected Prize */}
                {prizePool > 0 && (
                  <td className="py-3 px-3 text-right">
                    {prize ? (
                      <span className="font-mono font-black text-amber-400 text-sm">
                        {prize}
                      </span>
                    ) : (
                      <span className="text-slate-600 font-mono">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
