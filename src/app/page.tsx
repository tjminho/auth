import VerifyBannerWrapper from "@/components/VerifyBannerWrapper";

export default function Home() {

  return (
    <main className="p-6">
      <VerifyBannerWrapper />
      <div className='w-full flex items-center justify-between'>
<div
        className="relative w-96 h-64 group"
      ><h1 className="text-2xl font-semibold">Auth starter</h1>
      <p className="text-muted-foreground">로그인하고 대시보드로 이동해보세요.</p>

          </div>
          </div>

    </main>
  );
}
