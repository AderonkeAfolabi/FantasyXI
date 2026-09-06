"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Gameweek, ApiSuccessResponse } from "@/types";
import { CalendarIcon } from "@/components/ui/Icons";

export const GameweekBanner: React.FC = () => {
  const [gameweek, setGameweek] = useState<Gameweek | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    api
      .get<ApiSuccessResponse<Gameweek>>("/api/v1/gameweeks/current")
      .then((res) => {
        if (mounted && res?.data) {
          setGameweek(res.data);
        }
      })
      .catch(() => {
        // Fallback default if API offline
        if (mounted) {
          setGameweek({
            id: 1,
            fplId: 1,
            name: "Gameweek 1",
            deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
            isCurrent: true,
            isFinished: false,
            season: "2025/26",
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!gameweek?.deadline) return;

    const updateTimer = () => {
      const diff = new Date(gameweek.deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Deadline passed");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h left`);
      } else {
        setTimeLeft(`${hours}h ${minutes}m left`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [gameweek?.deadline]);

  if (!gameweek) return null;

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-medium text-slate-300">
      <div className="flex items-center gap-1.5 text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-bold">{gameweek.name}</span>
      </div>
      <span className="text-slate-600">•</span>
      <div className="flex items-center gap-1 text-slate-400">
        <CalendarIcon size={14} className="text-slate-500" />
        <span className="tabular-nums font-semibold text-slate-200">{timeLeft || "Upcoming"}</span>
      </div>
    </div>
  );
};
