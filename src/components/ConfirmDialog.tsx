interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'danger',
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmColor =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : variant === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700 text-white'
        : 'bg-sky-600 hover:bg-sky-700 text-white';

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-2xl">
        <div className="px-6 py-5">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
