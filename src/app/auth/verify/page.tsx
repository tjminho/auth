"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";

type Status = "init" | "connected" | "waiting" | "verified" | "timeout" | "error";

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update } = useSession();

  const vid = searchParams.get("vid") || "";
  const emailFromQuery = (searchParams.get("email") || "").trim().toLowerCase();
  const email = session?.user?.email?.trim().toLowerCase() || emailFromQuery || "";
  const isPlaceholder = email.endsWith("@placeholder.local");

  const [status, setStatus] = useState<Status>("init");
  const [resending, setResending] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number>(0);
  const [showAltForm, setShowAltForm] = useState(isPlaceholder);
  const [altEmail, setAltEmail] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<number | null>(null);
  const statusRef = useRef<Status>("init");

  const safeSetStatus = (next: Status | ((prev: Status) => Status)) => {
    if (!mountedRef.current) return;
    setStatus((prev) => {
      const newVal = typeof next === "function" ? (next as any)(prev) : next;
      statusRef.current = newVal;
      return newVal;
    });
  };

  // ✅ 세션 확인
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const verifiedAt = json?.user?.emailVerified;
      if (verifiedAt && statusRef.current !== "verified") {
        safeSetStatus("verified");
        toast.success("이메일 인증이 완료되었습니다!");
        await update().then(() => {
          setTimeout(() => router.replace("/"), 1000);
        });
      }
    } catch {
      // 네트워크 오류는 무시
    }
  }, [update, router]);

  // ✅ WebSocket 연결
  const connectWS = useCallback(
    (vid: string) => {
      if (!vid) {
        safeSetStatus("error");
        toast.error("잘못된 인증 링크입니다.");
        return;
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3007";
      const ws = new WebSocket(`${wsUrl}?vid=${vid}`);
      wsRef.current = ws;

      ws.onopen = () => safeSetStatus("connected");

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.code === "CONNECTED") {
            safeSetStatus("waiting");
            return;
          }

          if (data.code === "VERIFIED" || data.code === "ALREADY_USED") {
            if (statusRef.current !== "verified") {
              safeSetStatus("verified");
              toast.success(
                data.code === "VERIFIED"
                  ? "이메일 인증이 완료되었습니다!"
                  : "이미 인증된 계정입니다."
              );
              await update().then(() => {
                setTimeout(() => {
                  router.replace("/");
                  // ❌ ws.close()는 하지 않음 → 서버에서 정리
                }, 1000);
              });
            }
            return;
          }

          if (data.code === "EXPIRED" || data.code === "TIMEOUT") {
            safeSetStatus("timeout");
            toast.error("인증 시간이 만료되었습니다. 새 인증 메일을 요청해주세요.");
            router.replace("/auth/error?reason=timeout");
            return;
          }

          if (data.code === "ERROR") {
            safeSetStatus("error");
            let userMessage = "인증 처리 중 오류가 발생했습니다.";
            if (data.message === "invalid_or_expired_vid") {
              userMessage = "인증 링크가 유효하지 않거나 만료되었습니다.";
              router.replace("/auth/error?reason=invalid_or_expired_vid");
            } else if (data.message === "expired_vid") {
              userMessage = "인증 시간이 만료되었습니다.";
              router.replace("/auth/error?reason=timeout");
            } else if (data.message === "missing_vid") {
              userMessage = "잘못된 인증 요청입니다.";
            }
            toast.error(userMessage);
            return;
          }
        } catch {
          safeSetStatus("error");
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error", err);
        if (statusRef.current !== "verified" && statusRef.current !== "timeout") {
          safeSetStatus("waiting");
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (statusRef.current === "waiting") {
          setTimeout(() => {
            if (statusRef.current === "waiting") connectWS(vid);
          }, 3000);
        }
      };
    },
    [update, router]
  );

  // ✅ 초기 WebSocket 연결
  useEffect(() => {
    mountedRef.current = true;
    if (!email) {
      safeSetStatus("error");
      return () => { mountedRef.current = false; };
    }
    if (vid) {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
      connectWS(vid);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [vid, email, connectWS]);

  // ✅ 세션 폴링
  useEffect(() => {
    checkSession();
    pollTimerRef.current = window.setInterval(checkSession, 5000);
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [checkSession]);

  // ✅ 탭 재포커스 시 인증 상태 재확인
  useEffect(() => {
    const onFocus = () => checkSession();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkSession]);

  // ✅ 이메일 검증
  const isEmailValid = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !val.endsWith("@placeholder.local");

  // ✅ Rate Limit 카운트다운
  useEffect(() => {
    if (!rateLimited || retryAfter <= 0) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setRateLimited(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimited, retryAfter]);

  // ✅ 인증 메일 재발송
  async function handleResend(targetEmail: string) {
    const trimmed = (targetEmail || "").trim().toLowerCase();
    if (!trimmed) return toast.error("이메일을 입력하세요.");
    if (!isEmailValid(trimmed)) return toast.error("유효한 이메일을 입력하세요.");
    setResending(true);

    try {
      // 1. trustedEmail 업데이트
      const updateRes = await fetch("/api/auth/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: session?.user?.id, email: trimmed }),
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok || !updateData.success) {
        toast.error(updateData.message || "이메일 업데이트 실패");
        return;
      }

      // 2. 인증 메일 재발송
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data?.sent === true || data?.code === "MAIL_SENT")) {
        toast.success("인증 메일을 발송했습니다.");
        if (data?.vid) {
          try { wsRef.current?.close(); } catch {}
          connectWS(data.vid); // ✅ 새 vid로 재연결
        }
        setRateLimited(false);
        setRetryAfter(0);
        return;
      }

      if (data?.code === "NO_TARGET_EMAIL") {
        toast.error("발송 대상 이메일을 찾을 수 없습니다.");
        return;
      }
      if (data?.code === "EMAIL_REQUIRED") {
        toast.error("이메일이 필요합니다.");
        return;
      }
      if (data?.code === "RATE_LIMITED") {
        setRateLimited(true);
        setRetryAfter(data?.retryAfter || 60);
        toast.error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      if (data?.code === "DAILY_LIMIT_EXCEEDED") {
        toast.error("오늘은 더 이상 인증 메일을 보낼 수 없습니다.");
        return;
      }
      if (data?.code === "RESEND_FAILED") {
        toast.error("메일 발송에 실패했습니다.");
        return;
      }
      if (data?.code === "SERVER_ERROR") {
        toast.error("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      toast.error(data?.message || "메일 발송에 실패했습니다.");
    } catch {
      toast.error("서버와의 통신 중 오류가 발생했습니다.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>이메일 인증</CardTitle>
          <CardDescription>
            {isPlaceholder
              ? "현재 계정은 placeholder 이메일입니다. 반드시 실제 이메일을 입력해야 합니다."
              : `${email} 주소로 인증 메일을 보냈습니다.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPlaceholder && (
            <>
              <p>메일에서 인증 버튼을 클릭하면 이 창에서 자동으로 완료됩니다.</p>
              <Button
                onClick={() => handleResend(email)}
                disabled={resending || rateLimited}
                className="w-full"
                variant="secondary"
              >
                {resending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    재발송 중...
                  </>
                ) : rateLimited ? (
                  `재시도 가능까지 ${retryAfter}초`
                ) : (
                  "인증 메일 재발송"
                )}
              </Button>
            </>
          )}

          <div className="mt-4">
            {!showAltForm ? (
              <button
                onClick={() => setShowAltForm(true)}
                className="text-sm text-blue-600 underline"
              >
                다른 이메일로 인증 메일 받기
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleResend(altEmail);
                }}
                className="space-y-2"
              >
                <Input
                  type="email"
                  placeholder="새 이메일 주소 입력"
                  value={altEmail}
                  onChange={(e) => {
                    setAltEmail(e.target.value);
                    setRateLimited(false);
                  }}
                  required
                />
                <Button
                  type="submit"
                  disabled={resending || rateLimited}
                  className="w-full"
                >
                  {resending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      발송 중...
                    </>
                  ) : rateLimited ? (
                    `재시도 가능까지 ${retryAfter}초`
                  ) : (
                    "새 이메일로 발송"
                  )}
                </Button>
              </form>
            )}
          </div>

          {status === "connected" && (
            <p className="text-sm text-gray-600">서버와 연결되었습니다.</p>
          )}
          {status === "waiting" && (
            <p className="text-sm text-gray-600">인증을 기다리는 중…</p>
          )}
          {status === "verified" && (
            <p className="text-sm text-green-600">
              인증 완료! 자동 로그인 후 홈으로 이동합니다…
            </p>
          )}
          {status === "timeout" && (
            <p className="text-sm text-red-600">
              인증 시간이 만료되었습니다. 새 인증 메일을 요청해주세요.
            </p>
          )}
          {status === "error" && (
            <p className="text-sm text-red-600">
              오류가 발생했습니다. 다시 시도해주세요.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}