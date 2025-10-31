"use client"
import { useEffect, useState } from "react"
import { motion, AnimatePresence, LazyMotion, domAnimation } from "framer-motion"
import MenuGrid from "./MenuGrid"
import Image from "next/image"


const slides = [
  {
    title: "금형 관리",
    bg: "/mold-bg.png",
    menus: ["금형 정보","금형 입출고","금형 수리/수정","금형 수입","금형 점검","성형 조건"],
  },
  {
    title: "원재료 관리",
    bg: "/mold-bg.png",
    menus: ["원재료 정보","원재료 입출고/투입","원재료 현재고","착색데이터"],
  },
  {
    title: "제품 관리",
    bg: "/mold-bg.png",
    menus: ["제품 정보","실적 등록","재고 관리","품질 관리","작업지시서"],
  },
]

export default function FeatureSlider() {
  const [index, setIndex] = useState(0)
  const [isHover, setIsHover] = useState(false)

  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length)
  const next = () => setIndex((i) => (i + 1) % slides.length)

  useEffect(() => {
    if (isHover) return
    const t = setInterval(next, 10000) // 10초마다 자동 전환
    return () => clearInterval(t)
  }, [isHover])

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="relative w-full h-[500px] overflow-hidden rounded-xl border border-white/10"
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            {/* 배경 이미지 */}
            <div className="relative w-full h-full">
                <Image
                src={slides[index].bg}
                alt={slides[index].title}
                width={600}
                height={600}
                priority
                className="absolute top-44 left-10 object-contain"
                />
                {/* 어두운 오버레이 */}
                {/* <div className="absolute inset-0 bg-black/50" /> */}
            </div>

            {/* 중앙 콘텐츠 */}
            <div className="absolute top-4 w-full z-10 flex flex-col items-center justify-center gap-6 px-6">
              <h2 className="ml-auto text-2xl font-bold text-white drop-shadow">
                {slides[index].title}
              </h2>
              <MenuGrid menus={slides[index].menus} />
            </div>

            {/* 하단 네비게이션 */}
            <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center gap-4">
              <button
                onClick={prev}
                aria-label="이전 슬라이드"
                className="px-3 py-1 rounded bg-white/20 hover:bg-white/40 text-white"
              >
                ←
              </button>
              <div className="flex gap-2">
                {slides.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    aria-label={`${s.title} 보기`}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      i === index ? "bg-emerald-500" : "bg-white/30"
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={next}
                aria-label="다음 슬라이드"
                className="px-3 py-1 rounded bg-white/20 hover:bg-white/40 text-white"
              >
                →
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </LazyMotion>
  )
}
