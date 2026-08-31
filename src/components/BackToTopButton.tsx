'use client';

import { ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BackToTopButtonProps {
  hidden?: boolean;
}

export function BackToTopButton({ hidden = false }: BackToTopButtonProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    if (hidden) {
      setShowBackToTop(false);
      return;
    }

    const getScrollTop = () =>
      Math.max(
        window.scrollY || 0,
        document.documentElement.scrollTop || 0,
        document.body.scrollTop || 0
      );

    const handleScroll = () => {
      setShowBackToTop(getScrollTop() > 300);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, [hidden]);

  const scrollToTop = () => {
    try {
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    }
  };

  if (hidden) return null;

  return (
    <button
      onClick={scrollToTop}
      className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
        showBackToTop
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      aria-label='返回顶部'
    >
      <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
    </button>
  );
}
