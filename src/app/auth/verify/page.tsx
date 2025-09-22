"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { signIn, useSession } from "next-auth/react";

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const email = searchParams.get("email") || session?.user?.email || "";
  const tokenFromUrl = searchParams.get("token") || "";
  const providerFromUrl = searchParams.get("provider") || "";

  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);

  const [showNewEmailForm, setShowNewEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [sendingNew, setSendingNew] = useState(false);

  // URL에 token이 있을 때 자동 인증 시도
  useEffect(() => {
    if (tokenFromUrl.trim() !== "") {
      handleVerify(tokenFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  // BroadcastChannel로 token-bridge에서 인증 완료 신호 수신
  useEffect(() => {
    const channel = new BroadcastChannel("email-verification");
    channel.onmessage = async (event) => {
      if (!event.data || typeof event.data !== "object") return;
      const { token, redirect, session: sessionFlag } = event.data;
      if (!token || token.trim() === "") return;
      await handleVerify(token, sessionFlag);
      if (redirect) router.push(redirect);
    };
    return () => channel.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify(token: string, sessionFlag?: string) {
    if (!token.trim()) {
      toast.error("인증 토큰이 없습니다.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setVerified(true);
        toast.success("이메일 인증이 완료되었습니다!");

        const flag = sessionFlag || data?.session;

        if (flag === "updated" || flag === "created") {
          await update();
          router.push("/");
          return;
        }

        if (flag === "pending") {
          setAutoLoggingIn(true);
          if (providerFromUrl) {
            await signIn(providerFromUrl, { callbackUrl: "/", redirect: true });
          } else if (email) {
            await signIn("credentials", {
              email,
              tokenLogin: "1",
              redirect: true,
              callbackUrl: "/",
            });
          }
        }
      } else {
        toast.error(data?.error || "인증에 실패했습니다.");
      }
    } catch (e: any) {
      toast.error(e?.message || "서버 오류가 발생했습니다.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!email) {
      toast.error("이메일 주소를 찾을 수 없습니다.");
      return;
    }
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("인증 메일을 재발송했습니다.");
      } else {
        toast.error(data?.error || "재발송에 실패했습니다.");
      }
    } catch (e: any) {
      toast.error(e?.message || "서버 오류가 발생했습니다.");
    } finally {
      setResending(false);
    }
  }

  async function handleSendNewEmail() {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error("올바른 이메일 주소를 입력하세요.");
      return;
    }
    if (status === "loading") {
      toast.error("세션 정보를 불러오는 중입니다. 잠시 후 다시 시도하세요.");
      return;
    }
    if (!session?.user?.id) {
      toast.error("로그인 세션이 없습니다. 다시 로그인 해주세요.");
      return;
    }

    setSendingNew(true);
    try {
      const res = await fetch("/api/auth/verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: newEmail }), // userId 제거
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${newEmail}로 인증 메일을 보냈습니다.`);
        if (data?.session === "updated") {
          await update();
        }
      } else {
        toast.error(data?.error || "발송에 실패했습니다.");
      }
    } catch (e: any) {
      toast.error(e?.message || "서버 오류가 발생했습니다.");
    } finally {
      setSendingNew(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>이메일 인증</CardTitle>
          <CardDescription>
            {email
              ? `${email} 주소로 인증 메일을 보냈습니다.`
              : "이메일이 필요합니다. 아래에서 입력해 주세요."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!verified && (
            <p>메일에서 인증 버튼을 클릭하면 이 창에서 인증이 자동으로 완료됩니다.</p>
          )}

          {verified && (
            <div className="space-y-2">
              <p className="text-green-600">
                인증이 완료되었습니다. {autoLoggingIn ? "자동 로그인 중..." : ""}
              </p>
              {!autoLoggingIn && (
                <Button className="w-full" onClick={() => router.push("/")}>
                  홈으로 이동
                </Button>
              )}
            </div>
          )}

          {!verified && (
            <div className="flex flex-col gap-3">
              {email && (
                <Button
                  onClick={handleResend}
                  disabled={resending}
                  className="w-full"
                  variant="secondary"
                >
                  {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {resending ? "재발송 중..." : "인증 메일 재발송"}
                </Button>
              )}

              {!showNewEmailForm && (
                <p
                  className="text-blue-600 text-sm cursor-pointer underline"
                  onClick={() => setShowNewEmailForm(true)}
                >
                  다른 이메일로 인증
                </p>
              )}

              {showNewEmailForm && (
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="다른 이메일 입력"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                  <Button
                    onClick={handleSendNewEmail}
                    disabled={sendingNew}
                    variant="outline"
                  >
                    {sendingNew && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    보내기
                  </Button>
                </div>
              )}
              {!verified && tokenFromUrl && (
                <Button
                  onClick={() => handleVerify(tokenFromUrl)}
                  disabled={verifying}
                  className="w-full"
                >
                  {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {verifying ? "인증 중..." : "다시 인증 시도"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}