'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Fires once, at 25% visibility, and never again — nothing on this page should
 * re-animate when the reader scrolls back up.
 */
export function useInView<T extends Element>(amount = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: amount }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [amount, inView]);

  return [ref, inView] as const;
}
