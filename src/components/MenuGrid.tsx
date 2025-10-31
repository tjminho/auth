"use client"
import { motion } from "framer-motion"
import AnimatedMenuBox from "./AnimatedMenuBox"

export default function MenuGrid({ menus }: { menus: string[] }) {
  return (
    <motion.div
      className="relative grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 justify-items-center"
      initial="hidden"
      animate="show"
    >
      {menus.map((m, i) => (
        <AnimatedMenuBox
          key={i}
          label={m}
          index={i}
          startX="50%"  // 가로 중앙
          startY="50%"  // 세로 중앙 (정중앙 출발)
        />
      ))}
    </motion.div>
  )
}