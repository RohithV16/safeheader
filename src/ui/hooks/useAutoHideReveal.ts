import { useEffect, useState } from 'react';

/**
 * Tracks temporary secret reveal state in rule rows, automatically re-masking
 * after 30 seconds, on window blur, or when Presentation Mode activates.
 */
export function useAutoHideReveal(presentationMode: boolean): [boolean, (v: boolean | ((p: boolean) => boolean)) => void] {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 30_000);
    const onBlur = () => setRevealed(false);
    window.addEventListener('blur', onBlur);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('blur', onBlur);
    };
  }, [revealed]);

  useEffect(() => {
    if (presentationMode) setRevealed(false);
  }, [presentationMode]);

  return [revealed, setRevealed];
}
