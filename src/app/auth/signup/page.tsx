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
import { Loader2, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

// ✅ 서버 응답 코드별 메시지 매핑
const errorMessages: Record<string, string> = {
  EMAIL_IN_USE: "이미 사용 중인 이메일입니다.",
  INVALID_INPUT: "입력값이 올바르지 않습니다.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  SERVER_ERROR: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  MAIL_SEND_FAILED: "가입은 완료되었지만 인증 메일 발송에 실패했습니다.",
  default: "회원가입 중 오류가 발생했습니다.",
};

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  const { status } = useSession();
  const searchParams = useSearchParams();

  // ✅ reason 파라미터 기반 경고 배너
  const reason = searchParams.get("reason") ?? "";
  const error = searchParams.get("error") ?? "";
  const bannerMessage =
    errorMessages[reason] || errorMessages[error] || errorMessages.default;

  // ✅ 로그인 상태면 홈으로 이동
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
      confirmPassword: "",
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
        // JSON 파싱 실패 시 무시
      }

      if (!res.ok || !data?.success) {
        const msg =
          errorMessages[data?.error as keyof typeof errorMessages] ||
          data?.message ||
          errorMessages.default;
        toast.error(msg);
        if (data?.redirect) {
          router.push(data.redirect);
        }
        return;
      }

      const targetEmail = data?.email || values.email;
      const vid = data?.vid; // ✅ 서버에서 받은 vid
      toast.success(`${targetEmail} 주소로 인증 메일을 발송했습니다.`);

      // ✅ vid 포함해서 verify 페이지로 이동
      router.push(
        `/auth/verify?email=${encodeURIComponent(targetEmail)}${
          vid ? `&vid=${encodeURIComponent(vid)}` : ""
        }`
      );
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
      {/* ✅ reason이 있으면 경고 배너 표시 */}
      {reason && (
        <div className="mb-4 bg-yellow-50 border border-yellow-300 p-3 rounded-md flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-800">회원가입 오류</p>
            <p className="text-sm text-yellow-700">{bannerMessage}</p>
          </div>
        </div>
      )}

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
              <Input
                id="name"
                {...form.register("name")}
                autoComplete="name"
                disabled={loading}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500" aria-live="polite">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* 이메일 */}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                autoComplete="email"
                disabled={loading}
              />
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
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
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

            {/* 비밀번호 확인 */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  {...form.register("confirmPassword")}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                  aria-label={
                    showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 표시"
                  }
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-red-500" aria-live="polite">
                  {form.formState.errors.confirmPassword.message}
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