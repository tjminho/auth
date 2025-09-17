"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") || "";
  const tokenFromUrl = searchParams.get("token") || "";

  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  // 새 이메일 입력 상태
  const [newEmail, setNewEmail] = useState("");
  const [sendingNew, setSendingNew] = useState(false);

  useEffect(() => {
    if (tokenFromUrl) {
      handleVerify(tokenFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  useEffect(() => {
    const channel = new BroadcastChannel("email-verification");
    channel.onmessage = (event) => {
      const { token } = event.data as { token: string; email: string };
      handleVerify(token);
    };
    return () => channel.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify(token: string) {
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
        if (email) {
          await signIn("credentials", {
            email,
            password: "",
            redirect: false,
          });
          router.push("/");
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
    setSendingNew(true);
    try {
      const res = await fetch("/api/auth/verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${newEmail}로 인증 메일을 보냈습니다.`);
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
              : "회원가입 시 입력한 이메일로 인증 메일을 보냈습니다."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!verified && (
            <p>메일에서 인증 버튼을 클릭하면 이 창에서 인증이 자동으로 완료됩니다.</p>
          )}

          {verified && (
            <div className="space-y-2">
              <p className="text-green-600">인증이 완료되었습니다. 자동으로 로그인 중...</p>
              <Button className="w-full" onClick={() => router.push("/")}>
                홈으로 이동
              </Button>
            </div>
          )}

          {!verified && (
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleResend}
                disabled={resending}
                className="w-full"
                variant="secondary"
              >
                {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resending ? "재발송 중..." : "인증 메일 재발송"}
              </Button>

              {/* 다른 이메일로 발송 */}
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

              {tokenFromUrl && (
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