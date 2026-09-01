'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

interface AppSplashScreenProps {
  siteName: string;
}

export function AppSplashScreen({ siteName }: AppSplashScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div
        aria-hidden='true'
        className={`pwa-splash fixed inset-0 z-[10000] items-center justify-center overflow-hidden bg-[#071426] transition-opacity duration-500 ${
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {/* 柔和霓虹氛围光 */}
        <div className='absolute -right-24 -top-28 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl' />
        <div className='absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl' />
        <div className='absolute left-1/2 top-[38%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl' />

        {/* 星点 */}
        <span className='absolute left-[18%] top-[23%] h-1 w-1 rounded-full bg-white/55 shadow-[0_0_10px_rgba(255,255,255,0.85)]' />
        <span className='absolute right-[19%] top-[31%] h-1.5 w-1.5 rounded-full bg-cyan-200/60 shadow-[0_0_12px_rgba(165,243,252,0.8)]' />
        <span className='absolute bottom-[31%] left-[27%] h-1 w-1 rounded-full bg-violet-200/60 shadow-[0_0_10px_rgba(221,214,254,0.8)]' />
        <span className='absolute bottom-[25%] right-[24%] h-1 w-1 rounded-full bg-white/45 shadow-[0_0_10px_rgba(255,255,255,0.7)]' />

        <div className='relative flex -translate-y-5 flex-col items-center px-8 text-center'>
          <div className='splash-logo-float relative flex h-32 w-32 items-center justify-center rounded-[34px] border border-white/10 bg-white/[0.055] shadow-[0_0_55px_rgba(96,165,250,0.18)] backdrop-blur-xl'>
            <div className='absolute inset-3 rounded-[28px] bg-gradient-to-br from-violet-400/10 via-transparent to-cyan-300/10' />
            <Image
              src='/icons/zeptol-512.png'
              alt=''
              width={96}
              height={96}
              priority
              className='relative h-24 w-24 rounded-[25px] drop-shadow-[0_0_24px_rgba(129,140,248,0.42)]'
            />
          </div>

          <h1 className='mt-7 max-w-[80vw] truncate text-2xl font-semibold tracking-[0.08em] text-white/95 drop-shadow-sm'>
            {siteName}
          </h1>
          <p className='mt-2 text-[11px] font-medium tracking-[0.3em] text-cyan-100/55'>
            影视 · 随心看
          </p>

          <div className='mt-9 h-1 w-28 overflow-hidden rounded-full bg-white/10'>
            <div className='splash-loading h-full w-1/2 rounded-full bg-gradient-to-r from-violet-400/80 to-cyan-300/90 shadow-[0_0_12px_rgba(103,232,249,0.4)]' />
          </div>
        </div>
      </div>

      <style jsx global>{`
        .pwa-splash {
          display: none;
        }

        @media (display-mode: standalone) {
          .pwa-splash {
            display: flex;
          }
        }

        @keyframes splash-logo-float {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-5px) scale(1.015);
          }
        }

        @keyframes splash-loading {
          0% {
            transform: translateX(-120%);
            opacity: 0.35;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(240%);
            opacity: 0.35;
          }
        }

        .splash-logo-float {
          animation: splash-logo-float 2.8s ease-in-out infinite;
        }

        .splash-loading {
          animation: splash-loading 1.05s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .splash-logo-float,
          .splash-loading {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
