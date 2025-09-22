"use client";

import { useEffect, useState } from "react";

export default function TokenBridgePage() {
  const [status, setStatus] = useState<"idle" | "verified" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loadingResend, setLoadingResend] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token")?.trim() || "";
    const emailParam = params.get("email")?.trim() || "";

    console.log("[token-bridge] URL token:", token);
    console.log("[token-bridge] URL email:", emailParam);

    // 1) 파라미터 검증
    if (
      !token ||
      !emailParam ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam)
    ) {
      setStatus("error");
      setErrorMsg("유효하지 않은 토큰 또는 이메일입니다.");
      return;
    }

    setEmail(emailParam);

    // 2) 기존 창에 토큰 전달 (초기 알림)
    if ("BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel("email-verification");
        channel.postMessage({
          type: "EMAIL_VERIFICATION_INIT",
          payload: { token, email: emailParam, redirect: "/" },
        });
        channel.close();
      } catch (err) {
        console.warn("[token-bridge] BroadcastChannel 전송 실패:", err);
      }
    }

    // 3) 서버에 토큰 검증 요청
    fetch("/api/auth/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        userAgent: navigator.userAgent,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        console.log("[token-bridge] /verify-token 응답:", data);

        if (res.ok) {
          setStatus("verified");

          // 세션 갱신 신호
          if ("BroadcastChannel" in window) {
            try {
              const channel = new BroadcastChannel("email-verification");
              channel.postMessage({
                type: "EMAIL_VERIFICATION_SUCCESS",
                payload: {
                  token,
                  email: emailParam,
                  redirect: "/",
                  session: data?.session,
                },
              });
              channel.close();
            } catch (err) {
              console.warn("[token-bridge] BroadcastChannel 세션 갱신 실패:", err);
            }
          }

          // 창 닫기 실패 대비 → 홈으로 이동
          setTimeout(() => {
            try {
              window.close();
            } catch {
              window.location.href = "/";
            }
          }, 500);
        } else {
          setStatus("error");
          setErrorMsg(data?.reason || "인증 처리에 실패했습니다.");
        }
      })
      .catch((err) => {
        console.error("[token-bridge] 서버 요청 오류:", err);
        setStatus("error");
        setErrorMsg("서버 요청 중 오류가 발생했습니다.");
      });
  }, []);

  const handleResend = () => {
    if (!email) return;
    setLoadingResend(true);
    console.log("[token-bridge] 재발송 요청 email:", email);

    // 보안상 email을 보내지 않고 서버에서 세션 기반 처리 권장
    fetch("/api/auth/verification/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }), // 필요 시 제거 가능
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("[token-bridge] 재발송 응답:", data);
        alert("인증 메일을 재발송했습니다.");
      })
      .catch((err) => {
        console.error("[token-bridge] 재발송 오류:", err);
        alert("메일 재발송 중 오류가 발생했습니다.");
      })
      .finally(() => {
        setLoadingResend(false);
      });
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", textAlign: "center" }}>
      {status === "idle" && <p>인증 처리 중...</p>}

      {status === "verified" && (
        <p>✅ 인증이 완료되었습니다. 잠시 후 창이 닫히거나 홈으로 이동합니다.</p>
      )}

      {status === "error" && (
        <>
          <h2>❌ 인증 처리에 문제가 발생했습니다.</h2>
          <p>{errorMsg}</p>
          <div style={{ marginTop: "1rem" }}>
            <a
              href="/auth/signin"
              style={{
                padding: "0.5rem 1rem",
                background: "#111827",
                color: "#fff",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              로그인 페이지로 이동
            </a>
          </div>
          {email && (
            <button
              onClick={handleResend}
              disabled={loadingResend}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                background: "#0070f3",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                opacity: loadingResend ? 0.7 : 1,
              }}
            >
              {loadingResend ? "재발송 중..." : "인증 메일 재발송"}
            </button>
          )}
        </>
      )}
    </div>
  );
}