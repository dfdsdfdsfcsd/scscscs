import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatDate, fillTemplate } from '@/lib/utils';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  FileText,
  Printer,
  Copy,
  Eye,
  Download,
  FileCheck,
} from 'lucide-react';
import type { DocumentTemplate, Client, Service, Budget, ClientAttachment } from '@/lib/types';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import type { Page } from '@/components/Sidebar';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { buildPrintHTML, openPrintWindow } from '@/lib/printUtils';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { generateDocumentPDF, downloadPDF, uploadDocumentToStorage } from '@/lib/pdfUtils';
import { uploadToGDrive, createSyncLogEntry, buildStandardFileName, SYNC_CATEGORIES, isGDriveAvailable } from '@/lib/googleDrive';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface DocumentsPageProps {
  onNavigate?: (page: Page) => void;
}

export function DocumentsPage({ onNavigate }: DocumentsPageProps = {}) {
  const { settings } = useSettings();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentTemplate | null>(null);
  const [generateTarget, setGenerateTarget] = useState<DocumentTemplate | null>(null);
  const [generatedText, setGeneratedText] = useState('');
  const [generateForm, setGenerateForm] = useState({ client_id: '', service_id: '', budget_id: '', data_servico: '', horario_servico: '', local_servico: '', valor_contratado: '', condicoes_pagamento: '', prazo_entrega: '' });
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [savedAttachments, setSavedAttachments] = useState<ClientAttachment[]>([]);
  const sigPadRef = useRef<SignaturePadHandle>(null);

  const [form, setForm] = useState<Partial<DocumentTemplate>>({
    name: '', type: 'contrato', title: '', body: '', header: '', footer: '', is_default: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('document_templates').select('*').order('name');
    setTemplates((data as DocumentTemplate[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.from('clients').select('*').eq('status', 'ativo').order('full_name').then(({ data }) => setClients((data as Client[]) ?? []));
    supabase.from('services').select('*').eq('active', true).order('name').then(({ data }) => setServices((data as Service[]) ?? []));
    supabase.from('budgets').select('*').eq('status', 'aprovado').order('created_at', { ascending: false }).then(({ data }) => setBudgets((data as Budget[]) ?? []));
  }, [load]);

  const filtered = templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.type.toLowerCase().includes(search.toLowerCase()));

  const loadAttachments = useCallback(async (clientId: string) => {
    if (!clientId) { setSavedAttachments([]); return; }
    const { data } = await supabase.from('client_attachments').select('*').eq('client_id', clientId).eq('file_type', 'documento').order('attached_at', { ascending: false });
    setSavedAttachments((data as ClientAttachment[]) ?? []);
  }, []);

  const openNew = () => { setEditing(null); setForm({ name: '', type: 'contrato', title: '', body: '', header: '', footer: '', is_default: false }); setModalOpen(true); };
  const openEdit = (t: DocumentTemplate) => { setEditing(t); setForm(t); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.title || !form.body) { toast('Preencha nome, título e corpo do documento', 'warning'); return; }
    if (editing) {
      const { error } = await supabase.from('document_templates').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast('Erro ao atualizar modelo', 'error'); return; }
      toast('Modelo atualizado', 'success');
    } else {
      const { error } = await supabase.from('document_templates').insert(form);
      if (error) { toast('Erro ao criar modelo', 'error'); return; }
      toast('Modelo criado', 'success');
    }
    setModalOpen(false); load();
  };

  const handleDuplicate = async (t: DocumentTemplate) => {
    const { id, created_at, updated_at, ...rest } = t;
    void id; void created_at; void updated_at;
    const { error } = await supabase.from('document_templates').insert({ ...rest, name: `${t.name} (cópia)`, is_default: false });
    if (error) { toast('Erro ao duplicar', 'error'); return; }
    toast('Modelo duplicado', 'success'); load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('document_templates').delete().eq('id', deleteTarget.id);
    toast('Modelo excluído', 'success');
    setDeleteTarget(null); load();
  };

  const openGenerate = (t: DocumentTemplate) => {
    setGenerateTarget(t);
    setGenerateForm({ client_id: '', service_id: '', budget_id: '', data_servico: '', horario_servico: '', local_servico: '', valor_contratado: '', condicoes_pagamento: '', prazo_entrega: '' });
    setGeneratedText(t.body);
    setSignatureData(null);
    setSavedAttachments([]);
  };

  const updateGenerated = (updates: Partial<typeof generateForm>) => {
    const newForm = { ...generateForm, ...updates };
    setGenerateForm(newForm);
    if (!generateTarget) return;
    const client = clients.find((c) => c.id === newForm.client_id);
    const service = services.find((s) => s.id === newForm.service_id);
    const budget = budgets.find((b) => b.id === newForm.budget_id);
    const vars: Record<string, string> = {
      NOME_CLIENTE: client?.full_name ?? '',
      CPF_CLIENTE: client?.cpf ?? '',
      TELEFONE_CLIENTE: client?.phone ?? '',
      ENDERECO_CLIENTE: [client?.address, client?.address_number, client?.neighborhood, client?.city].filter(Boolean).join(', ') ?? '',
      NOME_ESTUDIO: settings.studio_name,
      CNPJ_CPF: settings.tax_id ?? '',
      ENDERECO_ESTUDIO: settings.address ?? '',
      TELEFONE_ESTUDIO: settings.phone ?? '',
      SERVICO_DESCRICAO: service?.name ?? service?.description ?? '',
      DATA_SERVICO: newForm.data_servico,
      HORARIO_SERVICO: newForm.horario_servico,
      LOCAL_SERVICO: newForm.local_servico,
      VALOR_CONTRATADO: budget ? budget.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : newForm.valor_contratado,
      CONDICOES_PAGAMENTO: budget?.payment_conditions ?? newForm.condicoes_pagamento,
      PRAZO_ENTREGA: service?.delivery_days ? `${service.delivery_days} dias` : newForm.prazo_entrega,
      VALOR_PAGAMENTO: '', DESCRICAO_PAGAMENTO: '', DATA_PAGAMENTO: new Date().toLocaleDateString('pt-BR'),
      ESCOPO_AUTORIZACAO: 'portfólio e redes sociais', PRAZO_AUTORIZACAO: 'por tempo indeterminado',
      TERMOS_CANCELAMENTO: settings.cancellation_rules ?? '', TERMOS_REAGENDAMENTO: settings.reschedule_rules ?? '',
      CODIGO_ORCAMENTO: budget?.code ?? '',
      VALOR_SINAL: budget ? budget.deposit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
      VALOR_SALDO: budget ? budget.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
      DATA_VALIDADE_ORCAMENTO: budget?.valid_until ?? '',
    };
    setGeneratedText(fillTemplate(generateTarget.body, vars));
  };

  const printDocument = () => {
    const printArea = document.getElementById('printable-doc');
    if (!printArea) { window.print(); return; }
    const headerHtml = generateTarget?.header
      ? `<div class="print-section"><pre class="print-body" style="font-size:11px;color:#64748b;text-align:center;margin-bottom:16px;">${generateTarget.header}</pre></div>`
      : '';
    const footerHtml = generateTarget?.footer
      ? `<div class="print-section"><pre class="print-body" style="font-size:11px;color:#64748b;text-align:center;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:8px;">${generateTarget.footer}</pre></div>`
      : '';
    const bodyContent = `${headerHtml}<div class="print-section"><h3>${generateTarget?.title ?? ''}</h3><pre class="print-body">${printArea.innerText}</pre></div>${footerHtml}`;
    const html = buildPrintHTML(generateTarget?.title ?? 'Documento', bodyContent, settings);
    openPrintWindow(html);
  };

  const generatePDF = async (withSignature: boolean) => {
    if (!generateTarget) return;
    const client = clients.find((c) => c.id === generateForm.client_id);
    const sigs = withSignature && signatureData
      ? [{ label: 'Assinatura', dataUrl: signatureData, name: client?.full_name ?? '' }]
      : [];
    const blob = generateDocumentPDF({
      title: generateTarget.title,
      body: generatedText,
      header: generateTarget.header,
      footer: generateTarget.footer,
      settings,
      signatures: sigs,
    });
    const filename = `${generateTarget.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    downloadPDF(blob, filename);
  };

  const saveDocumentToClient = async () => {
    if (!generateTarget || !generateForm.client_id) { toast('Selecione um cliente', 'warning'); return; }
    const client = clients.find((c) => c.id === generateForm.client_id);
    const sigs = signatureData ? [{ label: 'Assinatura', dataUrl: signatureData, name: client?.full_name ?? '' }] : [];
    const blob = generateDocumentPDF({
      title: generateTarget.title,
      body: generatedText,
      header: generateTarget.header,
      footer: generateTarget.footer,
      settings,
      signatures: sigs,
    });
    const fileName = `${generateTarget.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const storagePath = `documents/${generateForm.client_id}/${fileName}`;
    const uploaded = await uploadDocumentToStorage(SUPABASE_URL, 'documents', storagePath, blob);
    if (!uploaded) { toast('Erro ao salvar arquivo no armazenamento', 'error'); return; }
    await supabase.from('client_attachments').insert({
      client_id: generateForm.client_id,
      name: generateTarget.title,
      file_path: uploaded.publicUrl,
      file_type: 'documento',
      mode: signatureData ? 'assinado' : 'gerado',
      observations: signatureData ? `Documento assinado digitalmente em ${new Date().toLocaleString('pt-BR')}` : `Documento gerado em ${new Date().toLocaleString('pt-BR')}`,
    });
    await supabase.from('client_history').insert({ client_id: generateForm.client_id, event_type: 'documento', description: `Documento ${signatureData ? 'assinado' : 'gerado'}: ${generateTarget.title}` });
    toast(signatureData ? 'Documento assinado salvo no cadastro do cliente' : 'Documento salvo no cadastro do cliente', 'success');
    loadAttachments(generateForm.client_id);

    if (settings.gdrive_auto_sync && isGDriveAvailable() && blob) {
      const clientName = client?.full_name ?? null;
      const category = SYNC_CATEGORIES[generateTarget.type as keyof typeof SYNC_CATEGORIES] ?? SYNC_CATEGORIES.outro;
      const year = new Date().getFullYear();
      const fileName = buildStandardFileName(new Date(), category, clientName, null);
      const result = await uploadToGDrive(blob, fileName, category, year, clientName);
      if (result.success && !result.skipped) {
        await createSyncLogEntry(generateForm.client_id || null, null, fileName, category, clientName, year, 'synced', result.fileId ?? null, result.folderId ?? null, result.url ?? null);
        toast('Documento enviado para o Google Drive', 'success');
      } else if (result.skipped) {
        await createSyncLogEntry(generateForm.client_id || null, null, fileName, category, clientName, year, 'synced', result.fileId ?? null, result.folderId ?? null, result.url ?? null);
        toast('Documento já existe no Google Drive', 'info');
      } else {
        await createSyncLogEntry(generateForm.client_id || null, null, fileName, category, clientName, year, 'failed', null, null, null, result.error ?? 'Erro no upload');
        toast('Falha ao enviar para o Google Drive', 'error');
      }
    }
  };

  const typeLabels: Record<string, string> = { contrato: 'Contrato', termo: 'Termo', autorizacao: 'Autorização', recibo: 'Recibo', ficha: 'Ficha', ordem: 'Ordem de serviço', outro: 'Outro' };

  return (
    <div>
      <PageHeader title="Contratos e documentos" subtitle={`${templates.length} modelo(s) disponível(is)`} actions={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Novo modelo</button>} />

      <div className="card p-4 mb-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-sky-600 flex-shrink-0" />
            <p className="text-sm text-sky-700 dark:text-sky-300">Para autorizações de uso de imagem com cláusulas completas (LGPD, finalidades, vigência, revogação), use o sistema dedicado de autorizações.</p>
          </div>
          {onNavigate && <button onClick={() => onNavigate('authorizations')} className="btn-secondary text-sm whitespace-nowrap">Ir para autorizações <ArrowRight className="h-4 w-4 inline" /></button>}
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input className="input pl-10" placeholder="Pesquisar modelos..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? <div className="py-20 text-center text-slate-400">Carregando...</div> : filtered.length === 0 ? (
        <EmptyState icon={<FileText className="h-12 w-12" />} title="Nenhum modelo encontrado" description="Crie modelos de contratos, termos e documentos." action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Criar modelo</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <div key={t.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><span className="badge badge-info">{typeLabels[t.type] ?? t.type}</span><h3 className="font-semibold text-slate-900 dark:text-slate-100 mt-2 truncate">{t.name}</h3></div>
                {t.is_default && <span className="badge badge-neutral">Padrão</span>}
              </div>
              <p className="text-sm text-slate-400 mt-2 line-clamp-3">{t.body.slice(0, 150)}...</p>
              <div className="mt-4 flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                <button onClick={() => openGenerate(t)} className="btn-ghost text-xs" title="Gerar documento"><Eye className="h-4 w-4" /> Gerar</button>
                <button onClick={() => openEdit(t)} className="btn-ghost text-xs" title="Editar"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDuplicate(t)} className="btn-ghost text-xs" title="Duplicar"><Copy className="h-4 w-4" /></button>
                <button onClick={() => setDeleteTarget(t)} className="btn-ghost text-xs text-red-500" title="Excluir"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar modelo' : 'Novo modelo'} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2"><label className="label">Nome do modelo</label><input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Tipo</label><select className="input" value={form.type ?? 'contrato'} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div><label className="label">Título do documento</label><input className="input" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">Corpo do documento</label><textarea className="input min-h-[300px] font-mono text-xs" value={form.body ?? ''} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-xs text-slate-400 mb-2">Campos automáticos disponíveis:</p>
            <div className="flex flex-wrap gap-1 text-xs">
              {['{NOME_CLIENTE}', '{CPF_CLIENTE}', '{TELEFONE_CLIENTE}', '{ENDERECO_CLIENTE}', '{NOME_ESTUDIO}', '{CNPJ_CPF}', '{ENDERECO_ESTUDIO}', '{TELEFONE_ESTUDIO}', '{SERVICO_DESCRICAO}', '{DATA_SERVICO}', '{HORARIO_SERVICO}', '{LOCAL_SERVICO}', '{VALOR_CONTRATADO}', '{CONDICOES_PAGAMENTO}', '{PRAZO_ENTREGA}', '{VALOR_PAGAMENTO}', '{DESCRICAO_PAGAMENTO}', '{DATA_PAGAMENTO}', '{ESCOPO_AUTORIZACAO}', '{PRAZO_AUTORIZACAO}', '{TERMOS_CANCELAMENTO}', '{TERMOS_REAGENDAMENTO}', '{CODIGO_ORCAMENTO}', '{VALOR_SINAL}', '{VALOR_SALDO}', '{DATA_VALIDADE_ORCAMENTO}'].map((f) => <span key={f} className="badge badge-neutral font-mono">{f}</span>)}
</div>
          </div>
          <div><label className="label">Cabeçalho (opcional)</label><input className="input" value={form.header ?? ''} onChange={(e) => setForm({ ...form, header: e.target.value })} /></div>
          <div><label className="label">Rodapé (opcional)</label><input className="input" value={form.footer ?? ''} onChange={(e) => setForm({ ...form, footer: e.target.value })} /></div>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={form.is_default ?? false} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="h-5 w-5 rounded accent-teal-600" /><span className="text-sm text-slate-700 dark:text-slate-300">Marcar como modelo padrão</span></label>
          <p className="text-xs text-amber-600 dark:text-amber-400">Modelos iniciais sujeitos à revisão jurídica. Não possuem validade jurídica garantida até validação por um advogado.</p>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleSave} className="btn-primary">{editing ? 'Salvar' : 'Criar modelo'}</button></div>
      </Modal>

      {/* Generate modal */}
      <Modal open={!!generateTarget} onClose={() => setGenerateTarget(null)} title={`Gerar: ${generateTarget?.name ?? ''}`} size="xl">
        {generateTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">Cliente</label><ClientSearchSelect clients={clients} value={generateForm.client_id} onChange={(id) => { updateGenerated({ client_id: id ?? '' }); if (id) loadAttachments(id); else setSavedAttachments([]); }} /></div>
              <div><label className="label">Serviço</label><select className="input" value={generateForm.service_id} onChange={(e) => updateGenerated({ service_id: e.target.value })}><option value="">Selecione...</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label">Orçamento aprovado (opcional)</label><select className="input" value={generateForm.budget_id} onChange={(e) => updateGenerated({ budget_id: e.target.value })}><option value="">Sem orçamento</option>{budgets.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></div>
              <div><label className="label">Data do serviço</label><input type="date" className="input" value={generateForm.data_servico} onChange={(e) => updateGenerated({ data_servico: e.target.value })} /></div>
              <div><label className="label">Horário</label><input type="time" className="input" value={generateForm.horario_servico} onChange={(e) => updateGenerated({ horario_servico: e.target.value })} /></div>
              <div><label className="label">Local</label><input className="input" value={generateForm.local_servico} onChange={(e) => updateGenerated({ local_servico: e.target.value })} /></div>
            </div>
            <div>
              <label className="label">Documento gerado</label>
              <div className="card p-6 bg-white dark:bg-slate-800 max-h-[400px] overflow-y-auto" id="printable-doc">
                {settings.logo_url && <img src={settings.logo_url} alt="logo" className="h-12 mb-4" />}
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">{generateTarget.title}</h2>
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300">{generatedText}</pre>
                {generateTarget.footer && <p className="text-xs text-slate-400 mt-6 border-t border-slate-200 dark:border-slate-700 pt-3">{generateTarget.footer}</p>}
              </div>
            </div>
            <SignaturePad
              ref={sigPadRef}
              label="Assinatura do cliente (desenhe na tela)"
              onConfirm={(url) => setSignatureData(url)}
            />
            {signatureData && (
              <div className="flex items-center gap-2 text-xs text-emerald-600"><FileCheck className="h-4 w-4" /> Assinatura capturada e pronta para incorporar ao documento.</div>
            )}
            <p className="text-xs text-slate-400">A assinatura desenhada na tela e uma assinatura digital simples, não constituindo assinatura eletrônica certificada. Para assinatura eletrônica avançada, e necessária integração com um provedor compatível.</p>
            {savedAttachments.length > 0 && (
              <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-semibold text-slate-500 mb-2">Documentos salvos deste cliente:</p>
                <div className="space-y-1">
                  {savedAttachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">{att.name} {att.mode === 'assinado' && <span className="badge badge-success ml-1">Assinado</span>}</span>
                      <div className="flex gap-1">
                        <button onClick={() => window.open(att.file_path, '_blank')} className="btn-ghost text-xs" title="Visualizar"><Eye className="h-3 w-3" /></button>
                        <button onClick={() => window.open(att.file_path, '_blank')} className="btn-ghost text-xs" title="Reimprimir"><Printer className="h-3 w-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 flex-wrap">
              <button onClick={() => generatePDF(false)} className="btn-secondary"><Download className="h-4 w-4" /> Baixar PDF</button>
              <button onClick={printDocument} className="btn-secondary"><Printer className="h-4 w-4" /> Imprimir</button>
              <button onClick={saveDocumentToClient} className="btn-primary" disabled={!generateForm.client_id}><FileCheck className="h-4 w-4" /> {signatureData ? 'Salvar documento assinado' : 'Salvar no cadastro do cliente'}</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Excluir modelo" message={`Confirma a exclusão de "${deleteTarget?.name}"?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
