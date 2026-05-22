import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is narrower than `bp` (default 768px).
 * Updates on resize. SSR-safe (returns false on server).
 */
export function useIsMobile(bp = 768): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return isMobile;
}
