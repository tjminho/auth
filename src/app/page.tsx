"use client"
import dynamic from "next/dynamic";
import { useState } from "react";
const VerifyBanner = dynamic(() => import("@/components/VerifyBanner"));
export default function Home() {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }
  return (
    <main className="p-6">
      <VerifyBanner />
      <h1 className="text-2xl font-semibold">Auth starter</h1>
      <p className="text-muted-foreground">로그인하고 대시보드로 이동해보세요.</p>
<div 
        className="relative w-96 h-64 group"
        onMouseMove={handleMouseMove}
      >
        {/* 밝아지는 테두리 효과 */}
        <div
          className="absolute -inset-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity blur-sm"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(96, 165, 250, 0.4), transparent 40%)`,
          }}
        />
        
        {/* 메인 박스 */}
        <div className="relative w-full h-full border border-gray-700 rounded-lg bg-gray-950 p-6 text-center text-white">
          <h2 className="text-xl font-bold mb-2">테두리 글로우</h2>
          <p className="text-gray-400 text-sm">더 부드러운 효과</p>
          <p className="text-gray-500 text-xs mt-4">X: {mousePosition.x.toFixed(0)}, Y: {mousePosition.y.toFixed(0)}</p>
        </div>
      </div>
    </main>
  );
}
