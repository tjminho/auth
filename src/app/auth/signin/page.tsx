"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSession, signIn } from "next-auth/react";
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
import { GlobalLoading } from "@/components/global-loading";
import { Route } from "next";
import { Loader2 } from "lucide-react";

const SignInSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
});

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialEmail = searchParams.get("email") ?? "";

  const [lastOAuth, setLastOAuth] = useState<{
    provider: string | null;
    date: string | null;
  } | null>(null);

  const form = useForm<z.infer<typeof SignInSchema>>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: initialEmail, password: "" },
  });

  // ✅ 이미 로그인된 사용자는 홈으로 리다이렉트
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  // ✅ searchParams로 넘어온 이메일을 폼에 반영 (초기화 이후에도)
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      form.setValue("email", emailParam);
    }
  }, [searchParams, form]);

  // ✅ 최근 OAuth 로그인 기록 불러오기
  useEffect(() => {
    async function fetchLastOAuth() {
      try {
        const res = await fetch("/api/auth/last-oauth");
        if (res.ok) {
          const data = await res.json();
          setLastOAuth(data);
        }
      } catch (e) {
        console.error("최근 OAuth 로그인 불러오기 실패", e);
      }
    }
    fetchLastOAuth();
  }, []);

  async function onSubmit(values: z.infer<typeof SignInSchema>) {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: values.email,
        password: values.password,
        callbackUrl: "/",
      });

      if (result?.error) {
        form.resetField("password"); // 보안상 비밀번호 초기화

        if (result.error === "EMAIL_NOT_VERIFIED") {
          toast.warning("이메일 인증이 필요하지만 로그인은 진행됩니다.", {
            position: "top-center",
          });
        } else {
          toast.error("로그인 오류: " + result.error, { position: "top-center" });
        }
      }

// toast.success("로그인 성공!", { position: "top-center" });

if (result?.url) {
  // ✅ 세션 확인 후 미인증이면 verify 페이지로 이동
  const sessionRes = await fetch("/api/auth/session");
  const sessionData = await sessionRes.json();

  if (sessionData?.user?.unverified || sessionData?.user?.status === "PENDING") {
    router.push(`/auth/verify?email=${encodeURIComponent(values.email)}`);
  } else {
    router.push(result.url as Route);
  }
} else {
  router.push("/");
}

      
    } catch (e) {
      toast.error("서버 오류가 발생했습니다.", { position: "top-center" });
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") return null;

  return (
    <div className="mx-auto max-w-md">
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
                autoComplete="email"
                {...form.register("email")}
                disabled={loading}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">
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
                autoComplete="current-password"
                {...form.register("password")}
                disabled={loading}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          {/* 최근 OAuth 로그인 기록 */}
          {lastOAuth?.date && (
            <p className="text-xs text-muted-foreground">
              최근 소셜 로그인:{" "}
              <strong>{lastOAuth.provider ?? "알 수 없음"}</strong> (
              {new Date(lastOAuth.date).toLocaleString("ko-KR")})
            </p>
          )}

          {/* 소셜 로그인 */}
          <div className="grid gap-2">
            {["google", "kakao", "naver"].map((provider) => (
              <Button
                key={provider}
                variant="outline"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await signIn(provider, { callbackUrl: "/" });
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {provider.charAt(0).toUpperCase() + provider.slice(1)}로 계속하기
              </Button>
            ))}
          </div>

          {/* 회원가입 / 비밀번호 변경 링크 */}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p>
              이메일/비밀번호 방식 계정 만들기{" "}
              <Link href={"/auth/signup"} className="underline font-semibold">
                회원가입
              </Link>
            </p>
            <p>
              비밀번호를 잊으셨나요?{" "}
              <Link
                href={{ pathname: "/auth/reset-password" }}
                className="underline font-semibold"
              >
                비밀번호 변경
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ✅ 전역 로딩 오버레이 */}
      <GlobalLoading show={loading} message="로그인 처리 중..." />
    </div>
  );
}