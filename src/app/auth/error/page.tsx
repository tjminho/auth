"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
// ✅ 서버에서 내려주는 reason 값별 메시지 매핑
const errorMessages: Record<string, { title: string; description: string }> = {
  missing_token: {
    title: "토큰이 누락되었습니다",
    description: "인증 링크가 올바르지 않습니다. 다시 시도해주세요.",
  },
  invalid_or_expired: {
    title: "인증 링크가 만료되었거나 유효하지 않습니다",
    description: "다시 인증 메일을 요청해주세요.",
  },
  server_error: {
    title: "서버 오류가 발생했습니다",
    description: "잠시 후 다시 시도해주세요.",
  },
  timeout: {
    title: "인증 시간이 만료되었습니다",
    description:
      "인증 링크의 유효 시간이 지났습니다. 다시 로그인 후 인증을 진행해주세요.",
  },
  invalid: {
    title: "잘못된 인증 요청",
    description:
      "인증 토큰이 올바르지 않습니다. 다시 로그인 후 인증을 시도해주세요.",
  },
  used: {
    title: "이미 사용된 인증 링크",
    description:
      "이 인증 링크는 이미 사용되었습니다. 새 인증 메일을 요청해주세요.",
  },
  mismatch: {
    title: "이메일 불일치",
    description:
      "인증 요청한 이메일과 계정 이메일이 일치하지 않습니다. 다시 시도해주세요.",
  },
  user: {
    title: "사용자를 찾을 수 없습니다",
    description: "계정 정보를 확인할 수 없습니다. 다시 로그인해주세요.",
  },
  expired: {
    title: "세션 만료",
    description: "세션이 만료되었습니다. 다시 로그인해주세요.",
  },
  need_verify: {
    title: "이메일 인증이 필요합니다",
    description: "로그인을 완료하려면 이메일 인증을 먼저 진행해주세요.",
  },
  default: {
    title: "알 수 없는 오류가 발생했습니다",
    description: "다시 시도하거나 관리자에게 문의해주세요.",
  },
};
export default function ErrorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get("reason") ?? "default";
  const error = searchParams.get("error") ?? "";
  const { title, description } =
    errorMessages[reason] ?? errorMessages.default;
  // ✅ 이메일 인증 관련 에러 여부
  const isEmailVerifyError =
    [
      "need_verify",
      "timeout",
      "invalid",
      "used",
      "mismatch",
      "user",
    ].includes(reason) || error.includes("이메일 인증");
  // ✅ 일반 에러는 5초 후 자동 리다이렉트
  useEffect(() => {
    if (!isEmailVerifyError) {
      const timer = setTimeout(() => {
        router.push("/");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [router, isEmailVerifyError]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="max-w-md w-full shadow-md">
        <CardHeader className="flex flex-col items-center text-center">
          <AlertTriangle
            className="h-10 w-10 text-red-500 mb-2"
            aria-hidden="true"
          />
          <CardTitle className="text-lg font-bold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isEmailVerifyError ? (
            <>
              <Button
                onClick={() => router.push("/auth/verify")}
                className="w-full"
              >
                이메일 인증하러 가기
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/")}
                className="w-full"
              >
                홈으로 돌아가기
              </Button>
            </>
          ) : (
            <>
              <p
                className="text-xs text-gray-500 text-center"
                aria-live="polite"
              >
                5초 후 자동으로 홈으로 이동합니다.
              </p>
              <Button onClick={() => router.push("/")} className="w-full">
                홈으로 돌아가기
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/auth/verify")}
                className="w-full"
              >
                이메일 인증 다시 시도
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
