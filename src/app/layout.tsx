// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import { Providers } from "./providers";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-background text-foreground">
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold">Auth Starter</Link>
            <nav className="flex items-center gap-2">
              <Link href="/dashboard"><Button variant="ghost" size="sm">대시보드</Button></Link>
              <Link href="/admin"><Button variant="ghost" size="sm">관리자</Button></Link>
              <Link href="/auth/signin"><Button size="sm">로그인</Button></Link>
            </nav>
          </div>
        </header>
        <Separator />
        <main className="mx-auto max-w-5xl p-6">{children}</main>
        <Providers />
      </body>
    </html>
  );
}
