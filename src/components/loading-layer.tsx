"use client";
import { useState } from "react";
import { GlobalLoading } from "@/components/global-loading";
export function LoadingLayer() {
  const [loading] = useState(false); // 추후 zustand/context로 대체 가능
  return <GlobalLoading show={loading} />;
}
