import { useState, useEffect, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Camera,
  FileText,
  Receipt,
  Wallet,
  TrendingUp,
  Settings as SettingsIcon,
  HardDrive,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Camera as CameraLogo,
  ShieldCheck,
  Truck,
  ClipboardList,
  Contact,
  Megaphone,
  Percent,
  DoorOpen,
  UserCog,
  Package,
  Cloud,
  Sun,
  Moon,
} from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { supabase } from '@/lib/supabase';
import { todayISO, daysUntil, toLocalISODate } from '@/lib/utils';
import { GlobalSearch } from '@/components/GlobalSearch';

export type Page =
  | 'dashboard'
  | 'clients'
  | 'agenda'
  | 'services'
  | 'budgets'
  | 'orders'
  | 'documents'
  | 'authorizations'
  | 'cash'
  | 'financial'
  | 'alerts'
  | 'suppliers'
  | 'campaigns'
  | 'commissions'
  | 'resources'
  | 'professionals'
  | 'inventory'
  | 'crm'
  | 'settings'
  | 'sync'
  | 'backup';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type NavItem = { page: Page; label: string; icon: typeof LayoutDashboard };
type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { title: '', items: [{ page: 'dashboard', label: 'Painel inicial', icon: LayoutDashboard }] },
  {
    title: 'Atendimento',
    items: [
      { page: 'clients', label: 'Clientes', icon: Users },
      { page: 'agenda', label: 'Agenda e calendário', icon: Calendar },
      { page: 'crm', label: 'CRM e histórico', icon: Contact },
    ],
  },
  {
    title: 'Vendas',
    items: [
      { page: 'services', label: 'Serviços e produtos', icon: Camera },
      { page: 'budgets', label: 'Orçamentos', icon: FileText },
      { page: 'campaigns', label: 'Campanhas e rentabilidade', icon: Megaphone },
    ],
  },
  {
    title: 'Produção',
    items: [
      { page: 'orders', label: 'Ordens de serviço', icon: ClipboardList },
      { page: 'inventory', label: 'Estoque de materiais', icon: Package },
      { page: 'resources', label: 'Salas e equipamentos', icon: DoorOpen },
      { page: 'professionals', label: 'Profissionais', icon: UserCog },
      { page: 'suppliers', label: 'Fornecedores', icon: Truck },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { page: 'cash', label: 'Caixa diário', icon: Wallet },
      { page: 'financial', label: 'Fluxo financeiro', icon: TrendingUp },
      { page: 'commissions', label: 'Comissões', icon: Percent },
    ],
  },
  {
    title: 'Documentos',
    items: [
      { page: 'documents', label: 'Contratos e documentos', icon: Receipt },
      { page: 'authorizations', label: 'Autorizações de imagem', icon: ShieldCheck },
    ],
  },
  {
    title: 'Administração',
    items: [
      { page: 'alerts', label: 'Central de alertas', icon: Bell },
      { page: 'settings', label: 'Configurações', icon: SettingsIcon },
      { page: 'sync', label: 'Sincronização Google Drive', icon: Cloud },
      { page: 'backup', label: 'Backup e restauração', icon: HardDrive },
    ],
  },
];

export function Sidebar({ currentPage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const { settings, toggleTheme } = useSettings();
  const [alertCount, setAlertCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const all = new Set<string>();
    navGroups.forEach((g) => { if (g.title) all.add(g.title); });
    return all;
  });

  useEffect(() => {
    for (const g of navGroups) {
      if (g.title && g.items.some((i) => i.page === currentPage) && !expandedGroups.has(g.title)) {
        setExpandedGroups((prev) => new Set(prev).add(g.title));
      }
    }
  }, [currentPage]);

  useEffect(() => {
    const loadAlertCount = async () => {
      const advance = settings.alert_advance_days ?? 7;
      const today = todayISO();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + advance);
      const future = toLocalISODate(futureDate);

      const dismissedRes = await supabase.from('alert_dismissals').select('alert_key');
      const dismissed = new Set((dismissedRes.data ?? []).map((d: { alert_key: string }) => d.alert_key));

      let count = 0;
      const [clients, appts, budgets, receivables, payables, revokedFolders, expiredAuths, revokedAuths, lowStock] = await Promise.all([
        supabase.from('clients').select('id,birth_date,status').eq('status', 'ativo'),
        supabase.from('appointments').select('id,appointment_date,status').gte('appointment_date', today).lte('appointment_date', future).neq('status', 'cancelado'),
        supabase.from('budgets').select('id,valid_until,status').in('status', ['enviado', 'aguardando']),
        supabase.from('financial_entries').select('id,due_date,status').eq('status', 'pendente').lt('due_date', today),
        supabase.from('financial_expenses').select('id,due_date,status').eq('status', 'pendente').lt('due_date', today),
        supabase.from('client_photo_folders').select('id').eq('authorization_status', 'revogada'),
        supabase.from('image_authorizations').select('id').eq('status', 'expirado'),
        supabase.from('image_authorizations').select('id').eq('status', 'revogado'),
        supabase.from('inventory_items').select('id,name,current_stock,min_stock,active').eq('active', true),
      ]);

      (clients.data ?? []).forEach((c: { id: string; birth_date: string | null }) => {
        if (!c.birth_date) return;
        const d = daysUntil(`${new Date().getFullYear()}-${c.birth_date.slice(5)}`);
        if (d === 0 && !dismissed.has(`bday-today-${c.id}`)) count++;
        else if (d > 0 && d <= advance && !dismissed.has(`bday-${c.id}`)) count++;
      });
      (appts.data ?? []).forEach((a: { id: string }) => { if (!dismissed.has(`appt-${a.id}`)) count++; });
      (budgets.data ?? []).forEach((b: { id: string; valid_until: string | null; status: string }) => {
        if (!b.valid_until) return;
        const d = daysUntil(b.valid_until);
        if (d >= 0 && d <= advance && !dismissed.has(`budget-exp-${b.id}`)) count++;
      });
      count += (receivables.data ?? []).filter((r: { id: string }) => !dismissed.has(`entry-overdue-${r.id}`) && !dismissed.has(`entry-${r.id}`)).length;
      count += (payables.data ?? []).filter((p: { id: string }) => !dismissed.has(`exp-overdue-${p.id}`) && !dismissed.has(`exp-${p.id}`)).length;
      count += (revokedFolders.data ?? []).filter((f: { id: string }) => !dismissed.has(`folder-revoked-${f.id}`)).length;
      count += (expiredAuths.data ?? []).filter((a: { id: string }) => !dismissed.has(`auth-expired-${a.id}`)).length;
      count += (revokedAuths.data ?? []).filter((a: { id: string }) => !dismissed.has(`auth-revoked-${a.id}`)).length;
      count += (lowStock.data ?? []).filter((item: { id: string; current_stock: number; min_stock: number }) => item.current_stock <= item.min_stock && !dismissed.has(`stock-low-${item.id}`)).length;

      setAlertCount(count);
    };
    if (settings.alerts_enabled !== false) loadAlertCount();
  }, [settings.alert_advance_days, settings.alerts_enabled]);

  return (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } flex-shrink-0 transition-all duration-300 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0`}
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-200 dark:border-slate-800 h-16">
        {settings.logo_url ? (
          <img src={settings.logo_url} alt={settings.studio_name || 'StudioPro'} className="h-10 w-10 flex-shrink-0 rounded-xl object-contain" />
        ) : (
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <CameraLogo className="h-5 w-5" />
          </div>
        )}
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {settings.studio_name || 'StudioPro'}
            </p>
            <p className="truncate text-xs text-slate-400">Sistema de Gestão</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navGroups.map((group) => {
          const hasTitle = group.title.length > 0;
          const isExpanded = !hasTitle || expandedGroups.has(group.title);
          const hasActive = group.items.some((item) => item.page === currentPage);
          const toggleGroup = () => {
            setExpandedGroups((prev) => {
              const next = new Set(prev);
              if (next.has(group.title)) next.delete(group.title);
              else next.add(group.title);
              return next;
            });
          };
          return (
            <div key={group.title || 'dashboard'}>
              {hasTitle && !collapsed && (
                <button
                  onClick={toggleGroup}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <span className="flex-1 text-left">{group.title}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                </button>
              )}
              {hasTitle && collapsed && <div className="h-px bg-slate-200 dark:bg-slate-700 mx-3 my-1" />}
              {isExpanded && group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.page;
                return (
                  <button
                    key={item.page}
                    onClick={() => onNavigate(item.page)}
                    title={item.label}
                    className={`relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    style={isActive ? { backgroundColor: 'var(--color-primary)' } : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {item.page === 'alerts' && alertCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{alertCount}</span>
                    )}
                    {item.page === 'alerts' && alertCount > 0 && collapsed && (
                      <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                    )}
                  </button>
                );
              })}
              {hasActive && hasTitle && !isExpanded && collapsed && (
                <span className="absolute" style={{ display: 'none' }} />
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-2 space-y-1">
        <button
          onClick={toggleTheme}
          title={settings.theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {settings.theme === 'dark' ? (
            collapsed ? <Sun className="h-4 w-4" /> : <><Sun className="h-4 w-4" /> Modo claro</>
          ) : (
            collapsed ? <Moon className="h-4 w-4" /> : <><Moon className="h-4 w-4" /> Modo escuro</>
          )}
        </button>
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /> Recolher</>}
        </button>
      </div>
    </aside>
  );
}

export function AppShell({
  currentPage,
  onNavigate,
  children,
}: {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <main className="flex-1 min-w-0 overflow-x-auto">
        <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="mx-auto max-w-7xl">
            <GlobalSearch onNavigate={onNavigate} />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
