import { useState, useCallback, useRef } from 'react';

export function useSaving() {
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const withSaving = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await fn();
      return result;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  return { saving, withSaving };
}
