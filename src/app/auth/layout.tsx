import type { ReactNode } from "react"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-md">
            {children}
          </div>
        </div>
  )
}