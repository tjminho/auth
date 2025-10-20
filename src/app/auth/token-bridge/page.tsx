"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
export default function TokenBridgePage() {
  const { update } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") || "").trim();
    const emailParam = (params.get("email") || "").trim().toLowerCase();
    const vid = (params.get("vid") || "").trim(); // ✅ vid 추출
    if (!token || !emailParam || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam)) {
      toast.error("유효하지 않은 인증 요청입니다.");
      setStatus("error");
      setLoading(false);
      setTimeout(() => window.close(), 8000);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, email: emailParam, userAgent: navigator.userAgent, vid }), // ✅ vid 전달
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.code === "VERIFIED") {
          toast.success("이메일 인증이 완료되었습니다!");
          setStatus("success");
          await update();
          const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
          if (window.opener) {
            window.opener.postMessage({ type: "EMAIL_VERIFIED" }, allowedOrigin);
            window.close();
          } else {
            router.replace("/");
          }
        } else {
          let message = "인증 처리에 실패했습니다.";
          if (data?.code === "ALREADY_USED") message = "이미 사용된 인증 링크입니다.";
          else if (data?.code === "EXPIRED") message = "만료된 인증 링크입니다.";
          else if (data?.code === "EMAIL_MISMATCH") message = "토큰과 이메일이 일치하지 않습니다.";
          else if (data?.code === "USER_NOT_FOUND") message = "해당 유저를 찾을 수 없습니다.";
          toast.error(message);
          setStatus("error");
          setTimeout(() => {
            if (window.opener) window.close();
            else router.replace("/auth/error?reason=invalid_or_expired");
          }, 8000);
        }
      } catch {
        toast.error("서버 요청 중 문제가 발생했습니다.");
        setStatus("error");
        setTimeout(() => {
          if (window.opener) window.close();
          else router.replace("/");
        }, 8000);
            } finally {
        setLoading(false);
      }
    })();
  }, [update, router]); // ✅ useEffect 닫힘
  return (
    <div className="flex items-center justify-center h-screen text-center">
      {loading && <p>인증 처리 중입니다...</p>}
      {!loading && status === "success" && (
        <p>인증이 완료되었습니다. 창을 닫습니다...</p>
      )}
      {!loading && status === "error" && (
        <p>인증에 실패했습니다. 8초 후 창이 닫힙니다...</p>
      )}
    </div>
  );
}
