"use client";

import React, { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import {
  IconClose,
  IconCopy,
  IconCheck,
  IconAlertCircle,
  IconShield,
  IconWallet,
} from "@/components/ui/Icons";

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueId: string;
  leagueName: string;
  squadId: string;
  entryFee: number;
  onPaymentSuccess?: () => void;
}

interface PaymentRequirementData {
  leagueId: string;
  squadId: string;
  requiredAmount: number;
  destinationAddress: string;
  memo: string;
  status: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  leagueId,
  leagueName,
  squadId,
  entryFee,
  onPaymentSuccess,
}) => {
  const [requirement, setRequirement] = useState<PaymentRequirementData | null>(null);
  const [stellarAddress, setStellarAddress] = useState<string>("");
  const [stellarTxHash, setStellarTxHash] = useState<string>("");

  const [isLoadingReq, setIsLoadingReq] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<"form" | "submitting" | "verifying" | "success">("form");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Fetch requirement upon opening
  useEffect(() => {
    if (!isOpen || !leagueId || !squadId) return;

    async function loadRequirement() {
      setIsLoadingReq(true);
      setErrorMsg(null);
      setCurrentStep("form");
      try {
        const res = await api.get<{ success: boolean; data: PaymentRequirementData }>(
          `/api/v1/leagues/${leagueId}/payment-requirement?squadId=${squadId}`
        );
        if (res?.data) {
          setRequirement(res.data);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setErrorMsg(err.message || "Failed to load payment requirement");
        } else {
          setErrorMsg("Could not connect to financial escrow service.");
        }
      } finally {
        setIsLoadingReq(false);
      }
    }

    loadRequirement();
  }, [isOpen, leagueId, squadId]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSubmitAndVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanHash = stellarTxHash.trim();
    const cleanAddr = stellarAddress.trim() || requirement?.destinationAddress || "G_DEFAULT_STELLAR_ADDRESS";

    if (!cleanHash) {
      setErrorMsg("Please provide your Stellar transaction hash.");
      return;
    }

    setIsSubmitting(true);
    setCurrentStep("submitting");

    try {
      // 1. Submit payment
      await api.post(`/api/v1/leagues/${leagueId}/submit-payment`, {
        stellarTxHash: cleanHash,
        stellarAddress: cleanAddr,
      });

      // 2. Verify on-chain payment
      setCurrentStep("verifying");
      const verifyRes = await api.post<{ success: boolean; message: string; data?: any }>(
        `/api/v1/leagues/${leagueId}/verify-payment`,
        {
          stellarTxHash: cleanHash,
        }
      );

      if (verifyRes?.success) {
        setCurrentStep("success");
        setTimeout(() => {
          onPaymentSuccess?.();
          onClose();
        }, 1800);
      } else {
        setErrorMsg("Payment verification pending or failed. Please check your transaction.");
        setCurrentStep("form");
      }
    } catch (err: unknown) {
      setCurrentStep("form");
      if (err instanceof ApiError) {
        setErrorMsg(err.message || "Verification failed. Please check your transaction hash.");
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Failed to communicate with Stellar escrow contract.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-pitch-surface border border-pitch-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-pitch-border flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <IconShield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-tight">
                USDC Escrow Payment
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{leagueName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isLoadingReq ? (
            <div className="py-12 text-center text-slate-400">
              <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs">Generating Soroban escrow requirement...</p>
            </div>
          ) : currentStep === "success" ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                <IconCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Payment Confirmed!</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Your entry fee is secured in Soroban escrow. Your squad is now active in {leagueName}!
              </p>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5 animate-shake">
                  <IconAlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              {/* Required Amount Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    Required Entry Fee
                  </div>
                  <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
                    {requirement?.requiredAmount ?? entryFee} USDC
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <span>Stellar Testnet</span>
                  <div className="font-mono text-xs text-slate-400">USDC Asset</div>
                </div>
              </div>

              {/* Escrow Vault Details */}
              <div className="space-y-3 text-xs">
                {/* Destination Address */}
                <div>
                  <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
                    <span>Escrow Destination Address</span>
                    {copiedField === "address" && (
                      <span className="text-emerald-400 text-[10px]">Copied!</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={requirement?.destinationAddress || "Pending generation..."}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-300 font-mono text-[11px] focus:outline-none"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(requirement?.destinationAddress || "", "address")
                      }
                      title="Copy Address"
                    >
                      <IconCopy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Memo */}
                <div>
                  <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
                    <span>Required Transaction Memo (Text)</span>
                    {copiedField === "memo" && (
                      <span className="text-emerald-400 text-[10px]">Copied!</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={requirement?.memo || "Pending..."}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-emerald-400 font-mono text-[11px] font-bold focus:outline-none"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(requirement?.memo || "", "memo")}
                      title="Copy Memo"
                    >
                      <IconCopy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-amber-400 mt-1">
                    &bull; You MUST include this memo in your Stellar transfer to match your payment.
                  </p>
                </div>
              </div>

              {/* Submit Payment Form */}
              <form onSubmit={handleSubmitAndVerify} className="space-y-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Your Stellar Address / Public Key
                  </label>
                  <input
                    type="text"
                    value={stellarAddress}
                    onChange={(e) => setStellarAddress(e.target.value)}
                    placeholder="e.g. GAB7... (or your Freighter wallet address)"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Stellar Transaction Hash <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={stellarTxHash}
                    onChange={(e) => setStellarTxHash(e.target.value)}
                    placeholder="64-character hex transaction hash"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isSubmitting}
                    disabled={isSubmitting || !stellarTxHash.trim()}
                    className="w-full justify-center uppercase font-bold tracking-wide text-xs"
                  >
                    {currentStep === "verifying"
                      ? "Verifying On-Chain..."
                      : "Submit & Verify Payment"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3.5 border-t border-pitch-border bg-slate-950/80 text-center text-[11px] text-slate-500">
          Funds held transparently in Soroban smart contract escrow &bull; Testnet USDC
        </div>
      </div>
    </div>
  );
};
