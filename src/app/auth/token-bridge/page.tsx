"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

export default function TokenBridgePage() {
  const { update } = useSession();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [countdown, setCountdown] = useState<number | null>(null);
  const processedRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startCountdownAndClose = (delay = 5000) => {
    setCountdown(delay / 1000);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          window.close();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") || "").trim();
    const emailParam = (params.get("email") || "").trim().toLowerCase();
    const vidFromQuery = (params.get("vid") || "").trim();

    if (!token || !emailParam) {
      toast.error("유효하지 않은 인증 요청입니다.");
      setStatus("error");
      setLoading(false);
      startCountdownAndClose(10000);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, email: emailParam, vid: vidFromQuery }),
        });

        const data = await res.json().catch(() => ({}));
        const targetVid = data?.vid || vidFromQuery;

        if (res.ok && (data?.code === "VERIFIED" || data?.code === "ALREADY_USED")) {
          toast.success(
            data?.code === "VERIFIED"
              ? "이메일 인증이 완료되었습니다!"
              : "이미 인증된 계정입니다."
          );
          setStatus("success");
          await update();

          // ✅ 부모 창에 메시지 전달
          const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
          if (window.opener && typeof allowedOrigin === "string") {
            window.opener.postMessage(
              { type: "EMAIL_VERIFIED", email: emailParam, vid: targetVid },
              allowedOrigin
            );
          }

          // ✅ 이제 WebSocket 알림 API 호출
          if (targetVid) {
            try {
              await fetch("/api/auth/notify-verified", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vid: targetVid, email: emailParam }),
              });
            } catch (err) {
              console.error("notifyVerified API 호출 실패", err);
            }
          }

          startCountdownAndClose(3000);
        } else {
          toast.error(data?.message || "인증 처리에 실패했습니다.");
          setStatus("error");
          startCountdownAndClose(10000);
        }
      } catch {
        toast.error("서버 요청 중 문제가 발생했습니다.");
        setStatus("error");
        startCountdownAndClose(10000);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [update]);

  return (
    <div className="flex items-center justify-center h-screen text-center">
      {loading && <p>인증 처리 중입니다...</p>}
      {!loading && status === "success" && (
        <p>
          인증이 완료되었습니다.{" "}
          {countdown !== null && <span>{countdown}초 후 창이 자동으로 닫힙니다.</span>}
        </p>
      )}
      {!loading && status === "error" && (
        <p>
          인증에 실패했습니다.{" "}
          {countdown !== null && <span>{countdown}초 후 창이 자동으로 닫힙니다.</span>}
        </p>
      )}
    </div>
  );
}