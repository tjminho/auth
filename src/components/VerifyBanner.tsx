"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import type { Route } from "next";

export default function VerifyBanner() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [sending, setSending] = useState(false);

  // ✅ 인증 여부 판단
  const isUnverified =
    !session?.user?.trustedEmail || !session?.user?.emailVerified;

  if (status !== "authenticated" || !isUnverified) return null;

  const email = session?.user?.trustedEmail ?? session?.user?.email ?? "";
  const isPlaceholder =
    !session?.user?.trustedEmail && email.endsWith("@placeholder.local");

  const handleVerifyClick = async () => {
    if (!email) {
      toast.error("이메일 주소를 찾을 수 없습니다. 다시 로그인해주세요.");
      setTimeout(() => signOut({ callbackUrl: "/" }), 2000);
      return;
    }

    if (isPlaceholder) {
      router.push("/auth/verify");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : {};

      // ✅ 세션 만료 처리
      if (res.status === 401 || data?.session === "expired") {
        toast.error("세션이 만료되었습니다. 다시 로그인해주세요.");
        setTimeout(() => signOut({ callbackUrl: "/" }), 2000);
        return;
      }

      // ✅ 성공 흐름
if (res.ok && data?.code === "MAIL_SENT") {
  toast.success("인증 메일을 발송했습니다.");
  await update();

  setTimeout(() => {
    const target = new URL("/auth/verify", window.location.origin);
    target.searchParams.set("email", email);
    if (data?.vid) target.searchParams.set("vid", data.vid);
    router.push(`${target.pathname}${target.search}` as Route);
  }, 1500);

  return;
}

      // ✅ 실패 코드별 처리
      switch (data?.code) {
        case "EMAIL_REQUIRED":
          toast.error("이메일이 필요합니다.");
          break;
        case "INVALID_EMAIL":
          toast.error("올바른 이메일 주소를 입력하세요.");
          break;
        case "EMAIL_IN_USE":
          toast.error("이미 다른 계정에서 사용 중인 이메일입니다.");
          break;
        case "USER_NOT_FOUND":
          toast.error("해당 이메일의 사용자를 찾을 수 없습니다. 다시 로그인해주세요.");
          setTimeout(() => signOut({ callbackUrl: "/" }), 2000);
          break;
        case "RATE_LIMITED":
          toast.error("요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
          break;
        case "DAILY_LIMIT_EXCEEDED":
          toast.error("오늘은 더 이상 인증 메일을 보낼 수 없습니다.");
          break;
        case "RESEND_FAILED":
          toast.error("메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
          break;
        case "SERVER_ERROR":
          toast.error(data?.message || "서버 오류가 발생했습니다.");
          break;
        default:
          toast.error("메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } catch (err: any) {
      toast.error(err?.message || "서버 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-300 p-4 rounded-md animate-fade-in">
      <p className="text-sm text-yellow-800">
        이메일 인증이 아직 완료되지 않았습니다. 인증을 진행하셔야 모든 기능을 사용할 수 있어요.
      </p>
      <Button
        variant="outline"
        className="mt-2"
        onClick={handleVerifyClick}
        disabled={sending}
      >
        {sending ? "메일 발송 중..." : "📩 이메일 인증하기"}
      </Button>
    </div>
  );
}