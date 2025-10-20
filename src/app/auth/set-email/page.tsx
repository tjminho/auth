"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
export default function SetEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status, update } = useSession();
  // 쿼리 → 세션 순서로 userId 결정
  const userIdFromQuery = searchParams.get("userId") || "";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("올바른 이메일 주소를 입력하세요.");
      return;
    }
    // 세션 로딩 중이면 대기
    if (status === "loading") {
      toast.error("세션 정보를 불러오는 중입니다. 잠시 후 다시 시도하세요.");
      return;
    }
    // 디버그 로그
    console.log("[set-email/page] email:", email);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 세션 쿠키 포함
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("인증 메일을 발송했습니다.");
        if (data?.session === "updated") {
          await update();
        }
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
      } else {
        toast.error(data?.error || "이메일 설정 실패");
      }
    } catch (err: any) {
      toast.error(err?.message || "서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto mt-10">
      <h1 className="text-xl font-bold">신뢰할 수 있는 이메일 입력</h1>
      <Input
        type="email"
        placeholder="example@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Button type="submit" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? "발송 중..." : "인증 메일 발송"}
      </Button>
    </form>
  );
}
