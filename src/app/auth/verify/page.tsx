"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  const [inputEmail, setInputEmail] = useState("");
  const [mailSent, setMailSent] = useState(false); // ✅ 발송 성공 여부 상태

  const statusRef = useRef<Status>("init");
  const safeSetStatus = (next: Status) => {
    setStatus(next);
    statusRef.current = next;
  };

  // ✅ 세션 확인 (백업 폴링)
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
        try {
          await update();
        } catch (err) {
          console.error("세션 갱신 실패", err);
          router.refresh();
        }
        setTimeout(() => router.replace("/"), 1000);
      }
    } catch {
      // 네트워크 오류 무시
    }
  }, [update, router]);

  // ✅ SSE 연결
  useEffect(() => {
    if (!vid) return;

    const es = new EventSource(`/api/auth/verification-stream?vid=${vid}`);
    safeSetStatus("connected");

    es.addEventListener("connected", () => safeSetStatus("waiting"));

    es.addEventListener("verified", async () => {
      if (statusRef.current !== "verified") {
        safeSetStatus("verified");
        toast.success("이메일 인증이 완료되었습니다!");
        try {
          await update();
        } catch (err) {
          console.error("세션 갱신 실패", err);
          router.refresh();
        }
        setTimeout(() => router.replace("/"), 1000);
      }
    });

    es.addEventListener("error", () => {
      if (statusRef.current !== "verified") {
        safeSetStatus("error");
        toast.error("인증 처리 중 오류가 발생했습니다.");
      }
      es.close();
    });

    const timeout = setTimeout(() => {
      if (statusRef.current !== "verified") {
        safeSetStatus("timeout");
        toast.error("인증 시간이 만료되었습니다. 새 인증 메일을 요청해주세요.");
        es.close();
      }
    }, 10 * 60 * 1000);

    return () => {
      es.close();
      clearTimeout(timeout);
    };
  }, [vid, update, router]);

  // ✅ 세션 폴링 (백업)
  useEffect(() => {
    checkSession();
    const timer = setInterval(checkSession, 5000);
    return () => clearInterval(timer);
  }, [checkSession]);

  // ✅ 이메일 검증
  const isEmailValid = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !val.endsWith("@placeholder.local");

  // ✅ 이메일 업데이트 + 인증 메일 발송
  async function handleResend(targetEmail: string) {
    const trimmed = (targetEmail || "").trim().toLowerCase();
    if (!trimmed) return toast.error("이메일을 입력하세요.");
    if (!isEmailValid(trimmed)) return toast.error("유효한 이메일을 입력하세요.");
    setResending(true);

    try {
      // 1️⃣ 먼저 DB에 이메일 업데이트
      const updateRes = await fetch("/api/auth/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmed }),
      });
      const updateData = await updateRes.json().catch(() => ({}));

      if (!updateRes.ok) {
        toast.error(updateData?.message || "이메일 업데이트에 실패했습니다.");
        return;
      }

      // 2️⃣ 업데이트 성공 후 인증 메일 발송
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data?.sent === true || data?.code === "MAIL_SENT")) {
        toast.success("인증 메일을 발송했습니다.");
        setMailSent(true); // ✅ 발송 성공 시 입력폼 숨기기
        return;
      }

      if (data?.code === "RATE_LIMITED") {
        setRateLimited(true);
        setRetryAfter(data?.retryAfter || 60);
        toast.error(`요청이 너무 많습니다. ${data?.retryAfter || 60}초 후 다시 시도해주세요.`);
        setTimeout(() => {
          setRateLimited(false);
          setRetryAfter(0);
        }, (data?.retryAfter || 60) * 1000);
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
          {isPlaceholder ? (
            mailSent ? (
              <p className="text-sm text-green-600">
                인증 메일을 발송했습니다. 메일함을 확인해주세요.
              </p>
            ) : (
              <>
                <input
                  type="email"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  placeholder="실제 이메일 입력"
                  className="w-full border px-3 py-2 rounded"
                />
                <Button
                  onClick={() => handleResend(inputEmail)}
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
                    "인증 메일 보내기"
                  )}
                </Button>
              </>
            )
          ) : (
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