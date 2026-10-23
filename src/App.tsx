import { useState, useEffect, Component, type ReactNode } from 'react';
import { SettingsProvider } from '@/context/SettingsContext';
import { AppShell, type Page } from '@/components/Sidebar';
import { useToastHandler } from '@/components/Toast';
import { ToastContainer } from '@/components/ToastContainer';
import { DashboardPage } from '@/pages/DashboardPage';
import { ClientsPage } from '@/pages/ClientsPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { AgendaPage } from '@/pages/AgendaPage';
import { CashPage } from '@/pages/CashPage';
import { FinancialPage } from '@/pages/FinancialPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { AuthorizationsPage } from '@/pages/AuthorizationsPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { BackupPage } from '@/pages/BackupPage';
import { SuppliersPage } from '@/pages/SuppliersPage';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { CommissionsPage } from '@/pages/CommissionsPage';
import { ResourcesPage } from '@/pages/ResourcesPage';
import { ProfessionalsPage } from '@/pages/ProfessionalsPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { CrmPage } from '@/pages/CrmPage';
import { SyncCenterPage } from '@/pages/SyncCenterPage';
import { AppointmentPopup } from '@/components/AppointmentPopup';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ocorreu um erro inesperado</h2>
          <p className="text-sm text-slate-500">Recarregue a página para continuar. Se o problema persistir, verifique sua conexão com a internet.</p>
          <button onClick={() => window.location.reload()} className="btn-primary">Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [page, setPage] = useState<Page>('dashboard');
  const [pendingClientId, setPendingClientId] = useState<string | null>(null);
  const [pendingAuthId, setPendingAuthId] = useState<string | null>(null);
  const { toasts, dismiss } = useToastHandler();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss(toasts[toasts.length - 1]?.id ?? '');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toasts, dismiss]);

  const navigateToAuthorizations = () => setPage('authorizations');

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage onNavigate={setPage} />;
      case 'clients': return <ClientsPage onNavigate={setPage} onCreateAuthorization={(clientId) => { setPendingClientId(clientId); navigateToAuthorizations(); }} onViewAuthorization={(authId) => { setPendingAuthId(authId); navigateToAuthorizations(); }} />;
      case 'services': return <ServicesPage />;
      case 'budgets': return <BudgetsPage />;
      case 'orders': return <OrdersPage />;
      case 'agenda': return <AgendaPage />;
      case 'cash': return <CashPage />;
      case 'financial': return <FinancialPage />;
      case 'documents': return <DocumentsPage onNavigate={setPage} />;
      case 'authorizations': return <AuthorizationsPage preselectClientId={pendingClientId} preselectAuthId={pendingAuthId} onConsumedPreselect={() => { setPendingClientId(null); setPendingAuthId(null); }} />;
      case 'alerts': return <AlertsPage />;
      case 'settings': return <SettingsPage />;
      case 'sync': return <SyncCenterPage />;
      case 'backup': return <BackupPage />;
      case 'suppliers': return <SuppliersPage />;
      case 'campaigns': return <CampaignsPage />;
      case 'commissions': return <CommissionsPage />;
      case 'professionals': return <ProfessionalsPage />;
      case 'inventory': return <InventoryPage />;
      case 'resources': return <ResourcesPage />;
      case 'crm': return <CrmPage onNavigate={setPage} />;
      default: return <DashboardPage onNavigate={setPage} />;
    }
  };

  return (
    <>
      <AppShell currentPage={page} onNavigate={setPage}>
        {renderPage()}
      </AppShell>
      <AppointmentPopup onNavigate={setPage} />
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </ErrorBoundary>
  );
}
