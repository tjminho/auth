"use client";
import { Loader2 } from "lucide-react";
export function GlobalLoading({ show, message = "잠시만 기다려주세요..." }: { show: boolean; message?: string }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="flex flex-col items-center space-y-3 p-6 rounded-xl bg-black/70 animate-fadeIn">
        <Loader2 className="h-10 w-10 text-white animate-spin" />
        <p className="text-white font-semibold animate-pulseGlow">{message}</p>
      </div>
    </div>
  );
}
