import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Search,
  Users,
  Calendar,
  FileText,
  ClipboardList,
  Camera,
  Megaphone,
  Truck,
  Wallet,
  X,
  ArrowRight,
} from 'lucide-react';
import type { Page } from '@/components/Sidebar';

interface SearchResult {
  id: string;
  category: string;
  label: string;
  sublabel: string;
  page: Page;
  keywords: string;
}

interface GlobalSearchProps {
  onNavigate: (page: Page) => void;
}

const CATEGORY_ORDER = [
  'Clientes',
  'Compromissos',
  'Orçamentos',
  'Ordens de serviço',
  'Serviços',
  'Campanhas',
  'Fornecedores',
  'Financeiro',
];

const CATEGORY_META: Record<string, { icon: typeof Users; page: Page; color: string }> = {
  'Clientes': { icon: Users, page: 'clients', color: 'text-sky-600' },
  'Compromissos': { icon: Calendar, page: 'agenda', color: 'text-violet-600' },
  'Orçamentos': { icon: FileText, page: 'budgets', color: 'text-amber-600' },
  'Ordens de serviço': { icon: ClipboardList, page: 'orders', color: 'text-teal-600' },
  'Serviços': { icon: Camera, page: 'services', color: 'text-indigo-600' },
  'Campanhas': { icon: Megaphone, page: 'campaigns', color: 'text-pink-600' },
  'Fornecedores': { icon: Truck, page: 'suppliers', color: 'text-orange-600' },
  'Financeiro': { icon: Wallet, page: 'financial', color: 'text-emerald-600' },
};

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cacheRef = useRef<SearchResult[]>([]);

  const loadCache = useCallback(async () => {
    if (cacheRef.current.length > 0) return;
    const [clients, appts, budgets, orders, services, campaigns, suppliers, entries, expenses] = await Promise.all([
      supabase.from('clients').select('id,full_name,phone,whatsapp,email,cpf,cnpj,status').eq('status', 'ativo'),
      supabase.from('appointments').select('id,title,appointment_date,start_time,status,client_id'),
      supabase.from('budgets').select('id,code,client_id,status,total,created_at'),
      supabase.from('service_orders').select('id,code,title,status,due_date,client_id'),
      supabase.from('services').select('id,code,name,price,active'),
      supabase.from('campaigns').select('id,name,category,status'),
      supabase.from('suppliers').select('id,name,category,phone,email,active').eq('active', true),
      supabase.from('financial_entries').select('id,description,total_amount,due_date,status,client_id'),
      supabase.from('financial_expenses').select('id,description,amount,due_date,status'),
    ]);

    const items: SearchResult[] = [];

    (clients.data ?? []).forEach((c: Record<string, unknown>) => {
      items.push({
        id: `client-${c.id as string}`,
        category: 'Clientes',
        label: String(c.full_name ?? ''),
        sublabel: [c.phone as string, c.whatsapp as string, c.email as string, c.cpf as string, c.cnpj as string].filter(Boolean).join(' · '),
        page: 'clients',
        keywords: `${c.full_name ?? ''} ${c.phone ?? ''} ${c.whatsapp ?? ''} ${c.email ?? ''} ${c.cpf ?? ''} ${c.cnpj ?? ''}`.toLowerCase(),
      });
    });

    (appts.data ?? []).forEach((a: Record<string, unknown>) => {
      items.push({
        id: `appt-${a.id as string}`,
        category: 'Compromissos',
        label: String(a.title ?? ''),
        sublabel: `${formatDate(a.appointment_date as string)} ${a.start_time ?? ''} · ${String(a.status ?? '')}`,
        page: 'agenda',
        keywords: `${a.title ?? ''} ${a.appointment_date ?? ''} ${a.status ?? ''}`.toLowerCase(),
      });
    });

    (budgets.data ?? []).forEach((b: Record<string, unknown>) => {
      items.push({
        id: `budget-${b.id as string}`,
        category: 'Orçamentos',
        label: `${b.code ?? ''} · ${formatCurrency(Number(b.total ?? 0))}`,
        sublabel: `${String(b.status ?? '')} · ${formatDate(b.created_at as string)}`,
        page: 'budgets',
        keywords: `${b.code ?? ''} ${b.status ?? ''} ${b.total ?? ''}`.toLowerCase(),
      });
    });

    (orders.data ?? []).forEach((o: Record<string, unknown>) => {
      items.push({
        id: `order-${o.id as string}`,
        category: 'Ordens de serviço',
        label: `${o.code ?? ''} — ${o.title ?? ''}`,
        sublabel: `${String(o.status ?? '')}${o.due_date ? ` · Entrega: ${formatDate(o.due_date as string)}` : ''}`,
        page: 'orders',
        keywords: `${o.code ?? ''} ${o.title ?? ''} ${o.status ?? ''}`.toLowerCase(),
      });
    });

    (services.data ?? []).forEach((s: Record<string, unknown>) => {
      items.push({
        id: `service-${s.id as string}`,
        category: 'Serviços',
        label: String(s.name ?? ''),
        sublabel: `${s.code ?? ''} · ${formatCurrency(Number(s.price ?? 0))}`,
        page: 'services',
        keywords: `${s.name ?? ''} ${s.code ?? ''} ${s.price ?? ''}`.toLowerCase(),
      });
    });

    (campaigns.data ?? []).forEach((c: Record<string, unknown>) => {
      items.push({
        id: `campaign-${c.id as string}`,
        category: 'Campanhas',
        label: String(c.name ?? ''),
        sublabel: `${c.category ?? ''} · ${String(c.status ?? '')}`,
        page: 'campaigns',
        keywords: `${c.name ?? ''} ${c.category ?? ''} ${c.status ?? ''}`.toLowerCase(),
      });
    });

    (suppliers.data ?? []).forEach((s: Record<string, unknown>) => {
      items.push({
        id: `supplier-${s.id as string}`,
        category: 'Fornecedores',
        label: String(s.name ?? ''),
        sublabel: [s.category as string, s.phone as string, s.email as string].filter(Boolean).join(' · '),
        page: 'suppliers',
        keywords: `${s.name ?? ''} ${s.category ?? ''} ${s.phone ?? ''} ${s.email ?? ''}`.toLowerCase(),
      });
    });

    (entries.data ?? []).forEach((e: Record<string, unknown>) => {
      items.push({
        id: `entry-${e.id as string}`,
        category: 'Financeiro',
        label: String(e.description ?? ''),
        sublabel: `Receber · ${formatCurrency(Number(e.total_amount ?? 0))} · ${formatDate(e.due_date as string)} · ${String(e.status ?? '')}`,
        page: 'financial',
        keywords: `${e.description ?? ''} receber ${e.status ?? ''} ${e.due_date ?? ''}`.toLowerCase(),
      });
    });

    (expenses.data ?? []).forEach((e: Record<string, unknown>) => {
      items.push({
        id: `expense-${e.id as string}`,
        category: 'Financeiro',
        label: String(e.description ?? ''),
        sublabel: `Pagar · ${formatCurrency(Number(e.amount ?? 0))} · ${formatDate(e.due_date as string)} · ${String(e.status ?? '')}`,
        page: 'financial',
        keywords: `${e.description ?? ''} pagar ${e.status ?? ''} ${e.due_date ?? ''}`.toLowerCase(),
      });
    });

    cacheRef.current = items;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      loadCache();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open, loadCache]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const q = query.toLowerCase();
    const filtered = cacheRef.current.filter((r) => r.keywords.includes(q)).slice(0, 50);
    setResults(filtered);
    setSelectedIndex(0);
    setLoading(false);
  }, [query]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  const flatForNav = results;

  const handleSelect = (r: SearchResult) => {
    onNavigate(r.page);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatForNav.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatForNav[selectedIndex]) handleSelect(flatForNav[selectedIndex]);
    }
  };

  let runningIndex = -1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full sm:w-64 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        title="Buscar (Ctrl+K)"
      >
        <Search className="h-4 w-4 flex-shrink-0" />
        <span className="hidden sm:inline truncate">Buscar clientes, OS, orçamentos...</span>
        <span className="sm:hidden">Buscar</span>
        <kbd className="hidden sm:inline-flex ml-auto text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300">Ctrl+K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl flex flex-col max-h-[75vh] overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <Search className="h-5 w-5 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none text-base"
                placeholder="Pesquisar em todo o sistema..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {!query.trim() ? (
                <div className="py-10 text-center text-slate-400">
                  <Search className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm">Digite para pesquisar clientes, compromissos, orçamentos, OS, serviços, campanhas, fornecedores e finanças.</p>
                </div>
              ) : loading ? (
                <div className="py-10 text-center text-slate-400 text-sm">Buscando...</div>
              ) : results.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">Nenhum resultado encontrado para "{query}"</div>
              ) : (
                <div className="py-2">
                  {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length > 0).map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const CatIcon = meta.icon;
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                          <CatIcon className={`h-3.5 w-3.5 ${meta.color}`} />
                          {cat}
                          <span className="ml-1 normal-case font-normal">({grouped[cat].length})</span>
                        </div>
                        {grouped[cat].map((r) => {
                          runningIndex++;
                          const idx = runningIndex;
                          const isSel = idx === selectedIndex;
                          return (
                            <button
                              key={r.id}
                              onClick={() => handleSelect(r)}
                              onMouseEnter={() => setSelectedIndex(idx)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSel ? 'bg-slate-100 dark:bg-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{r.label}</p>
                                <p className="text-xs text-slate-400 truncate">{r.sublabel}</p>
                              </div>
                              <ArrowRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2 flex items-center justify-between text-xs text-slate-400">
              <span>{results.length} resultado(s)</span>
              <div className="flex items-center gap-3">
                <span><kbd className="px-1 rounded bg-slate-100 dark:bg-slate-600">↑↓</kbd> navegar</span>
                <span><kbd className="px-1 rounded bg-slate-100 dark:bg-slate-600">Enter</kbd> abrir</span>
                <span><kbd className="px-1 rounded bg-slate-100 dark:bg-slate-600">Esc</kbd> fechar</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
