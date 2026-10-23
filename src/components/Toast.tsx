import { useEffect, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

let toastCounter = 0;
let addToastFn: ((message: string, variant: ToastVariant) => void) | null = null;

export function toast(message: string, variant: ToastVariant = 'info') {
  if (addToastFn) addToastFn(message, variant);
}

export function useToastHandler() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    addToastFn = (message: string, variant: ToastVariant) => {
      const id = `toast-${++toastCounter}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
    return () => {
      addToastFn = null;
    };
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return { toasts, dismiss };
}
