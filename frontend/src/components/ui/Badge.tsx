import React from "react";
import { Position, LeagueStatus, MembershipStatus } from "@/types";

interface BadgeProps {
  children?: React.ReactNode;
  variant?: "default" | "primary" | "accent" | "success" | "warning" | "danger" | "neutral";
  size?: "sm" | "md";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  className = "",
}) => {
  const sizeClasses = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-1 text-xs font-semibold";

  const variantClasses: Record<string, string> = {
    default: "bg-slate-800 text-slate-300 border border-slate-700",
    primary: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
    accent: "bg-amber-500/10 text-amber-400 border border-amber-500/25",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    danger: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    neutral: "bg-slate-900 text-slate-400 border border-slate-800",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md tracking-wide uppercase tabular-nums ${sizeClasses} ${variantClasses[variant] || variantClasses.default} ${className}`}
    >
      {children}
    </span>
  );
};

export const PositionBadge: React.FC<{ position: Position | string; size?: "sm" | "md" }> = ({
  position,
  size = "sm",
}) => {
  switch (position) {
    case Position.GKP:
    case "GKP":
      return (
        <span
          className={`inline-flex items-center font-bold uppercase rounded ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          } bg-amber-500/20 text-amber-300 border border-amber-500/30`}
        >
          GKP
        </span>
      );
    case Position.DEF:
    case "DEF":
      return (
        <span
          className={`inline-flex items-center font-bold uppercase rounded ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          } bg-sky-500/20 text-sky-300 border border-sky-500/30`}
        >
          DEF
        </span>
      );
    case Position.MID:
    case "MID":
      return (
        <span
          className={`inline-flex items-center font-bold uppercase rounded ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          } bg-emerald-500/20 text-emerald-300 border border-emerald-500/30`}
        >
          MID
        </span>
      );
    case Position.FWD:
    case "FWD":
      return (
        <span
          className={`inline-flex items-center font-bold uppercase rounded ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          } bg-rose-500/20 text-rose-300 border border-rose-500/30`}
        >
          FWD
        </span>
      );
    default:
      return <Badge size={size}>{position}</Badge>;
  }
};

export const StatusBadge: React.FC<{ status: LeagueStatus | MembershipStatus | string }> = ({
  status,
}) => {
  switch (status) {
    case LeagueStatus.UPCOMING:
    case MembershipStatus.PENDING:
      return <Badge variant="accent">{status}</Badge>;
    case LeagueStatus.ACTIVE:
    case MembershipStatus.ACTIVE:
      return <Badge variant="primary">{status}</Badge>;
    case LeagueStatus.COMPLETED:
      return <Badge variant="default">{status}</Badge>;
    case LeagueStatus.CANCELLED:
    case MembershipStatus.CANCELLED:
      return <Badge variant="danger">{status}</Badge>;
    case MembershipStatus.REFUNDED:
      return <Badge variant="warning">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};
