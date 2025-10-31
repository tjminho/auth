"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const ForgotPasswordSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
});

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof ForgotPasswordSchema>>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof ForgotPasswordSchema>) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok || !data?.success) {
        toast.error("메일 발송에 실패했습니다. 다시 시도해주세요.");
        return;
      }

      toast.success("비밀번호 재설정 링크가 이메일로 발송되었습니다.");
      router.push("/auth/signin");
    } catch (e) {
      setLoading(false);
      toast.error("서버 오류가 발생했습니다.");
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>비밀번호 재설정</CardTitle>
          <CardDescription>
            가입한 이메일 주소를 입력하면 재설정 링크를 보내드립니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "처리 중..." : "메일 보내기"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center">
            <Link href="/auth/signin" className="underline">
              로그인 화면으로 돌아가기
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}