"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export function HeaderNav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth")
  return (
    <nav className="flex items-center gap-2">
      {!isAuthPage &&
      <div className=''>
      <Link href="/dashboard">
        <Button variant="ghost" size="sm">대시보드</Button>
      </Link>
      <Link href="/admin">
        <Button variant="ghost" size="sm">관리자</Button>
      </Link>
      {status === "authenticated" ? (
        <Button size="sm" onClick={() => signOut()}>로그아웃</Button>
      ) : (
        <Link href="/auth/signin">
          <Button size="sm">로그인</Button>
        </Link>
      )}
      </div>
    }
    </nav>
  );
}