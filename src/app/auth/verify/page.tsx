"use client";
import { useEffect, useRef, useState } from "react";
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
import { useSession, signIn } from "next-auth/react";

type Status = "init" | "connected" | "waiting" | "verified" | "timeout" | "error";

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update } = useSession();
  const vid = searchParams.get("vid") || "";
  const emailFromQuery = (searchParams.get("email") || "").trim().toLowerCase();
  // ✅ session.user.email 우선 사용
  const email = session?.user?.email?.trim().toLowerCase() || emailFromQuery || "";
  const isPlaceholder = email.endsWith("@placeholder.local");
  const [status, setStatus] = useState<Status>("init");
  const [resending, setResending] = useState(false);
  const [showAltForm, setShowAltForm] = useState(isPlaceholder); // placeholder면 바로 폼 열기
  const [altEmail, setAltEmail] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  // ✅ 첫 진입 시 자동 인증 메일 발송 (placeholder가 아닐 때만)
  useEffect(() => {
    if (email && !isPlaceholder) {
      (async () => {
        try {
          const res = await fetch("/api/auth/send-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.sent) {
            toast.success("인증 메일을 발송했습니다.");
          }
          // ✅ 응답에 vid가 있으면 현재 URL에 붙여서 WebSocket 연결이 가능하도록 함
        if (data?.vid) {
          const url = new URL(window.location.href);
          url.searchParams.set("vid", data.vid);
          history.replaceState(null, "", url.toString());
        }
        } catch {
          toast.error("인증 메일 발송에 실패했습니다.");
        }
      })();
    }
  }, [email, isPlaceholder]);
  // ✅ WebSocket 연결
  useEffect(() => {
    if (!vid || !email) {
      setStatus("error");
      return;
    }
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3007";
const ws = new WebSocket(`${wsUrl}?vid=${vid}`);

    wsRef.current = ws;
    ws.onopen = () => setStatus("connected");
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.code) {
          case "VERIFIED":
            setStatus("verified");
            toast.success("이메일 인증이 완료되었습니다!");
            await update();
            await signIn("credentials", {
              email,
              password: "",
              redirect: true,
              callbackUrl: "/",
            });
            break;
          case "EXPIRED":
            setStatus("timeout");
            toast.error("인증 시간이 만료되었습니다. 다시 로그인해주세요.");
            router.replace("/auth/error?reason=timeout");
            break;
          case "ALREADY_USED":
            setStatus("error");
            toast.error("이미 사용된 인증 링크입니다.");
            router.replace("/auth/error?reason=used");
            break;
          case "EMAIL_MISMATCH":
            setStatus("error");
            toast.error("인증 요청한 이메일과 계정 이메일이 일치하지 않습니다.");
            router.replace("/auth/error?reason=mismatch");
            break;
          case "USER_NOT_FOUND":
            setStatus("error");
            toast.error("사용자를 찾을 수 없습니다. 다시 로그인해주세요.");
            router.replace("/auth/error?reason=user");
            break;
          case "INVALID_SIGNATURE":
            setStatus("error");
            toast.error("잘못된 인증 토큰입니다.");
            router.replace("/auth/error?reason=invalid");
            break;
          default:
            if (data.type === "verified") {
              setStatus("verified");
              toast.success("이메일 인증이 완료되었습니다!");
              await update();
              await signIn("credentials", {
                email,
                password: "",
                redirect: true,
                callbackUrl: "/",
              });
            } else if (data.type === "timeout") {
              setStatus("timeout");
              toast.error("인증 시간이 만료되었습니다. 다시 로그인해주세요.");
              router.replace("/auth/error?reason=timeout");
            } else if (data.type === "error") {
              setStatus("error");
              toast.error("잘못된 인증 요청입니다.");
              router.replace("/auth/error?reason=invalid");
            } else {
              setStatus("error");
              toast.error("알 수 없는 오류가 발생했습니다.");
            }
        }
      } catch {
        setStatus("error");
      }
    };
    ws.onerror = () => {
      setStatus("error");
      toast.error("서버 연결 중 오류가 발생했습니다.");
    };
    ws.onclose = () => {
      if (status !== "verified") setStatus("error");
    };
    return () => ws.close();
  }, [vid, email, router, update]);
  // ✅ 인증 메일 발송/재발송
  async function handleResend(targetEmail: string) {
    if (!targetEmail) {
      toast.error("이메일을 입력하세요.");
      return;
    }
    // placeholder는 기본 이메일일 때만 막음, altEmail 입력은 허용
    if (targetEmail.endsWith("@placeholder.local") && !showAltForm) {
      toast.error("placeholder 이메일은 사용할 수 없습니다.");
      return;
    }
    setResending(true);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data?.sent || data?.code === "ALREADY_VERIFIED")) {
        if (data?.code === "ALREADY_VERIFIED") {
          toast.info("이미 인증된 이메일입니다. 바로 이용하실 수 있어요.");
        } else {
          toast.success("인증 메일을 발송했습니다.");
        }
        return;
      }
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
          toast.error("재발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } catch {
      toast.error("서버 오류가 발생했습니다.");
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
                disabled={resending}
                className="w-full"
                variant="secondary"
              >
                {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resending ? "재발송 중..." : "인증 메일 재발송"}
              </Button>
            </>
          )}
          {/* 다른 이메일 입력 폼 */}
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
                  onChange={(e) => setAltEmail(e.target.value)}
                  required
                />
                <Button type="submit" disabled={resending} className="w-full">
                  {resending ? "발송 중..." : "새 이메일로 발송"}
                </Button>
              </form>
            )}
          </div>
          {/* 상태 메시지 */}
          {status === "connected" && (
            <p className="text-sm text-gray-600">
              서버와 연결되었습니다. 인증을 기다리는 중…
            </p>
          )}
          {status === "verified" && (
            <p className="text-sm text-green-600">인증 완료! 자동 로그인 중…</p>
          )}
          {status === "timeout" && (
            <p className="text-sm text-red-600">인증 시간이 만료되었습니다.</p>
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
