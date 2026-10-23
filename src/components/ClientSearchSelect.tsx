import { useState, useRef, useEffect } from 'react';
import { Search, User, X, ChevronDown } from 'lucide-react';
import type { Client } from '@/lib/types';

interface ClientSearchSelectProps {
  clients: Client[];
  value: string | null | undefined;
  onChange: (clientId: string | null) => void;
  placeholder?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onOpenClient?: (clientId: string) => void;
}

export function ClientSearchSelect({
  clients,
  value,
  onChange,
  placeholder = 'Buscar cliente por nome, CPF ou telefone...',
  required = false,
  allowEmpty = true,
  emptyLabel = 'Sem cliente',
  onOpenClient,
}: ClientSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === value) ?? null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = clients.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      (c.cpf ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.whatsapp ?? '').toLowerCase().includes(q)
    );
  });

  const handleSelect = (clientId: string | null) => {
    onChange(clientId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 input cursor-pointer" onClick={() => setOpen(!open)}>
          <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{selected.full_name}</p>
            {(selected.cpf || selected.phone) && (
              <p className="text-xs text-slate-400 truncate">
                {[selected.cpf, selected.phone].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onOpenClient && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenClient(selected.id); }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Abrir cadastro"
              >
                <User className="h-4 w-4" />
              </button>
            )}
            {allowEmpty && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
                className="text-slate-400 hover:text-red-500"
                title="Remover"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`input flex items-center gap-2 text-left ${required && !selected ? 'ring-2 ring-amber-300' : ''}`}
        >
          <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-400">{required ? 'Selecione um cliente...' : emptyLabel}</span>
          <ChevronDown className="h-4 w-4 text-slate-400 ml-auto" />
        </button>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                className="input pl-9 py-1.5 text-sm"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered.length > 0) {
                    handleSelect(filtered[0].id);
                  } else if (e.key === 'Escape') {
                    setOpen(false);
                    setQuery('');
                  }
                }}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400">Nenhum cliente encontrado</p>
            ) : (
              filtered.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {[c.cpf, c.phone, c.whatsapp].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
