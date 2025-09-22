"use client";

import { signIn } from "next-auth/react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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

const SignInSchema = z.object({
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
});

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  // 로그인 상태면 홈으로 이동
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const form = useForm<z.infer<typeof SignInSchema>>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof SignInSchema>) {
    setLoading(true);
    const res = await signIn("credentials", {
      redirect: false, // 수동 이동
      email: values.email,
      password: values.password,
      callbackUrl: "/", // 로그인 후 홈
    });
    setLoading(false);

    if (!res) return;

    if (res.error) {
      form.setValue("password", "");
      if (res.error.includes("로그인 시도가 너무 많습니다")) {
        toast.error(res.error, { position: "top-center" });
      } else {
        toast.error("이메일 또는 비밀번호가 올바르지 않습니다.", {
          position: "top-center",
        });
      }
      return;
    }

    // 로그인 성공 → 홈으로 이동
    if (res.url) {
      router.push(res.url);
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
          <CardTitle>로그인</CardTitle>
          <CardDescription>
            이메일과 비밀번호로 로그인하거나, 소셜 계정으로 계속하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                또는
              </span>
            </div>
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
        </CardContent>
      </Card>
    </div>
  );
}