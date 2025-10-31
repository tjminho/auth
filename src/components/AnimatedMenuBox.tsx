"use client"
import { motion, useAnimation } from "framer-motion"
import { useEffect } from "react"

export default function AnimatedMenuBox({
  label,
  index,
  startX = "50%",   // 시작 X (기본: 가로 중앙)
  startY = "50%",   // 시작 Y (기본: 세로 중앙)
}: {
  label: string
  index: number
  startX?: string | number
  startY?: string | number
}) {
  const controls = useAnimation()

  useEffect(() => {
    async function run() {
      // 출발 → 그리드 셀 자리로 이동
      await controls.start({
        x: 0,
        y: 0,
        opacity: 1,
        scale: 1,
        position: "relative", // 그리드 셀 자리로 복귀
        left: "auto",
        top: "auto",
        transition: {
          duration: 0.8,
          delay: index * 0.1,
          ease: "easeOut",
        },
      })

      // 도착 후 랜덤 흔들림
      const delay = Math.random() * 2
      setTimeout(() => {
        const pattern = Math.floor(Math.random() * 3)
        if (pattern === 0) {
          controls.start({
            x: [0, -3, 3, -2, 2, 0],
            transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
          })
        } else if (pattern === 1) {
          controls.start({
            y: [0, -2, 2, -1, 1, 0],
            transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
          })
        } else {
          controls.start({
            rotate: [0, 1.5, -1.5, 0.5, -0.5, 0],
            transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
          })
        }
      }, delay * 1000)
    }
    run()
  }, [controls, index])

  return (
    <motion.div
      // 모든 박스가 같은 시작점에서 출발
      initial={{
        opacity: 0,
        scale: 0.5,
        position: "fixed", // 뷰포트 기준
        left: startX,
        top: startY,
        x: "-50%", // 중앙 보정
        y: "-50%",
      }}
      animate={controls}
      className="h-10 px-4 flex items-center justify-center rounded-md 
                 bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white 
                 border border-gray-300 dark:border-white/10 shadow-sm select-none"
    >
      <span className="text-sm md:text-base text-center whitespace-nowrap">
        {label}
      </span>
    </motion.div>
  )
}