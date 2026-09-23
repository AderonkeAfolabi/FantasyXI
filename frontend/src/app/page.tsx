"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Squad, Gameweek, Fixture, League } from "@/types";
import {
  IconFootball,
  IconTrophy,
  IconUsers,
  IconCalendar,
  IconChevronRight,
  IconCheck,
  IconPlus,
  IconShield,
} from "@/components/ui/Icons";
import { Badge, PositionBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [gameweek, setGameweek] = useState<Gameweek | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [squad, setSquad] = useState<Squad | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // Fetch initial public & authenticated data
  useEffect(() => {
    async function loadDashboardData() {
      setIsLoadingData(true);
      try {
        // 1. Fetch current gameweek
        const gwRes = await api.get<{ success: boolean; data: Gameweek }>(
          "/api/v1/gameweeks/current"
        ).catch(() => null);

        const currentGw = gwRes?.data || null;
        if (currentGw) {
          setGameweek(currentGw);

          // 2. Fetch fixtures for current gameweek
          const fixRes = await api.get<{ success: boolean; data: Fixture[] }>(
            `/api/v1/fixtures?gameweekId=${currentGw.id}`
          ).catch(() => null);
          if (fixRes?.data) {
            setFixtures(fixRes.data.slice(0, 6)); // First 6 fixtures
          }
        }

        // 3. Fetch public leagues
        const leaguesRes = await api.get<{ success: boolean; data: League[] }>(
          "/api/v1/leagues"
        ).catch(() => null);
        if (leaguesRes?.data) {
          setLeagues(leaguesRes.data.slice(0, 4));
        }

        // 4. Fetch user's squad if logged in
        if (isAuthenticated) {
          const squadRes = await api.get<{ success: boolean; data: Squad[] }>(
            "/api/v1/squads/me"
          ).catch(() => null);
          if (squadRes?.data && squadRes.data.length > 0) {
            setSquad(squadRes.data[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setIsLoadingData(false);
      }
    }

    if (!authLoading) {
      loadDashboardData();
    }
  }, [isAuthenticated, authLoading]);

  // Derive captain and vice-captain if squad exists
  const captain = squad?.players?.find((p) => p.isCaptain);
  const viceCaptain = squad?.players?.find((p) => p.isViceCaptain);
  const starters = squad?.players?.filter((p) => p.isStarter) || [];

  return (
    <div className="space-y-8">
      {/* Top Hero / Welcome Banner */}
      {!isAuthenticated ? (
        <div className="relative rounded-2xl bg-gradient-to-br from-pitch-surface via-slate-900 to-pitch-surface border border-pitch-border p-6 sm:p-10 overflow-hidden shadow-2xl">
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider mb-3">
              <IconShield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Stellar Testnet &bull; Smart Escrow Active</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight leading-tight">
              Premier League Fantasy, <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200">
                Backed by USDC Escrow
              </span>
            </h1>
            <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
              Build your 15-man squad with a £100.0m budget. Compete in private or public leagues with
              automated Soroban smart contract payouts.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/register">
                <Button variant="primary" size="lg" className="uppercase font-bold tracking-wide">
                  Create Manager Account
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" size="lg" className="uppercase font-bold tracking-wide">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-pitch-surface border border-pitch-border p-6 rounded-xl shadow-lg">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Dugout Active
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">
              Manager {user?.name || user?.username}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Squad ID: {squad ? squad.name : "Unregistered"} &bull; FPL Gameweek {gameweek?.fplId || 1}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/team">
              <Button variant="primary" size="md" className="uppercase font-bold tracking-wide">
                <IconFootball className="w-4 h-4" />
                <span>Manage Pitch</span>
              </Button>
            </Link>
            <Link href="/leagues">
              <Button variant="secondary" size="md" className="uppercase font-bold tracking-wide">
                <IconTrophy className="w-4 h-4" />
                <span>Leagues Hub</span>
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 4 Summary Stat Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Points */}
        <div className="bg-pitch-surface border border-pitch-border rounded-xl p-4 sm:p-5 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Points</span>
            <IconTrophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white font-mono">
              {squad?.totalPoints ?? 0}
            </span>
            <span className="text-xs text-slate-500 font-medium">pts</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Career fantasy performance</p>
        </div>

        {/* Gameweek Status */}
        <div className="bg-pitch-surface border border-pitch-border rounded-xl p-4 sm:p-5 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Round Status</span>
            <IconCalendar className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-white uppercase tracking-tight">
              {gameweek ? gameweek.name : "GW 1"}
            </span>
            <Badge variant={gameweek?.isFinished ? "neutral" : "success"}>
              {gameweek?.isFinished ? "Finished" : "Active"}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {gameweek?.deadline
              ? `Deadline: ${new Date(gameweek.deadline).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Upcoming round"}
          </p>
        </div>

        {/* Squad Budget / Spent */}
        <div className="bg-pitch-surface border border-pitch-border rounded-xl p-4 sm:p-5 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Squad Budget</span>
            <IconFootball className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white font-mono">
              £{squad ? (100 - squad.budgetRemaining).toFixed(1) : "0.0"}m
            </span>
            <span className="text-xs text-slate-500">/ £100.0m</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-2 font-mono">
            £{squad ? squad.budgetRemaining.toFixed(1) : "100.0"}m remaining
          </p>
        </div>

        {/* Active Leagues */}
        <div className="bg-pitch-surface border border-pitch-border rounded-xl p-4 sm:p-5 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Leagues Hub</span>
            <IconUsers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white font-mono">
              {leagues.length}
            </span>
            <span className="text-xs text-slate-500">open</span>
          </div>
          <p className="text-[11px] text-amber-400 mt-2 flex items-center gap-1 font-semibold">
            <span>Stellar USDC Escrow</span>
          </p>
        </div>
      </div>

      {/* Main Grid: Left Squad Snapshot + Right Leagues & Fixtures */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Squad Snapshot */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-pitch-surface border border-pitch-border rounded-xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-tight flex items-center gap-2">
                  <IconFootball className="w-5 h-5 text-emerald-400" />
                  <span>My Squad Snapshot</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {squad ? squad.name : "No squad created yet"}
                </p>
              </div>

              <Link href="/team">
                <Button variant="secondary" size="sm" className="text-xs uppercase font-bold">
                  <span>Pitch View</span>
                  <IconChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>

            {squad && starters.length > 0 ? (
              <div>
                {/* Captaincy Bar */}
                <div className="grid grid-cols-2 gap-4 p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-xs font-mono">
                      C
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        {captain?.player ? `${captain.player.firstName} ${captain.player.lastName}` : "None Selected"}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Captain &bull; 2x Points Multiplier
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-slate-700/40 border border-slate-600 text-slate-300 flex items-center justify-center font-black text-xs font-mono">
                      V
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        {viceCaptain?.player ? `${viceCaptain.player.firstName} ${viceCaptain.player.lastName}` : "None Selected"}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Vice-Captain &bull; Backup
                      </div>
                    </div>
                  </div>
                </div>

                {/* Starting XI Quick List */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Key Starters ({starters.length}/11)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {starters.slice(0, 6).map((sp) => (
                      <div
                        key={sp.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <PositionBadge position={sp.player?.position || "MID"} />
                          <div>
                            <span className="font-semibold text-slate-200">
                              {sp.player?.displayName || sp.player?.lastName}
                            </span>
                            <span className="text-[10px] text-slate-500 ml-1.5 uppercase font-mono">
                              {sp.player?.team?.shortName || "PL"}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-emerald-400 font-medium">
                            £{((sp.player?.price || 0) / 10).toFixed(1)}m
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 text-center">
                    <Link
                      href="/team"
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Open full 15-player interactive tactical pitch</span>
                      <IconChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty Squad State */
              <div className="p-8 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                  <IconFootball className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">Squad Not Drafted</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
                  Pick 15 Premier League players within the £100.0m budget constraint before the gameweek deadline.
                </p>
                <Link href={isAuthenticated ? "/team" : "/register"}>
                  <Button variant="primary" size="md" className="uppercase font-bold tracking-wide">
                    <IconPlus className="w-4 h-4" />
                    <span>Select 15-Player Squad</span>
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Featured / Open Leagues Card */}
          <div className="bg-pitch-surface border border-pitch-border rounded-xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-tight flex items-center gap-2">
                  <IconTrophy className="w-5 h-5 text-amber-400" />
                  <span>Public Competitions</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verified USDC prize pools held in Soroban escrow
                </p>
              </div>

              <Link href="/leagues">
                <Button variant="secondary" size="sm" className="text-xs uppercase font-bold">
                  Browse All
                </Button>
              </Link>
            </div>

            {leagues.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2.5 px-3">League</th>
                      <th className="py-2.5 px-3">Members</th>
                      <th className="py-2.5 px-3">Entry Fee</th>
                      <th className="py-2.5 px-3">Prize Pool</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {leagues.map((lg) => (
                      <tr key={lg.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{lg.name}</div>
                          <div className="text-[10px] text-slate-500 uppercase">
                            GW {lg.startGameweekId} &rarr; GW {lg.endGameweekId}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-300 font-mono">
                          {lg.currentMembers}/{lg.maxMembers}
                        </td>
                        <td className="py-3 px-3">
                          {lg.entryFee > 0 ? (
                            <span className="text-emerald-400 font-mono font-bold">
                              {lg.entryFee} USDC
                            </span>
                          ) : (
                            <span className="text-slate-400">Free</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-amber-400">
                          ${lg.prizePool || 0} USDC
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link href={`/leagues/${lg.id}`}>
                            <Button variant="ghost" size="sm" className="text-xs">
                              Details
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                No active public leagues found. Be the first to create one!
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Upcoming Premier League Fixtures */}
        <div className="space-y-6">
          <div className="bg-pitch-surface border border-pitch-border rounded-xl p-5 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <IconCalendar className="w-4 h-4 text-emerald-400" />
                <span>Premier League Fixtures</span>
              </h2>
              <Link href="/fixtures">
                <span className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
                  View All &rarr;
                </span>
              </Link>
            </div>

            {fixtures.length > 0 ? (
              <div className="space-y-2.5">
                {fixtures.map((fix) => {
                  const kickoff = fix.kickoffTime ? new Date(fix.kickoffTime) : null;
                  return (
                    <div
                      key={fix.id}
                      className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        {/* Home Team */}
                        <div className="flex-1 font-bold text-slate-200 truncate">
                          {fix.homeTeam?.name || `Team ${fix.homeTeamId}`}
                        </div>

                        {/* Score or Time */}
                        <div className="px-3 text-center">
                          {fix.started ? (
                            <span className="font-mono font-bold text-emerald-400 text-sm tracking-widest tabular-nums">
                              {fix.homeScore ?? 0} - {fix.awayScore ?? 0}
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-slate-400">
                              {kickoff
                                ? kickoff.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "TBD"}
                            </span>
                          )}
                        </div>

                        {/* Away Team */}
                        <div className="flex-1 text-right font-bold text-slate-200 truncate">
                          {fix.awayTeam?.name || `Team ${fix.awayTeamId}`}
                        </div>
                      </div>

                      {/* Matchday Date */}
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                        <span>
                          {kickoff
                            ? kickoff.toLocaleDateString([], {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })
                            : "Scheduled"}
                        </span>
                        {fix.finished && <span className="text-slate-400 font-semibold">FT</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                {isLoadingData ? "Loading fixtures..." : "No fixtures scheduled for this round."}
              </div>
            )}
          </div>

          {/* Dugout Quick Tips Card */}
          <div className="bg-gradient-to-br from-pitch-surface to-slate-950 border border-pitch-border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
              <IconCheck className="w-4 h-4" />
              <span>Manager Rules & Deadlines</span>
            </h3>
            <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
              <li>&bull; Squad changes lock exactly at the FPL gameweek deadline.</li>
              <li>&bull; Max 3 players from any single Premier League club.</li>
              <li>&bull; Captain scores 2x points; Vice-Captain takes over if captain sits out.</li>
              <li>&bull; USDC entries are locked in Soroban escrow until round resolution.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
