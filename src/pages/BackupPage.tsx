import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { formatDateTime, todayISO } from '@/lib/utils';
import {
  HardDrive,
  Download,
  Upload,
  Database,
  FileText,
  TriangleAlert as AlertTriangle,
  Activity,
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  CheckCircle,
  XCircle,
  RefreshCw,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react';
import type { ActivityLog } from '@/lib/types';
import { isGDriveAvailable, getGDriveStatus } from '@/lib/googleDrive';

const BACKUP_TABLES = [
  'settings', 'clients', 'client_attachments', 'client_photo_folders',
  'client_history', 'services', 'service_categories', 'budgets', 'budget_items',
  'appointments', 'waitlist', 'cash_registers', 'cash_transactions',
  'financial_entries', 'financial_expenses', 'monthly_closings',
  'message_templates', 'document_templates', 'activity_log',
  'image_authorizations', 'image_authorization_history', 'alert_dismissals',
  'suppliers', 'inventory_items', 'inventory_movements', 'order_material_consumption',
  'service_orders', 'order_items', 'production_steps', 'production_step_history',
  'order_checklists', 'checklist_templates', 'checklist_template_items',
  'campaigns', 'commissions', 'commission_rules', 'professionals', 'rooms',
  'equipment', 'equipment_loans', 'equipment_maintenance',
  'crm_tasks', 'sales_funnel', 'post_sale_feedback',
  'document_sync_log', 'cash_audit_logs',
];

const RESTORE_ALLOWED = new Set(BACKUP_TABLES);

interface RestoreSummary {
  tables: { name: string; rowCount: number; success: boolean; error?: string }[];
  totalRecords: number;
  successCount: number;
  failCount: number;
  exportDate: string;
  version: string;
  tableCount: number;
}

interface Diagnostics {
  supabaseOk: boolean;
  supabaseError?: string;
  gdriveConnected: boolean;
  gdriveEmail?: string;
  appVersion: string;
  lastBackup?: string;
  lastSync?: string;
  recentErrors: ActivityLog[];
}

export function BackupPage() {
  const { settings } = useSettings();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ name: string; data: Record<string, unknown> } | null>(null);
  const [preRestoreBackup, setPreRestoreBackup] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20);
    setLogs((data as ActivityLog[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); runDiagnostics(); }, []);

  const exportData = async () => {
    setExporting(true);
    try {
      const exportObj: Record<string, unknown> = {
        _exportDate: new Date().toISOString(),
        _version: '2.0',
        _tables: BACKUP_TABLES,
      };
      for (const t of BACKUP_TABLES) {
        const { data, error } = await supabase.from(t).select('*');
        if (error) {
          console.error(`Erro ao exportar ${t}:`, error.message);
          exportObj[t] = [];
        } else {
          exportObj[t] = data ?? [];
        }
      }
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_estudio_${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await supabase.from('activity_log').insert({
        action: 'backup',
        entity: 'sistema',
        description: `Backup/exportação de dados realizado em ${formatDateTime(new Date().toISOString())} (${BACKUP_TABLES.length} tabelas)`,
      });
      toast('Backup exportado com sucesso', 'success');
      load();
    } catch {
      toast('Erro ao exportar backup', 'error');
    }
    setExporting(false);
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    setRestoring(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data._version || !data._exportDate) {
        toast('Arquivo de backup inválido: formato não reconhecido', 'error');
        setRestoring(false);
        return;
      }
      const tables = Object.keys(data).filter((k) => !k.startsWith('_'));
      const unknownTables = tables.filter((t) => !RESTORE_ALLOWED.has(t));
      if (unknownTables.length > 0) {
        toast(`Arquivo contém tabelas desconhecidas: ${unknownTables.join(', ')}`, 'warning');
      }
      const summary: RestoreSummary = {
        tables: tables.map((name) => ({
          name,
          rowCount: Array.isArray(data[name]) ? (data[name] as unknown[]).length : 0,
          success: false,
        })),
        totalRecords: 0,
        successCount: 0,
        failCount: 0,
        exportDate: data._exportDate as string,
        version: data._version as string,
        tableCount: tables.length,
      };
      summary.totalRecords = summary.tables.reduce((s, t) => s + t.rowCount, 0);
      setPendingFile({ name: file.name, data });
      setRestoreSummary(summary);
    } catch {
      toast('Erro ao ler o arquivo de backup: arquivo corrompido ou formato inválido', 'error');
    }
    setRestoring(false);
  };

  const executeRestore = async () => {
    if (!pendingFile) return;
    setRestoreConfirm(false);
    setRestoring(true);
    setPreRestoreBackup(true);
    try {
      if (preRestoreBackup) {
        const safetyObj: Record<string, unknown> = {
          _exportDate: new Date().toISOString(),
          _version: '2.0',
          _tables: BACKUP_TABLES,
          _safetyBackup: true,
        };
        for (const t of BACKUP_TABLES) {
          const { data } = await supabase.from(t).select('*');
          safetyObj[t] = data ?? [];
        }
        const blob = new Blob([JSON.stringify(safetyObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_pre_restauracao_${todayISO()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Backup de segurança criado antes da restauração', 'info');
      }

      const { data, name } = pendingFile;
      const results: RestoreSummary = {
        tables: [],
        totalRecords: 0,
        successCount: 0,
        failCount: 0,
        exportDate: data._exportDate as string,
        version: data._version as string,
        tableCount: 0,
      };

      const tableNames = Object.keys(data).filter((k) => !k.startsWith('_') && RESTORE_ALLOWED.has(k));
      results.tableCount = tableNames.length;

      for (const table of tableNames) {
        const rows = data[table];
        if (!Array.isArray(rows) || rows.length === 0) {
          results.tables.push({ name: table, rowCount: 0, success: true });
          continue;
        }
        results.totalRecords += rows.length;
        const { error } = await supabase.from(table).upsert(rows as Record<string, unknown>[], { onConflict: 'id' });
        if (error) {
          results.tables.push({ name: table, rowCount: rows.length, success: false, error: error.message });
          results.failCount++;
        } else {
          results.tables.push({ name: table, rowCount: rows.length, success: true });
          results.successCount++;
        }
      }

      await supabase.from('activity_log').insert({
        action: 'restore',
        entity: 'sistema',
        description: `Restauração de backup: ${name} — ${results.successCount}/${results.tableCount} tabelas OK, ${results.failCount} com falha`,
      });

      if (results.failCount === 0) {
        toast(`Restauração concluída: ${results.successCount} tabelas importadas`, 'success');
      } else if (results.successCount > 0) {
        toast(`Restauração parcial: ${results.successCount} tabelas OK, ${results.failCount} com falha`, 'warning');
      } else {
        toast('Restauração falhou: nenhuma tabela foi importada', 'error');
      }
      setRestoreSummary(results);
      setPendingFile(null);
      setPreRestoreBackup(false);
      load();
    } catch {
      toast('Erro durante a restauração', 'error');
    }
    setRestoring(false);
  };

  const runDiagnostics = async () => {
    setDiagLoading(true);
    const version = '1.0.0';

    let supabaseOk = false;
    let supabaseError: string | undefined;
    try {
      const { error } = await supabase.from('settings').select('id').limit(1).maybeSingle();
      supabaseOk = !error;
      if (error) supabaseError = error.message;
    } catch (e) {
      supabaseError = String(e);
    }

    let gdriveConnected = false;
    let gdriveEmail: string | undefined;
    if (isGDriveAvailable()) {
      try {
        const status = await getGDriveStatus();
        gdriveConnected = status.connected;
        gdriveEmail = status.email;
      } catch { /* ignore */ }
    }

    let lastBackup: string | undefined;
    let lastSync: string | undefined;
    try {
      const { data: logData } = await supabase.from('activity_log')
        .select('*')
        .in('action', ['backup', 'restore'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (logData && logData.length > 0) lastBackup = (logData[0] as ActivityLog).created_at;
    } catch { /* ignore */ }
    lastSync = settings.gdrive_last_sync ?? undefined;

    const { data: errorData } = await supabase.from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    const recentErrors = ((errorData as ActivityLog[]) ?? []).filter(
      (l) => l.action === 'restore' && l.description.includes('falha'),
    );

    setDiag({
      supabaseOk,
      supabaseError,
      gdriveConnected,
      gdriveEmail,
      appVersion: version,
      lastBackup,
      lastSync,
      recentErrors,
    });
    setDiagLoading(false);
  };

  const generateTechReport = () => {
    if (!diag) return;
    const report = {
      generatedAt: new Date().toISOString(),
      appVersion: diag.appVersion,
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      supabase: { connected: diag.supabaseOk, error: diag.supabaseError ?? null },
      googleDrive: { connected: diag.gdriveConnected, email: diag.gdriveEmail ?? null },
      lastBackup: diag.lastBackup ?? null,
      lastSync: diag.lastSync ?? null,
      recentErrors: diag.recentErrors.map((e) => ({ action: e.action, description: e.description, created_at: e.created_at })),
      settings: {
        studio_name: settings.studio_name,
        theme: settings.theme,
        alerts_enabled: settings.alerts_enabled,
        gdrive_auto_sync: settings.gdrive_auto_sync,
        cash_security_enabled: settings.cash_security_enabled,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostico_${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Relatório técnico gerado (sem senhas ou dados pessoais)', 'success');
  };

  return (
    <div>
      <PageHeader title="Backup e restauração" subtitle="Proteja os dados do seu estúdio" />

      {/* Backup types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* JSON Export */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <Download className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Exportação de dados (JSON)</h3>
              <p className="text-sm text-slate-400">Exporta todos os registros do sistema</p>
            </div>
          </div>
          <div className="card p-3 bg-slate-50 dark:bg-slate-800/50 mb-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong className="text-slate-700 dark:text-slate-300">O que está incluído:</strong> clientes, serviços, orçamentos, pedidos, agenda, caixa, financeiro, comissões, campanhas, fornecedores, estoque, profissionais, salas, equipamentos, CRM, autorizações, configurações e modelos — {BACKUP_TABLES.length} tabelas no total.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              <strong>Não inclui:</strong> fotografias, documentos PDF ou arquivos locais referenciados em pastas externas.
            </p>
          </div>
          {settings.backup_folder && (
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/50 mb-4">
              <p className="text-xs text-slate-400">Pasta de backup configurada:</p>
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all">{settings.backup_folder}</p>
            </div>
          )}
          <button onClick={exportData} disabled={exporting} className="btn-primary w-full justify-center">
            <Download className="h-4 w-4" /> {exporting ? 'Exportando...' : 'Exportar backup agora'}
          </button>
        </div>

        {/* Restore */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
              <Upload className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Restauração</h3>
              <p className="text-sm text-slate-400">Importa dados de um backup anterior</p>
            </div>
          </div>
          <div className="card p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                A restauração mescla os dados do arquivo com os dados atuais (preservando registros existentes e adicionando novos). Recomendamos fazer um backup dos dados atuais antes de restaurar.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={preRestoreBackup}
              onChange={(e) => setPreRestoreBackup(e.target.checked)}
              className="h-4 w-4 rounded accent-teal-600"
            />
            Criar backup de segurança antes de restaurar
          </label>
          <label className="btn-secondary w-full justify-center cursor-pointer">
            <Upload className="h-4 w-4" /> {restoring ? 'Lendo arquivo...' : 'Selecionar arquivo de backup'}
            <input type="file" accept=".json" className="hidden" onChange={handleFileSelected} disabled={restoring} ref={fileRef} />
          </label>
        </div>
      </div>

      {/* Restore summary */}
      {restoreSummary && (
        <div className="card p-6 mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Resumo da restauração
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{restoreSummary.successCount}</p>
              <p className="text-xs text-slate-400">Tabelas OK</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500">{restoreSummary.failCount}</p>
              <p className="text-xs text-slate-400">Tabelas com falha</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{restoreSummary.totalRecords}</p>
              <p className="text-xs text-slate-400">Registros processados</p>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {restoreSummary.tables.map((t) => (
              <div key={t.name} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-mono text-xs">{t.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{t.rowCount} registros</span>
                  {t.success ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
          {restoreSummary.exportDate && (
            <p className="text-xs text-slate-400 mt-3">
              Backup original: {formatDateTime(restoreSummary.exportDate)} (versão {restoreSummary.version})
            </p>
          )}
        </div>
      )}

      {/* Restore confirmation dialog */}
      <ConfirmDialog
        open={restoreConfirm}
        title="Confirmar restauração"
        message={`O arquivo ${pendingFile?.name ?? ''} contém ${restoreSummary?.tableCount ?? 0} tabelas e ${restoreSummary?.totalRecords ?? 0} registros. Os dados serão mesclados com os atuais. Deseja continuar?`}
        confirmLabel="Restaurar agora"
        cancelLabel="Cancelar"
        onConfirm={executeRestore}
        onCancel={() => { setRestoreConfirm(false); setPendingFile(null); }}
      />

      {/* Auto-detect: if we have a pending file with summary, show confirm button */}
      {pendingFile && restoreSummary && !restoreConfirm && !restoring && (
        <div className="card p-6 mb-6 border-2 border-sky-200 dark:border-sky-800">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">Arquivo: {pendingFile.name}</p>
              <p className="text-sm text-slate-400">
                {restoreSummary.tableCount} tabelas · {restoreSummary.totalRecords} registros · versão {restoreSummary.version}
              </p>
              <p className="text-xs text-slate-400 mt-1">Backup original: {formatDateTime(restoreSummary.exportDate)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPendingFile(null); setRestoreSummary(null); }} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={() => setRestoreConfirm(true)} className="btn-primary">
                <Upload className="h-4 w-4" /> Confirmar restauração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About storage */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <Database className="h-5 w-5 text-slate-500" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Sobre o armazenamento</h3>
        </div>
        <div className="space-y-3 text-sm text-slate-500 dark:text-slate-400">
          <div className="flex items-start gap-2">
            <Database className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <p><strong className="text-slate-700 dark:text-slate-300">Dados do sistema:</strong> armazenados no banco de dados na nuvem, permanecem disponíveis após fechar e reabrir o aplicativo.</p>
          </div>
          <div className="flex items-start gap-2">
            <HardDrive className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <p><strong className="text-slate-700 dark:text-slate-300">Arquivos locais:</strong> fotografias e documentos referenciados em pastas externas não são copiados no backup JSON — precisam ser protegidos pelo Windows.</p>
          </div>
          <div className="flex items-start gap-2">
            <Cloud className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <p><strong className="text-slate-700 dark:text-slate-300">Google Drive:</strong> documentos PDF enviados pela sincronização ficam armazenados no Google Drive e não são incluídos no backup JSON.</p>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <p><strong className="text-slate-700 dark:text-slate-300">Proteção de dados:</strong> atualizar ou reinstalar o aplicativo nunca apaga clientes, pedidos, pagamentos ou históricos. O banco de dados é preservado.</p>
          </div>
        </div>
      </div>

      {/* Technical diagnostics */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Activity className="h-5 w-5 text-slate-500" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Diagnóstico técnico</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={runDiagnostics} disabled={diagLoading} className="btn-secondary text-sm">
              <RefreshCw className={`h-4 w-4 ${diagLoading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <button onClick={generateTechReport} disabled={!diag} className="btn-secondary text-sm">
              <FileText className="h-4 w-4" /> Gerar relatório
            </button>
          </div>
        </div>

        {diag ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              {diag.supabaseOk ? <Wifi className="h-5 w-5 text-emerald-500" /> : <WifiOff className="h-5 w-5 text-red-500" />}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Supabase</p>
                <p className="text-xs text-slate-400">{diag.supabaseOk ? 'Conectado' : 'Sem conexão'}</p>
                {diag.supabaseError && <p className="text-xs text-red-400 truncate max-w-[180px]">{diag.supabaseError}</p>}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              {diag.gdriveConnected ? <Cloud className="h-5 w-5 text-emerald-500" /> : <CloudOff className="h-5 w-5 text-slate-400" />}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Google Drive</p>
                <p className="text-xs text-slate-400">{diag.gdriveConnected ? (diag.gdriveEmail ?? 'Conectado') : 'Não conectado'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <HardDrive className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Versão instalada</p>
                <p className="text-xs text-slate-400">{diag.appVersion}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <Download className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Último backup</p>
                <p className="text-xs text-slate-400">{diag.lastBackup ? formatDateTime(diag.lastBackup) : 'Nunca'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <Cloud className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Última sincronização</p>
                <p className="text-xs text-slate-400">{diag.lastSync ? formatDateTime(diag.lastSync) : 'Nunca'}</p>
              </div>
            </div>

            {diag.recentErrors.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">Erros recentes</p>
                <div className="space-y-1">
                  {diag.recentErrors.map((e) => (
                    <p key={e.id} className="text-xs text-red-600 dark:text-red-400">{e.description} — {formatDateTime(e.created_at)}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-slate-400 text-center py-6">{diagLoading ? 'Carregando diagnóstico...' : 'Clique em "Atualizar" para verificar.'}</p>
        )}
      </div>

      {/* Operation history */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" /> Histórico de operações
        </h3>
        {loading ? (
          <p className="text-slate-400 text-center py-6">Carregando...</p>
        ) : logs.length === 0 ? (
          <p className="text-slate-400 text-center py-6">Nenhuma operação registrada.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="flex items-start gap-3 text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                <HardDrive className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-slate-700 dark:text-slate-300">{l.description}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(l.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
