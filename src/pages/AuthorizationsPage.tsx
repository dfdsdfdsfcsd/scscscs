import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatDate, toLocalISODate } from '@/lib/utils';
import {
  generateAuthorizationDocument,
  emptyAuthorizationForm,
  PURPOSE_LABELS,
  MATERIAL_LABELS,
  EDITING_LABELS,
} from '@/lib/authorizationDoc';
import { buildPrintHTML, openPrintWindow } from '@/lib/printUtils';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { generateDocumentPDF, downloadPDF, uploadDocumentToStorage } from '@/lib/pdfUtils';
import { uploadToGDrive, createSyncLogEntry, buildStandardFileName, SYNC_CATEGORIES, isGDriveAvailable } from '@/lib/googleDrive';
import { Plus, Search, Trash2, FileText, Eye, Printer, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Clock, Circle as XCircle, ShieldCheck, Download, FileCheck } from 'lucide-react';
import type { ImageAuthorization, ImageAuthorizationHistory, Client, ClientPhotoFolder, ClientAttachment } from '@/lib/types';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Section = 'list' | 'form' | 'preview';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  rascunho: { label: 'Rascunho', color: 'badge-neutral', icon: FileText },
  aguardando_assinatura: { label: 'Aguardando assinatura', color: 'badge-warning', icon: Clock },
  autorizado: { label: 'Autorizado', color: 'badge-success', icon: CheckCircle },
  recusado: { label: 'Recusado', color: 'badge-danger', icon: XCircle },
  revogado: { label: 'Revogado', color: 'badge-danger', icon: XCircle },
  expirado: { label: 'Expirado', color: 'badge-danger', icon: AlertTriangle },
  substituido: { label: 'Substituído', color: 'badge-neutral', icon: FileText },
};

interface AuthorizationsPageProps {
  preselectClientId?: string | null;
  preselectAuthId?: string | null;
  onConsumedPreselect?: () => void;
}

export function AuthorizationsPage({ preselectClientId, preselectAuthId, onConsumedPreselect }: AuthorizationsPageProps = {}) {
  const { settings } = useSettings();
  const [authorizations, setAuthorizations] = useState<ImageAuthorization[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [folders, setFolders] = useState<ClientPhotoFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [section, setSection] = useState<Section>('list');
  const [editing, setEditing] = useState<ImageAuthorization | null>(null);
  const [form, setForm] = useState<Partial<ImageAuthorization>>({});
  const [previewText, setPreviewText] = useState('');
  const [history, setHistory] = useState<ImageAuthorizationHistory[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ImageAuthorization | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [guardianSignatureData, setGuardianSignatureData] = useState<string | null>(null);
  const [studioSignatureData, setStudioSignatureData] = useState<string | null>(null);
  const [savedAttachments, setSavedAttachments] = useState<ClientAttachment[]>([]);
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const guardianSigRef = useRef<SignaturePadHandle>(null);
  const studioSigRef = useRef<SignaturePadHandle>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('image_authorizations')
      .select('*')
      .order('created_at', { ascending: false });
    setAuthorizations((data as ImageAuthorization[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.from('clients').select('*').eq('status', 'ativo').order('full_name').then(({ data }) => setClients((data as Client[]) ?? []));
    supabase.from('client_photo_folders').select('*').order('created_at', { ascending: false }).then(({ data }) => setFolders((data as ClientPhotoFolder[]) ?? []));
  }, [load]);

  useEffect(() => {
    if (!preselectClientId && !preselectAuthId) return;
    if (loading) return;
    if (preselectAuthId) {
      const auth = authorizations.find((a) => a.id === preselectAuthId);
      if (auth) { openPreview(auth); onConsumedPreselect?.(); return; }
    }
    if (preselectClientId) {
      setEditing(null);
      setForm({ ...emptyAuthorizationForm(preselectClientId), start_date: toLocalISODate(new Date()) });
      setSection('form');
      onConsumedPreselect?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectClientId, preselectAuthId, loading, authorizations]);

  const filtered = authorizations.filter((a) => {
    const client = clients.find((c) => c.id === a.client_id);
    const matchesSearch = !search ||
      (client?.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.doc_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.authorizer_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || a.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyAuthorizationForm(''), start_date: toLocalISODate(new Date()) });
    setSection('form');
  };

  const openEdit = (a: ImageAuthorization) => {
    setEditing(a);
    setForm(a);
    setSection('form');
  };

  const openPreview = async (a: ImageAuthorization) => {
    setEditing(a);
    setForm(a);
    setPreviewText(generateAuthorizationDocument(a, settings));
    setSignatureData(null);
    setGuardianSignatureData(null);
    setStudioSignatureData(null);
    const { data } = await supabase
      .from('image_authorization_history')
      .select('*')
      .eq('authorization_id', a.id)
      .order('created_at', { ascending: false });
    setHistory((data as ImageAuthorizationHistory[]) ?? []);
    const { data: atts } = await supabase.from('client_attachments').select('*').eq('client_id', a.client_id).eq('file_type', 'AUTORIZACAO').order('attached_at', { ascending: false });
    setSavedAttachments((atts as ClientAttachment[]) ?? []);
    setSection('preview');
  };

  const addHistory = async (authId: string, action: string, prevStatus: string | null, newStatus: string | null) => {
    await supabase.from('image_authorization_history').insert({
      authorization_id: authId,
      action,
      previous_status: prevStatus,
      new_status: newStatus,
    });
  };

  const handleSave = async (gotoPreview = false) => {
    if (!form.client_id) { toast('Selecione um cliente', 'warning'); return; }
    if (!form.authorizer_name) { toast('Informe o nome da pessoa autorizante', 'warning'); return; }
    const client = clients.find((c) => c.id === form.client_id);
    const docNumber = editing?.doc_number ?? `AUT-${String(authorizations.length + 1).padStart(4, '0')}`;
    const formData = { ...form, doc_number: docNumber };

    if (editing) {
      const { error } = await supabase.from('image_authorizations').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast('Erro ao salvar autorização', 'error'); return; }
      await addHistory(editing.id, 'Autorização alterada', editing.status, formData.status ?? null);
      toast('Autorização salva', 'success');
      if (gotoPreview) {
        const updated = { ...editing, ...formData } as ImageAuthorization;
        setPreviewText(generateAuthorizationDocument(updated, settings));
        setSection('preview');
      } else {
        setSection('list');
      }
    } else {
      const { data, error } = await supabase.from('image_authorizations').insert(formData).select('*').maybeSingle();
      if (error) { toast('Erro ao criar autorização', 'error'); return; }
      if (data) {
        await addHistory((data as ImageAuthorization).id, 'Autorização criada', null, 'rascunho');
        await supabase.from('client_history').insert({ client_id: form.client_id, event_type: 'autorizacao', description: `Termo de autorização de uso de imagem criado (${docNumber})` });
      }
      toast('Autorização criada', 'success');
      if (gotoPreview) {
        openPreview(data as ImageAuthorization);
      } else {
        setSection('list');
      }
    }
    load();
  };

  const changeStatus = async (a: ImageAuthorization, newStatus: string) => {
    if (newStatus === 'substituido') return;
    const { error } = await supabase.from('image_authorizations').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', a.id);
    if (error) { toast('Erro ao alterar status', 'error'); return; }
    await addHistory(a.id, `Status alterado para: ${STATUS_CONFIG[newStatus]?.label ?? newStatus}`, a.status, newStatus);

    if (newStatus === 'revogado') {
      await supabase.from('client_history').insert({ client_id: a.client_id, event_type: 'alerta', description: `ALERTA: Autorização de uso de imagem revogada (${a.doc_number}). Revise o uso futuro das imagens.` });
      if (a.photo_folder_id) {
        await supabase.from('client_photo_folders').update({ authorization_status: 'revogada', updated_at: new Date().toISOString() }).eq('id', a.photo_folder_id);
      }
      toast('Autorização revogada. Alerta registrado.', 'warning');
    } else {
      toast('Status atualizado', 'success');
    }
    if (a.photo_folder_id && (newStatus === 'autorizado' || newStatus === 'expirado')) {
      const folderStatus = newStatus === 'autorizado' ? 'autorizada' : 'expirada';
      await supabase.from('client_photo_folders').update({ authorization_status: folderStatus, updated_at: new Date().toISOString() }).eq('id', a.photo_folder_id);
    }
    load();
    if (section === 'preview' && editing?.id === a.id) {
      const updated = { ...a, status: newStatus };
      setEditing(updated);
      setForm(updated);
      setPreviewText(generateAuthorizationDocument(updated, settings));
    }
  };

  const createNewVersion = async (a: ImageAuthorization) => {
    const { id, created_at, updated_at, ...rest } = a;
    void id; void created_at; void updated_at;
    const newVersion = a.version + 1;
    const { data, error } = await supabase.from('image_authorizations').insert({
      ...rest,
      version: newVersion,
      status: 'rascunho',
      doc_number: a.doc_number,
    }).select('*').maybeSingle();
    if (error) { toast('Erro ao criar nova versão', 'error'); return; }
    await supabase.from('image_authorizations').update({ status: 'substituido', updated_at: new Date().toISOString() }).eq('id', a.id);
    await addHistory(a.id, 'Substituído por nova versão', a.status, 'substituido');
    if (data) await addHistory((data as ImageAuthorization).id, `Nova versão (v${newVersion}) criada`, null, 'rascunho');
    toast(`Nova versão v${newVersion} criada. Versão anterior marcada como substituída.`, 'success');
    load();
    openEdit(data as ImageAuthorization);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('image_authorizations').delete().eq('id', deleteTarget.id);
    toast('Autorização excluída', 'success');
    setDeleteTarget(null);
    setSection('list');
    load();
  };

  const printDocument = () => {
    const printArea = document.getElementById('printable-doc');
    if (!printArea) { window.print(); return; }
    const bodyContent = `<div class="print-section"><pre class="print-body">${printArea.innerText}</pre></div>`;
    const html = buildPrintHTML(`Autorização de Uso de Imagem`, bodyContent, settings);
    openPrintWindow(html);
  };

  const generateAuthPDF = (withSignatures: boolean) => {
    if (!editing) return;
    const sigs: Array<{ label: string; dataUrl: string; name?: string }> = [];
    if (withSignatures) {
      if (signatureData) sigs.push({ label: 'Assinatura do autorizante', dataUrl: signatureData, name: editing.authorizer_name ?? '' });
      if (guardianSignatureData && editing.is_minor) sigs.push({ label: 'Assinatura do responsável legal', dataUrl: guardianSignatureData, name: editing.minor_legal_guardian_name ?? '' });
      if (studioSignatureData) sigs.push({ label: 'Representante do estúdio', dataUrl: studioSignatureData, name: editing.studio_representative ?? '' });
    }
    const blob = generateDocumentPDF({
      title: `Autorização de Uso de Imagem ${editing.doc_number ?? ''}`,
      body: previewText,
      settings,
      signatures: sigs,
    });
    const filename = `autorizacao_${editing.doc_number ?? ''}_v${editing.version}_${new Date().toISOString().slice(0, 10)}.pdf`;
    downloadPDF(blob, filename);
  };

  const saveAuthToClient = async () => {
    if (!editing) return;
    const sigs: Array<{ label: string; dataUrl: string; name?: string }> = [];
    if (signatureData) sigs.push({ label: 'Assinatura do autorizante', dataUrl: signatureData, name: editing.authorizer_name ?? '' });
    if (guardianSignatureData && editing.is_minor) sigs.push({ label: 'Assinatura do responsável legal', dataUrl: guardianSignatureData, name: editing.minor_legal_guardian_name ?? '' });
    if (studioSignatureData) sigs.push({ label: 'Representante do estúdio', dataUrl: studioSignatureData, name: editing.studio_representative ?? '' });
    const hasSig = sigs.length > 0;
    const blob = generateDocumentPDF({
      title: `Autorização de Uso de Imagem ${editing.doc_number ?? ''}`,
      body: previewText,
      settings,
      signatures: sigs,
    });
    const fileName = `autorizacao_${editing.doc_number ?? ''}_v${editing.version}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const storagePath = `documents/${editing.client_id}/${fileName}`;
    const uploaded = await uploadDocumentToStorage(SUPABASE_URL, 'documents', storagePath, blob);
    if (!uploaded) { toast('Erro ao salvar arquivo no armazenamento', 'error'); return; }
    await supabase.from('client_attachments').insert({
      client_id: editing.client_id,
      name: `Autorização de Uso de Imagem ${editing.doc_number} (v${editing.version})`,
      file_path: uploaded.publicUrl,
      file_type: 'AUTORIZACAO',
      mode: hasSig ? 'assinado' : 'gerado',
      observations: `${hasSig ? 'Documento assinado' : 'Documento gerado'} em ${new Date().toLocaleString('pt-BR')} · Status: ${STATUS_CONFIG[editing.status]?.label ?? editing.status}`,
    });
    if (hasSig) {
      const newStatus = editing.status === 'rascunho' ? 'aguardando_assinatura' : editing.status;
      await supabase.from('image_authorizations').update({
        authorizer_signature: signatureData ?? editing.authorizer_signature,
        guardian_signature: guardianSignatureData ?? editing.guardian_signature,
        signing_date: toLocalISODate(new Date()),
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      await addHistory(editing.id, 'Documento assinado digitalmente e salvo', editing.status, newStatus);
      await supabase.from('client_history').insert({ client_id: editing.client_id, event_type: 'autorizacao', description: `Termo de autorização ${editing.doc_number} (v${editing.version}) assinado digitalmente` });
    }
    toast(hasSig ? 'Documento assinado salvo no cadastro do cliente' : 'Documento salvo no cadastro do cliente', 'success');
    load();
    const { data: atts } = await supabase.from('client_attachments').select('*').eq('client_id', editing.client_id).eq('file_type', 'AUTORIZACAO').order('attached_at', { ascending: false });
    setSavedAttachments((atts as ClientAttachment[]) ?? []);

    if (settings.gdrive_auto_sync && isGDriveAvailable() && blob) {
      const clientName = clients.find((c) => c.id === editing.client_id)?.full_name ?? null;
      const category = SYNC_CATEGORIES.autorizacao;
      const year = new Date().getFullYear();
      const fileName = buildStandardFileName(new Date(), category, clientName, editing.doc_number);
      const attachmentId = (atts as ClientAttachment[])?.find((a) => a.file_type === 'AUTORIZACAO')?.id ?? null;
      const result = await uploadToGDrive(blob, fileName, category, year, clientName);
      if (result.success && !result.skipped) {
        await createSyncLogEntry(editing.client_id || null, attachmentId, fileName, category, clientName, year, 'synced', result.fileId ?? null, result.folderId ?? null, result.url ?? null);
        toast('Autorização enviada para o Google Drive', 'success');
      } else if (result.skipped) {
        await createSyncLogEntry(editing.client_id || null, attachmentId, fileName, category, clientName, year, 'synced', result.fileId ?? null, result.folderId ?? null, result.url ?? null);
        toast('Autorização já existe no Google Drive', 'info');
      } else {
        await createSyncLogEntry(editing.client_id || null, attachmentId, fileName, category, clientName, year, 'failed', null, null, null, result.error ?? 'Erro no upload');
        toast('Falha ao enviar autorização para o Google Drive', 'error');
      }
    }
  };

  const togglePurpose = (key: string) => {
    setForm((prev) => ({ ...prev, purposes: { ...(prev.purposes ?? {}), [key]: !prev.purposes?.[key] } }));
  };
  const toggleMaterial = (key: string) => {
    setForm((prev) => ({ ...prev, materials: { ...(prev.materials ?? {}), [key]: !prev.materials?.[key] } }));
  };
  const toggleEditing = (key: string) => {
    setForm((prev) => ({ ...prev, editing_permissions: { ...(prev.editing_permissions ?? {}), [key]: !prev.editing_permissions?.[key] } }));
  };

  const clientFolders = folders.filter((f) => f.client_id === form.client_id);

  const isExpired = (a: ImageAuthorization) => a.end_date && new Date(a.end_date) < new Date() && a.status === 'autorizado';
  const isRevoked = (a: ImageAuthorization) => a.status === 'revogado';

  return (
    <div>
      <PageHeader
        title="Autorizações de Uso de Imagem"
        subtitle={`${authorizations.length} autorização(ões) registrada(s) · Requer revisão jurídica antes da utilização`}
        actions={section === 'list' ? <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova autorização</button> : undefined}
      />

      {section === 'list' && (
        <>
          <div className="card p-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input className="input pl-10" placeholder="Pesquisar por cliente, documento ou autorizante..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="input sm:w-48" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Todos os status</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-400">Carregando...</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="h-12 w-12" />} title="Nenhuma autorização encontrada" description="Crie o primeiro termo de autorização de uso de imagem para seus clientes." action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Criar autorização</button>} />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Autorizante</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Vigência</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filtered.map((a) => {
                    const client = clients.find((c) => c.id === a.client_id);
                    const sc = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.rascunho;
                    const StatusIcon = sc.icon;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-slate-500">{a.doc_number}</p>
                          <p className="text-xs text-slate-400">v{a.version}</p>
                        </td>
                        <td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-slate-100">{client?.full_name ?? '—'}</p></td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{a.authorizer_name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{formatDate(a.start_date)} → {a.end_date ? formatDate(a.end_date) : 'indeterminado'}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${sc.color}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />{sc.label}
                          </span>
                          {isExpired(a) && <span className="badge badge-danger mt-1 block w-fit">Vencida</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openPreview(a)} className="btn-ghost" title="Visualizar documento"><Eye className="h-4 w-4" /></button>
                            <button onClick={() => openEdit(a)} className="btn-ghost" title="Editar"><FileText className="h-4 w-4" /></button>
                            <button onClick={() => setDeleteTarget(a)} className="btn-ghost text-red-500" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {section === 'form' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button onClick={() => setSection('list')} className="btn-secondary text-sm">← Voltar à lista</button>
            <div className="flex gap-2">
              <button onClick={() => handleSave(false)} className="btn-secondary">Salvar rascunho</button>
              <button onClick={() => handleSave(true)} className="btn-primary">Salvar e visualizar documento</button>
            </div>
          </div>

          <div className="card p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              Modelo inicial editável. <strong>Requer revisão jurídica</strong> antes da utilização como documento definitivo. Este documento não elimina todos os riscos legais.
            </p>
          </div>

          {/* Section 1: Parties */}
          <FormSection title="1. Identificação das partes">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Cliente *</label>
                <ClientSearchSelect clients={clients} value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id ?? '' })} required onClientCreated={(c) => setClients((prev) => [...prev, c])} />
              </div>
              <div><label className="label">Nome do ensaio</label><input className="input" value={form.session_title ?? ''} onChange={(e) => setForm({ ...form, session_title: e.target.value })} /></div>
              <div><label className="label">Data do ensaio</label><input type="date" className="input" value={form.session_date ?? ''} onChange={(e) => setForm({ ...form, session_date: e.target.value })} /></div>
            </div>

            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-4 mb-2">Pessoa autorizante</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Nome completo *</label><input className="input" value={form.authorizer_name ?? ''} onChange={(e) => setForm({ ...form, authorizer_name: e.target.value })} /></div>
              <div><label className="label">CPF</label><input className="input" value={form.authorizer_cpf ?? ''} onChange={(e) => setForm({ ...form, authorizer_cpf: e.target.value })} /></div>
              <div><label className="label">Vínculo com a pessoa fotografada</label><input className="input" placeholder="A própria pessoa, mãe, pai, tutor..." value={form.authorizer_relationship ?? ''} onChange={(e) => setForm({ ...form, authorizer_relationship: e.target.value })} /></div>
              <div><label className="label">E-mail</label><input className="input" value={form.authorizer_email ?? ''} onChange={(e) => setForm({ ...form, authorizer_email: e.target.value })} /></div>
              <div><label className="label">Telefone</label><input className="input" value={form.authorizer_phone ?? ''} onChange={(e) => setForm({ ...form, authorizer_phone: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="label">Endereço</label><input className="input" value={form.authorizer_address ?? ''} onChange={(e) => setForm({ ...form, authorizer_address: e.target.value })} /></div>
            </div>

            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-4 mb-2">Pessoa fotografada (se diferente da autorizante)</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Nome completo</label><input className="input" value={form.photographed_name ?? ''} onChange={(e) => setForm({ ...form, photographed_name: e.target.value })} /></div>
              <div><label className="label">CPF</label><input className="input" value={form.photographed_cpf ?? ''} onChange={(e) => setForm({ ...form, photographed_cpf: e.target.value })} /></div>
              <div><label className="label">Data de nascimento</label><input type="date" className="input" value={form.photographed_birth_date ?? ''} onChange={(e) => setForm({ ...form, photographed_birth_date: e.target.value })} /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.is_minor ?? false} onChange={(e) => setForm({ ...form, is_minor: e.target.checked })} className="h-5 w-5 rounded accent-teal-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Pessoa fotografada é menor de 18 anos</span>
                </label>
              </div>
            </div>
          </FormSection>

          {form.is_minor && (
            <FormSection title="10. Autorização para menores de idade">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label">Nome do responsável legal</label><input className="input" value={form.minor_legal_guardian_name ?? ''} onChange={(e) => setForm({ ...form, minor_legal_guardian_name: e.target.value })} /></div>
                <div><label className="label">CPF do responsável</label><input className="input" value={form.minor_legal_guardian_cpf ?? ''} onChange={(e) => setForm({ ...form, minor_legal_guardian_cpf: e.target.value })} /></div>
                <div><label className="label">Grau de parentesco/vínculo</label><input className="input" placeholder="Mãe, pai, tutor, avô..." value={form.minor_guardian_relationship ?? ''} onChange={(e) => setForm({ ...form, minor_guardian_relationship: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="label">Declaração de responsabilidade e legitimidade</label><textarea className="input min-h-[60px]" value={form.minor_guardian_declaration ?? ''} onChange={(e) => setForm({ ...form, minor_guardian_declaration: e.target.value })} /></div>
              </div>
            </FormSection>
          )}

          {/* Section 2: Purposes */}
          <FormSection title="2. Finalidades da autorização (selecione individualmente)">
            <p className="text-xs text-slate-400 mb-3">Marque somente as finalidades autorizadas. Não considerar todas como automaticamente aceitas.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(PURPOSE_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={form.purposes?.[key] ?? false} onChange={() => togglePurpose(key)} className="mt-0.5 accent-teal-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                </label>
              ))}
            </div>
            {form.purposes?.other_purposes && (
              <div className="mt-3"><label className="label">Descreva outras finalidades</label><input className="input" value={form.other_purposes_text ?? ''} onChange={(e) => setForm({ ...form, other_purposes_text: e.target.value })} /></div>
            )}
          </FormSection>

          {/* Section 3: Materials */}
          <FormSection title="3. Materiais autorizados">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(MATERIAL_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={form.materials?.[key] ?? false} onChange={() => toggleMaterial(key)} className="mt-0.5 accent-teal-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                </label>
              ))}
            </div>
            {form.materials?.other_materials && (
              <div className="mt-3"><label className="label">Descreva outros materiais</label><input className="input" value={form.other_materials_text ?? ''} onChange={(e) => setForm({ ...form, other_materials_text: e.target.value })} /></div>
            )}
            <div className="mt-3"><label className="label">Galeria/arquivos/pasta relacionada</label><input className="input" placeholder="Ex: Ensaio Gestante Maria - Pasta C:\Fotos\Maria" value={form.gallery_ref ?? ''} onChange={(e) => setForm({ ...form, gallery_ref: e.target.value })} /></div>
            {clientFolders.length > 0 && (
              <div className="mt-3">
                <label className="label">Vincular à pasta de fotos cadastrada</label>
                <select className="input" value={form.photo_folder_id ?? ''} onChange={(e) => setForm({ ...form, photo_folder_id: e.target.value || null })}>
                  <option value="">Sem vínculo</option>
                  {clientFolders.map((f) => <option key={f.id} value={f.id}>{f.folder_path} ({f.authorization_status})</option>)}
                </select>
              </div>
            )}
          </FormSection>

          {/* Section 4: Compensation */}
          <FormSection title="4. Gratuidade ou remuneração">
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="comp" checked={form.compensation_type === 'gratuita'} onChange={() => setForm({ ...form, compensation_type: 'gratuita' })} className="accent-teal-600" /><span className="text-sm">Gratuita</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="comp" checked={form.compensation_type === 'remunerada'} onChange={() => setForm({ ...form, compensation_type: 'remunerada' })} className="accent-teal-600" /><span className="text-sm">Remunerada</span></label>
            </div>
            {form.compensation_type === 'remunerada' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="label">Valor</label><input type="number" className="input" value={form.compensation_value ?? 0} onChange={(e) => setForm({ ...form, compensation_value: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="label">Forma de pagamento</label><input className="input" value={form.compensation_payment_method ?? ''} onChange={(e) => setForm({ ...form, compensation_payment_method: e.target.value })} /></div>
                <div><label className="label">Prazo e condições</label><input className="input" value={form.compensation_deadline ?? ''} onChange={(e) => setForm({ ...form, compensation_deadline: e.target.value })} /></div>
              </div>
            )}
          </FormSection>

          {/* Section 5: Editing */}
          <FormSection title="5. Edição e tratamento das imagens">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(EDITING_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input type="checkbox" checked={form.editing_permissions?.[key] ?? false} onChange={() => toggleEditing(key)} className="mt-0.5 accent-teal-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </FormSection>

          {/* Section 6: Duration */}
          <FormSection title="6. Prazo, território e canais">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Data de início</label><input type="date" className="input" value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><label className="label">Data de fim (deixe vazio para indeterminado)</label><input type="date" className="input" value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              <div className="flex items-end"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={form.renewable ?? false} onChange={(e) => setForm({ ...form, renewable: e.target.checked })} className="h-5 w-5 rounded accent-teal-600" /><span className="text-sm">Renovável</span></label></div>
              <div><label className="label">Território</label><input className="input" value={form.territory ?? ''} onChange={(e) => setForm({ ...form, territory: e.target.value })} /></div>
              <div><label className="label">Canais e plataformas</label><input className="input" value={form.channels ?? ''} onChange={(e) => setForm({ ...form, channels: e.target.value })} /></div>
              <div><label className="label">Condições para campanhas pagas</label><input className="input" value={form.paid_campaign_conditions ?? ''} onChange={(e) => setForm({ ...form, paid_campaign_conditions: e.target.value })} /></div>
            </div>
          </FormSection>

          {/* Section 8: LGPD */}
          <FormSection title="8. Proteção de dados pessoais (LGPD)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Responsável pelo tratamento</label><input className="input" value={form.data_controller_name ?? ''} onChange={(e) => setForm({ ...form, data_controller_name: e.target.value })} placeholder={settings.studio_name} /></div>
              <div><label className="label">Finalidades do tratamento</label><input className="input" value={form.data_processing_purposes ?? ''} onChange={(e) => setForm({ ...form, data_processing_purposes: e.target.value })} /></div>
              <div><label className="label">Categorias de dados</label><input className="input" value={form.data_categories ?? ''} onChange={(e) => setForm({ ...form, data_categories: e.target.value })} /></div>
              <div><label className="label">Base legal</label><input className="input" value={form.legal_basis ?? ''} onChange={(e) => setForm({ ...form, legal_basis: e.target.value })} placeholder="Consentimento (art. 7º, I, LGPD)" /></div>
              <div><label className="label">Canal para direitos do titular</label><input className="input" value={form.data_subject_rights_channel ?? ''} onChange={(e) => setForm({ ...form, data_subject_rights_channel: e.target.value })} /></div>
              <div><label className="label">Critérios de retenção</label><input className="input" value={form.retention_criteria ?? ''} onChange={(e) => setForm({ ...form, retention_criteria: e.target.value })} /></div>
              <div><label className="label">Medidas de segurança</label><input className="input" value={form.security_measures ?? ''} onChange={(e) => setForm({ ...form, security_measures: e.target.value })} /></div>
              <div><label className="label">Condições de compartilhamento</label><input className="input" value={form.sharing_conditions ?? ''} onChange={(e) => setForm({ ...form, sharing_conditions: e.target.value })} /></div>
            </div>
          </FormSection>

          {/* Section 9: Revocation */}
          <FormSection title="9. Revogação — canais de contato">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">E-mail para revogação</label><input className="input" value={form.studio_contact_email ?? ''} onChange={(e) => setForm({ ...form, studio_contact_email: e.target.value })} placeholder={settings.email ?? ''} /></div>
              <div><label className="label">Telefone para revogação</label><input className="input" value={form.studio_contact_phone ?? ''} onChange={(e) => setForm({ ...form, studio_contact_phone: e.target.value })} placeholder={settings.phone ?? ''} /></div>
            </div>
          </FormSection>

          {/* Signatures */}
          <FormSection title="Assinaturas">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Cidade</label><input className="input" value={form.signing_city ?? ''} onChange={(e) => setForm({ ...form, signing_city: e.target.value })} /></div>
              <div><label className="label">Data da assinatura</label><input type="date" className="input" value={form.signing_date ?? ''} onChange={(e) => setForm({ ...form, signing_date: e.target.value })} /></div>
              <div><label className="label">Assinatura do autorizante (nome digitado ou caminho)</label><input className="input" value={form.authorizer_signature ?? ''} onChange={(e) => setForm({ ...form, authorizer_signature: e.target.value })} /></div>
              {form.is_minor && <div><label className="label">Assinatura do responsável legal</label><input className="input" value={form.guardian_signature ?? ''} onChange={(e) => setForm({ ...form, guardian_signature: e.target.value })} /></div>}
              <div><label className="label">Representante do estúdio</label><input className="input" value={form.studio_representative ?? ''} onChange={(e) => setForm({ ...form, studio_representative: e.target.value })} /></div>
              <div><label className="label">Testemunha 1 — nome</label><input className="input" value={form.witness_1_name ?? ''} onChange={(e) => setForm({ ...form, witness_1_name: e.target.value })} /></div>
              <div><label className="label">Testemunha 1 — CPF</label><input className="input" value={form.witness_1_cpf ?? ''} onChange={(e) => setForm({ ...form, witness_1_cpf: e.target.value })} /></div>
              <div><label className="label">Testemunha 2 — nome</label><input className="input" value={form.witness_2_name ?? ''} onChange={(e) => setForm({ ...form, witness_2_name: e.target.value })} /></div>
              <div><label className="label">Testemunha 2 — CPF</label><input className="input" value={form.witness_2_cpf ?? ''} onChange={(e) => setForm({ ...form, witness_2_cpf: e.target.value })} /></div>
            </div>
            <div className="mt-3">
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <input type="checkbox" checked={form.awareness_declaration ?? false} onChange={(e) => setForm({ ...form, awareness_declaration: e.target.checked })} className="mt-0.5 accent-teal-600" />
                <span className="text-sm text-slate-700 dark:text-slate-300">Declaro que a pessoa autorizante leu e compreendeu o documento, teve oportunidade de esclarecer dúvidas, recebeu informações sobre as finalidades, pôde escolher individualmente os canais e finalidades, está ciente de que a autorização promocional é separada do serviço e declara possuir legitimidade.</span>
              </label>
            </div>
            <p className="text-xs text-slate-400 mt-3">Uma assinatura digitada ou nome inserido não constitui assinatura eletrônica certificada ou qualificada.</p>
          </FormSection>

          <div className="flex justify-end gap-3">
            <button onClick={() => setSection('list')} className="btn-secondary">Cancelar</button>
            <button onClick={() => handleSave(false)} className="btn-secondary">Salvar rascunho</button>
            <button onClick={() => handleSave(true)} className="btn-primary">Salvar e visualizar documento</button>
          </div>
        </div>
      )}

      {section === 'preview' && editing && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <button onClick={() => setSection('list')} className="btn-secondary text-sm">← Voltar à lista</button>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => openEdit(editing)} className="btn-secondary text-sm"><FileText className="h-4 w-4" /> Editar</button>
              <button onClick={printDocument} className="btn-secondary text-sm"><Printer className="h-4 w-4" /> Imprimir</button>
              <button onClick={() => generateAuthPDF(false)} className="btn-secondary text-sm"><Download className="h-4 w-4" /> Baixar PDF</button>
              <button onClick={() => createNewVersion(editing)} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Nova versão</button>
            </div>
          </div>

          {/* Signature pads */}
          <div className="card p-6">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Assinaturas digitais desenhadas</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SignaturePad
                ref={sigPadRef}
                label="Assinatura do autorizante"
                onConfirm={(url) => setSignatureData(url)}
              />
              {editing.is_minor && (
                <SignaturePad
                  ref={guardianSigRef}
                  label="Assinatura do responsável legal"
                  onConfirm={(url) => setGuardianSignatureData(url)}
                />
              )}
              <SignaturePad
                ref={studioSigRef}
                label="Assinatura do representante do estúdio"
                onConfirm={(url) => setStudioSignatureData(url)}
              />
            </div>
            <p className="text-xs text-amber-600 mt-3">A assinatura desenhada na tela e uma assinatura digital simples. Não constitui assinatura eletrônica certificada. Uma vez confirmada e salva, a assinatura não pode ser alterada silenciosamente — para corrigir, gere uma nova versão do documento.</p>
            <div className="flex justify-end gap-3 mt-4 flex-wrap">
              <button onClick={() => generateAuthPDF(true)} className="btn-primary text-sm" disabled={!signatureData && !guardianSignatureData && !studioSignatureData}><Download className="h-4 w-4" /> Gerar PDF assinado</button>
              <button onClick={saveAuthToClient} className="btn-primary text-sm"><FileCheck className="h-4 w-4" /> {signatureData || guardianSignatureData || studioSignatureData ? 'Salvar documento assinado no cliente' : 'Salvar no cliente'}</button>
            </div>
          </div>

          {/* Saved documents */}
          {savedAttachments.length > 0 && (
            <div className="card p-4">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Documentos salvos deste cliente</h4>
              <div className="space-y-2">
                {savedAttachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-700 dark:text-slate-300">{att.name}</span>
                      {att.mode === 'assinado' && <span className="badge badge-success text-xs">Assinado</span>}
                      <span className="text-xs text-slate-400">{formatDate(att.attached_at)}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => window.open(att.file_path, '_blank')} className="btn-ghost text-xs" title="Visualizar"><Eye className="h-3 w-3" /></button>
                      <button onClick={() => window.open(att.file_path, '_blank')} className="btn-ghost text-xs" title="Reimprimir"><Printer className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-mono text-xs text-slate-400">{editing.doc_number} · v{editing.version}</p>
                <p className="text-sm text-slate-500">Cliente: {clients.find((c) => c.id === editing.client_id)?.full_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <select className="input w-auto text-sm" value={editing.status} onChange={(e) => changeStatus(editing, e.target.value)}>
                  {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'substituido').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            {(isRevoked(editing) || isExpired(editing)) && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  {isRevoked(editing) ? 'Esta autorização foi REVOGADA. Revise o uso futuro das imagens associadas.' : 'Esta autorização está EXPIRADA. Verifique a situação antes de publicar.'}
                </p>
              </div>
            )}
          </div>

          <div className="card p-8 bg-white dark:bg-slate-800 max-h-[600px] overflow-y-auto" id="printable-doc">
            {settings.logo_url && <img src={settings.logo_url} alt="logo" className="h-12 mb-4" />}
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300">{previewText}</pre>
          </div>

          {history.length > 0 && (
            <div className="card p-4">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Histórico de alterações</h4>
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-slate-300 mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-slate-700 dark:text-slate-300">{h.action}</p>
                      <p className="text-xs text-slate-400">{formatDate(h.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400">
            Aviso: Este documento é um modelo inicial editável identificado como "Requer revisão jurídica antes da utilização". A IA elaborou uma minuta completa e coerente, sem incluir cláusulas abusivas, mas não garante validade jurídica. A redação final deve ser revisada por advogado.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir autorização"
        message={`Confirma a exclusão da autorização "${deleteTarget?.doc_number}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{title}</h4>
      {children}
    </div>
  );
}
