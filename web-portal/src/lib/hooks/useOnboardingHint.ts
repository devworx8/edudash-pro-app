'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseOnboardingHintOptions {
  ttlDays?: number;
}

export function useOnboardingHint(
  hintId: string,
  options: UseOnboardingHintOptions = {}
): [boolean, () => void] {
  const { ttlDays = 30 } = options;
  const storageKey = useMemo(() => `onboarding_hint_${hintId}`, [hintId]);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setShowHint(true);
      return;
    }

    const lastDismissed = new Date(stored);
    if (Number.isNaN(lastDismissed.getTime())) {
      setShowHint(true);
      return;
    }

    const diffMs = Date.now() - lastDismissed.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    setShowHint(diffDays >= ttlDays);
  }, [storageKey, ttlDays]);

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    }
    setShowHint(false);
  }, [storageKey]);

  return [showHint, dismiss];
}
