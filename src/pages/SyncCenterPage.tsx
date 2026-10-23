import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { Cloud, CloudOff, CircleCheck as CheckCircle, Clock, CircleAlert as AlertCircle, RefreshCw, ExternalLink, FolderOpen } from 'lucide-react';
import type { DocumentSyncLog } from '@/lib/types';
import {
  isGDriveAvailable,
  getGDriveStatus,
  getGDriveRootUrl,
  updateSyncLogStatus,
} from '@/lib/googleDrive';
import { nativePathExists } from '@/lib/nativeFile';
import { formatDate } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  synced: { label: 'Enviado', color: 'badge-success', icon: CheckCircle },
  pending: { label: 'Pendente', color: 'badge-warning', icon: Clock },
  failed: { label: 'Falha', color: 'badge-danger', icon: AlertCircle },
  retry: { label: 'Aguardando nova tentativa', color: 'badge-warning', icon: RefreshCw },
};

export function SyncCenterPage() {
  const { settings, save } = useSettings();
  const [logs, setLogs] = useState<DocumentSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [driveStatus, setDriveStatus] = useState<{ connected: boolean; email?: string }>({ connected: false });
  const [rootUrl, setRootUrl] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('document_sync_log').select('*').order('created_at', { ascending: false });
    setLogs((data as DocumentSyncLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (isGDriveAvailable()) {
      getGDriveStatus().then(setDriveStatus);
      getGDriveRootUrl().then((res) => { if (res.success && res.url) setRootUrl(res.url); });
    }
  }, [load]);

  const filtered = filter ? logs.filter((l) => l.status === filter) : logs;
  const counts = {
    synced: logs.filter((l) => l.status === 'synced').length,
    pending: logs.filter((l) => l.status === 'pending').length,
    failed: logs.filter((l) => l.status === 'failed').length,
    retry: logs.filter((l) => l.status === 'retry').length,
  };

  const retryFailed = async () => {
    const failed = logs.filter((l) => l.status === 'failed' || l.status === 'retry');
    if (failed.length === 0) { toast('Nenhum documento com falha para reenviar', 'info'); return; }
    if (!isGDriveAvailable()) { toast('A sincronização está disponível apenas no aplicativo desktop', 'warning'); return; }
    setRetrying(true);
    toast(`Marcando ${failed.length} documento(s) para reenvio...`, 'info');
    let ok = 0;
    let fail = 0;
    for (const log of failed) {
      if (log.attachment_id) {
        const { data: att } = await supabase.from('client_attachments').select('file_path, name').eq('id', log.attachment_id).maybeSingle();
        if (att) {
          const filePath = (att as { file_path: string }).file_path;
          if (await nativePathExists(filePath)) {
            ok++;
            await updateSyncLogStatus(log.id, 'pending');
            continue;
          }
        }
      }
      fail++;
      await updateSyncLogStatus(log.id, 'pending');
    }
    load();
    setRetrying(false);
    if (ok > 0) {
      toast(`${ok} documento(s) marcados como pendente. O próximo salvamento reenviará. ${fail} sem arquivo local.`, 'success');
    } else {
      toast(`${failed.length} documento(s) marcados como pendente. Serão reenviados na próxima sincronização.`, 'info');
    }
  };

  return (
    <div>
      <PageHeader
        title="Central de sincronização"
        subtitle="Sincronização de documentos com Google Drive"
      />

      {/* Connection status */}
      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            {driveStatus.connected ? (
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Cloud className="h-5 w-5 text-emerald-600" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <CloudOff className="h-5 w-5 text-slate-400" />
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {driveStatus.connected ? 'Google Drive conectado' : 'Google Drive não conectado'}
              </p>
              {driveStatus.email && (
                <p className="text-sm text-slate-400">{driveStatus.email}</p>
              )}
              {!isGDriveAvailable() && (
                <p className="text-sm text-amber-600">A sincronização com Google Drive está disponível apenas no aplicativo desktop.</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {driveStatus.connected && rootUrl && (
              <button onClick={() => window.open(rootUrl, '_blank')} className="btn-secondary text-sm">
                <ExternalLink className="h-4 w-4" /> Abrir pasta no Drive
              </button>
            )}
          </div>
        </div>

        {driveStatus.connected && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.gdrive_auto_sync}
                onChange={(e) => { save({ gdrive_auto_sync: e.target.checked }); }}
                className="h-5 w-5 rounded accent-teal-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Enviar documentos automaticamente ao Google Drive após salvar
              </span>
            </label>
            {settings.gdrive_last_sync && (
              <p className="text-xs text-slate-400 mt-2">
                Último envio confirmado: {formatDate(settings.gdrive_last_sync)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{counts.synced}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Enviados</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{counts.pending}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Pendentes</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{counts.failed}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Com falha</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-amber-500" />
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{counts.retry}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Aguardando nova tentativa</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <select className="input sm:w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(counts.failed > 0 || counts.retry > 0) && (
          <button onClick={retryFailed} disabled={retrying} className="btn-secondary text-sm">
            <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} /> Tentar reenviar falhas
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Cloud className="h-12 w-12" />}
          title="Nenhum documento na fila de sincronização"
          description="Documentos gerados e salvos aparecerão aqui para sincronização com o Google Drive."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Arquivo</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Cliente</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Categoria</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Data</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((log) => {
                const sc = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.pending;
                const StatusIcon = sc.icon;
                return (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">{log.file_name}</p>
                      {log.error_message && <p className="text-xs text-red-500 mt-1 truncate max-w-[200px]">{log.error_message}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{log.client_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{log.category}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${sc.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />{sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                      {log.synced_at ? formatDate(log.synced_at) : formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {log.status === 'synced' && log.drive_url && (
                          <button onClick={() => window.open(log.drive_url!, '_blank')} className="btn-ghost text-xs" title="Abrir no Drive">
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        )}
                        {(log.status === 'failed' || log.status === 'retry') && (
                          <button onClick={() => window.open(rootUrl ?? '', '_blank')} className="btn-ghost text-xs" title="Abrir pasta">
                            <FolderOpen className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">
        A sincronização de documentos é separada do backup do banco de dados. Desconectar o Google Drive não apaga arquivos já enviados.
      </p>
    </div>
  );
}
