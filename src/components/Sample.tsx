'use client'

export default function SamplePgae() {
  const boxes = [
    { id: 1, color: 'bg-pink-500', delay: 0, x: -150, y: -200 },
    { id: 2, color: 'bg-purple-500', delay: 0.2, x: -80, y: -180 },
    { id: 3, color: 'bg-blue-500', delay: 0.4, x: 0, y: -220 },
    { id: 4, color: 'bg-indigo-500', delay: 0.6, x: 80, y: -190 },
    { id: 5, color: 'bg-cyan-500', delay: 0.8, x: 150, y: -210 },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      {/* 박스들이 시작하는 중심점 */}
      <div className="relative w-32 h-32">
        {boxes.map((box) => (
          <div
            key={box.id}
            className={`absolute w-20 h-20 rounded-lg ${box.color} shadow-lg`}
            style={{
              left: '50%',
              top: '50%',
              marginLeft: '-40px',
              marginTop: '-40px',
              animation: `scatter-shake-${box.id} 0.5s ease-out ${box.delay}s forwards, shake-${box.id} ${1.5 + box.id * 0.3}s ease-in-out ${box.delay + 0.5}s infinite`
            }}
          />
        ))}
      </div>

      <p className="mt-12 text-muted-foreground text-center">
        박스들이 순차적으로 흩어지며 떨립니다
      </p>

      {/* 흩어지는 애니메이션 + 흔들림 애니메이션 */}
      <style jsx>{`
        @keyframes scatter-shake-1 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-150px, -200px); }
        }
        @keyframes scatter-shake-2 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-80px, -180px); }
        }
        @keyframes scatter-shake-3 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(0px, -220px); }
        }
        @keyframes scatter-shake-4 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(80px, -190px); }
        }
        @keyframes scatter-shake-5 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(150px, -210px); }
        }
        
        @keyframes shake-1 {
          0%, 100% { transform: translate(-150px, -200px) rotate(0deg); }
          10% { transform: translate(-148px, -202px) rotate(1deg); }
          20% { transform: translate(-152px, -198px) rotate(-1deg); }
          30% { transform: translate(-149px, -201px) rotate(0.5deg); }
          40% { transform: translate(-151px, -199px) rotate(-0.5deg); }
          50% { transform: translate(-150px, -200px) rotate(0deg); }
          60% { transform: translate(-152px, -201px) rotate(1deg); }
          70% { transform: translate(-148px, -199px) rotate(-1deg); }
          80% { transform: translate(-151px, -200px) rotate(0.5deg); }
          90% { transform: translate(-149px, -200px) rotate(-0.5deg); }
        }
        
        @keyframes shake-2 {
          0%, 100% { transform: translate(-80px, -180px) rotate(0deg); }
          12% { transform: translate(-82px, -182px) rotate(-1deg); }
          24% { transform: translate(-78px, -178px) rotate(1deg); }
          36% { transform: translate(-81px, -181px) rotate(-0.5deg); }
          48% { transform: translate(-79px, -179px) rotate(0.5deg); }
          60% { transform: translate(-80px, -180px) rotate(0deg); }
          72% { transform: translate(-81px, -182px) rotate(1deg); }
          84% { transform: translate(-79px, -178px) rotate(-1deg); }
        }
        
        @keyframes shake-3 {
          0%, 100% { transform: translate(0px, -220px) rotate(0deg); }
          8% { transform: translate(2px, -222px) rotate(1.5deg); }
          16% { transform: translate(-2px, -218px) rotate(-1.5deg); }
          24% { transform: translate(1px, -221px) rotate(0.8deg); }
          32% { transform: translate(-1px, -219px) rotate(-0.8deg); }
          40% { transform: translate(0px, -220px) rotate(0deg); }
          48% { transform: translate(2px, -221px) rotate(1deg); }
          56% { transform: translate(-2px, -219px) rotate(-1deg); }
          64% { transform: translate(1px, -220px) rotate(0.5deg); }
          72% { transform: translate(-1px, -220px) rotate(-0.5deg); }
        }
        
        @keyframes shake-4 {
          0%, 100% { transform: translate(80px, -190px) rotate(0deg); }
          15% { transform: translate(82px, -188px) rotate(-1deg); }
          30% { transform: translate(78px, -192px) rotate(1deg); }
          45% { transform: translate(81px, -189px) rotate(-0.5deg); }
          60% { transform: translate(79px, -191px) rotate(0.5deg); }
          75% { transform: translate(80px, -190px) rotate(0deg); }
        }
        
        @keyframes shake-5 {
          0%, 100% { transform: translate(150px, -210px) rotate(0deg); }
          10% { transform: translate(148px, -208px) rotate(1.2deg); }
          20% { transform: translate(152px, -212px) rotate(-1.2deg); }
          30% { transform: translate(149px, -209px) rotate(0.6deg); }
          40% { transform: translate(151px, -211px) rotate(-0.6deg); }
          50% { transform: translate(150px, -210px) rotate(0deg); }
          60% { transform: translate(151px, -209px) rotate(1deg); }
          70% { transform: translate(149px, -211px) rotate(-1deg); }
          80% { transform: translate(150px, -210px) rotate(0.5deg); }
          90% { transform: translate(150px, -210px) rotate(-0.5deg); }
        }
      `}</style>
    </div>
  )
}