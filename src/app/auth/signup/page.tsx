"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema } from "@/lib/validation";
import { z } from "zod";
import { toast } from "sonner";
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
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  // 로그인 상태면 홈으로 이동
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof signupSchema>) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // JSON 파싱 실패 시
      }

      if (!res.ok) {
        toast.error(data?.error || "회원가입 중 오류가 발생했습니다.");
        return;
      }

      toast.success("회원가입 완료! 이메일 인증 페이지로 이동합니다.");
      router.push(`/auth/verify?email=${encodeURIComponent(values.email)}`);
    } catch (e: any) {
      toast.error(e.message || "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 세션 로딩 중이면 아무것도 안 보여줌
  if (status === "loading") {
    return null;
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>회원가입</CardTitle>
          <CardDescription>
            비밀번호는 8~20자, 영문자·숫자·특수문자를 각각 1개 이상 포함해야 합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* 이름 */}
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500" aria-live="polite">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* 이메일 */}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-red-500" aria-live="polite">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* 비밀번호 */}
            <div className="space-y-2">
              <Label htmlFor="password">
                비밀번호{" "}
                <span className="text-[0.8rem] text-gray-500">
                  (8자 이상, 영문·숫자·특수문자 포함)
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-red-500" aria-live="polite">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* 제출 버튼 */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "가입 중..." : "회원가입"}
            </Button>
          </form>

          {/* 로그인 링크 */}
          <p className="text-xs text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link href="/auth/signin" className="underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}