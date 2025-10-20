import "./globals.css";
import Link from "next/link";
import { Providers } from "./providers";
import { Separator } from "@/components/ui/separator";
import { HeaderNav } from "@/components/header-nav";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-black text-foreground">
        <Providers>
          <header className="border-b">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
              <Link href="/" className="text-sm font-semibold">Auth Starter</Link>
              <HeaderNav />
            </div>
          </header>
          <Separator />
          <main className="mx-auto max-w-5xl p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
