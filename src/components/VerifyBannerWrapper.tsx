"use client";
import dynamic from "next/dynamic";

const VerifyBanner = dynamic(() => import("@/components/VerifyBanner"), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-500">로딩 중...</div>,
});

export default function VerifyBannerWrapper() {
  return <VerifyBanner />;
}