"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { IconFootball, IconAlertCircle } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuthToken } = useAuth();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const returnTo = searchParams.get("returnTo") || "/";

    if (!token) {
      setError("No authentication token found in callback. Please try signing in again.");
      return;
    }

    // Store token and populate current user
    setAuthToken(token)
      .then(() => {
        router.replace(returnTo);
      })
      .catch((err) => {
        console.error("Failed to authenticate callback session:", err);
        setError("Failed to establish authenticated session. The token may have expired.");
      });
  }, [searchParams, setAuthToken, router]);

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-pitch-surface border border-pitch-border rounded-xl shadow-2xl text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-950/40 border border-red-500/30 text-red-400 mb-4">
          <IconAlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Authentication Failed</h2>
        <p className="text-sm text-slate-400 mb-6">{error}</p>
        <Link href="/login">
          <Button variant="primary" className="w-full justify-center uppercase tracking-wide">
            Back to Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-pitch-surface border border-pitch-border rounded-xl shadow-2xl text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4 animate-pulse">
        <IconFootball className="w-8 h-8 animate-spin" />
      </div>
      <h2 className="text-lg font-bold text-white mb-1.5">Authenticating Manager...</h2>
      <p className="text-sm text-slate-400">
        Synchronizing profile and fantasy credentials. You will be redirected shortly.
      </p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center py-10 px-4">
      <Suspense
        fallback={
          <div className="text-center py-20 text-slate-400">
            <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Connecting...</p>
          </div>
        }
      >
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
