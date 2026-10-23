import { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { Toast as ToastType } from '@/components/Toast';

interface ToastContainerProps {
  toasts: ToastType[];
  dismiss: (id: string) => void;
}

const variantConfig = {
  success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-800' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-800' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-800' },
  info: { icon: Info, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/30', border: 'border-sky-200 dark:border-sky-800' },
};

export function ToastContainer({ toasts, dismiss }: ToastContainerProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toasts.length > 0) {
        dismiss(toasts[toasts.length - 1].id);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [toasts, dismiss]);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const config = variantConfig[t.variant];
        const Icon = config.icon;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-xl border ${config.bg} ${config.border} px-4 py-3 shadow-lg animate-in slide-in-from-right`}
          >
            <Icon className={`h-5 w-5 flex-shrink-0 ${config.color} mt-0.5`} />
            <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
