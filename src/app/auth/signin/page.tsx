
"use client";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { AlertTriangle } from "lucide-react";
const SignInSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
});
// ✅ reason 값별 메시지 매핑
const reasonMessages: Record<string, { title: string; description: string }> = {
  timeout: {
    title: "인증 시간이 만료되었습니다",
    description: "다시 로그인 후 인증을 진행해주세요.",
  },
  invalid: {
    title: "잘못된 인증 요청",
    description: "인증 토큰이 올바르지 않습니다. 다시 시도해주세요.",
  },
  used: {
    title: "이미 사용된 인증 링크",
    description: "새 인증 메일을 요청해주세요.",
  },
  mismatch: {
    title: "이메일 불일치",
    description: "인증 요청한 이메일과 계정 이메일이 일치하지 않습니다.",
  },
  user: {
    title: "사용자를 찾을 수 없습니다",
    description: "다시 로그인해주세요.",
  },
  expired: {
    title: "세션 만료",
    description: "세션이 만료되었습니다. 다시 로그인해주세요.",
  },
  need_verify: {
    title: "이메일 인증이 필요합니다",
    description: "로그인을 완료하려면 이메일 인증을 먼저 진행해주세요.",
  },
  rate_limited: {
    title: "로그인 시도가 너무 많습니다",
    description: "잠시 후 다시 시도해주세요.",
  },
  suspended: {
    title: "계정이 정지되었습니다",
    description: "관리자에게 문의해주세요.",
  },
  default: {
    title: "로그인 오류",
    description: "다시 시도하거나 관리자에게 문의해주세요.",
  },
};
export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ✅ 쿼리 파라미터에서 reason 읽기
  const reason = searchParams.get("reason") ?? "";
  const { title, description } =
    reasonMessages[reason] ?? reasonMessages.default;
  // 로그인 상태면 인증 여부에 따라 분기
  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.unverified) {
        router.replace(
          `/auth/verify?email=${encodeURIComponent(session.user.email ?? "")}`
        );
      } else {
        router.replace("/");
      }
    }
  }, [status, session, router]);
  const form = useForm<z.infer<typeof SignInSchema>>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: "", password: "" },
  });
  async function onSubmit(values: z.infer<typeof SignInSchema>) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        form.setValue("password", ""); // 비밀번호 초기화
        // ✅ 이메일 인증 필요 → verify 페이지로 이동
        if (data?.error === "EMAIL_NOT_VERIFIED") {
          toast.error("이메일 인증이 필요합니다.", { position: "top-center" });
          router.push(data?.url || `/auth/verify?email=${encodeURIComponent(values.email)}`);
          return;
        }
        if (data?.error === "TOO_MANY_ATTEMPTS") {
          toast.error(
            `로그인 시도가 너무 많습니다. ${data?.reset ?? 60}초 후 다시 시도해주세요.`,
            { position: "top-center" }
          );
          return;
        }
        if (typeof data?.remaining === "number") {
          toast.error(
            `로그인 실패. 남은 시도 횟수: ${data.remaining}회 (리셋까지 ${data.reset}초)`,
            { position: "top-center" }
          );
          return;
        }
        if (data?.error === "ACCOUNT_SUSPENDED") {
          toast.error("계정이 정지되었습니다. 관리자에게 문의해주세요.", {
            position: "top-center",
          });
          return;
        }
        toast.error("이메일 또는 비밀번호가 올바르지 않습니다.", {
          position: "top-center",
        });
        return;
      }
      // ✅ 로그인 성공
      toast.success("로그인 성공!", { position: "top-center" });
      router.push(data?.url || "/");
    } catch (e: any) {
      setLoading(false);
      toast.error("서버 오류가 발생했습니다.", { position: "top-center" });
    }
  }
  if (status === "loading") {
    return null;
  }
  return (
    <div className="mx-auto max-w-md">
      {/* ✅ reason이 있으면 경고 배너 표시 */}
      {reason && (
        <div className="mb-4 bg-yellow-50 border border-yellow-300 p-3 rounded-md flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-800">{title}</p>
            <p className="text-sm text-yellow-700">{description}</p>
          </div>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>이메일과 비밀번호로 로그인</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* 이메일 */}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-red-500">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            {/* 비밀번호 */}
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-red-500">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>
          {/* 소셜 로그인 */}
          <div className="relative my-4">
            <CardDescription>쉽고 빠른 소셜 계정 로그인</CardDescription>
          </div>
          <div className="grid gap-2">
            <Button
              variant="outline"
              onClick={() => signIn("google", { callbackUrl: "/" })}
            >
              Google로 계속하기
            </Button>
                        <Button
              variant="outline"
              onClick={() => signIn("kakao", { callbackUrl: "/" })}
            >
              Kakao로 계속하기
            </Button>
            <Button
              variant="outline"
              onClick={() => signIn("naver", { callbackUrl: "/" })}
            >
              Naver로 계속하기
            </Button>
          </div>
          {/* 회원가입 링크 */}
          <p className="text-xs text-muted-foreground">
            이메일/비밀번호 방식 계정 만들기{" "}
            <Link href="/auth/signup" className="underline font-semibold">
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
