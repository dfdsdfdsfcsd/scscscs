import { AlertCircle } from 'lucide-react';

export interface ValidationError {
  field: string;
  label: string;
  message: string;
}

interface ValidationDialogProps {
  open: boolean;
  errors: ValidationError[];
  onCorrect: () => void;
  onBack: () => void;
}

export function ValidationDialog({ open, errors, onCorrect, onBack }: ValidationDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onBack} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Não foi possível concluir o cadastro</h3>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Os seguintes campos precisam de atenção antes de continuar:
        </p>

        <div className="space-y-2 max-h-[300px] overflow-y-auto mb-6">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
              <div className="min-0 flex-1">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">{err.label}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{err.message}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onBack} className="btn-secondary">Voltar ao formulário</button>
          <button onClick={onCorrect} className="btn-primary">Corrigir agora</button>
        </div>
      </div>
    </div>
  );
}
