"use client"
import dynamic from "next/dynamic";
const VerifyBanner = dynamic(() => import("@/components/VerifyBanner"));

const VerifyBannerWrapper = () => {
  return (
    <div className=''><VerifyBanner /></div>
  )
}

export default VerifyBannerWrapper