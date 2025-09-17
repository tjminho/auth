"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TokenBridgePage() {
  const [status, setStatus] = useState<"idle" | "sent" | "verified" | "error">("idle");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const email = params.get("email");

    if (!token || !email) {
      setStatus("error");
      return;
    }

    // 1) 기존 탭에 토큰 전달
    if ("BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel("email-verification");
        channel.postMessage({ token, email });
        channel.close();
        setStatus("sent");
      } catch {
        setStatus("sent");
      }
    } else {
      setStatus("sent");
    }

    // 2) 폴백: 여기서도 인증 시도 + 세션 생성
    fetch("/api/auth/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        userAgent: navigator.userAgent,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("verified");

          // 인증 성공 → 세션 재생성 요청
          await fetch("/api/auth/session/refresh", { method: "POST" });

          // 홈으로 이동 (혹은 원하는 페이지)
          router.replace("/");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [router]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", textAlign: "center" }}>
      {status === "idle" && <p>인증 준비 중...</p>}
      {status === "sent" && (
        <>
          <h2>토큰을 기존 창으로 전달했습니다.</h2>
          <p>기존 창에서 인증이 자동으로 진행됩니다. 이 창은 닫으셔도 됩니다.</p>
        </>
      )}
      {status === "verified" && (
        <>
          <h2>인증이 완료되었습니다.</h2>
          <p>잠시 후 홈으로 이동합니다...</p>
        </>
      )}
      {status === "error" && (
        <>
          <h2>인증 처리에 문제가 발생했습니다.</h2>
          <p>기존 창에서 다시 시도하거나, 인증 메일을 재발송해주세요.</p>
        </>
      )}
    </div>
  );
}