import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatDate, fillTemplate } from '@/lib/utils';
import { Plus, Search, Pencil, Trash2, FileText, Printer, Copy, Eye, Download, FileCheck, Sparkles, RefreshCw, CircleAlert as AlertCircle, Save } from 'lucide-react';
import type { DocumentTemplate, Client, Service, Budget, ClientAttachment } from '@/lib/types';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import type { Page } from '@/components/Sidebar';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { buildPrintHTML, openPrintWindow } from '@/lib/printUtils';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { generateDocumentPDF, downloadPDF, uploadDocumentToStorage } from '@/lib/pdfUtils';
import { uploadToGDrive, createSyncLogEntry, buildStandardFileName, SYNC_CATEGORIES, isGDriveAvailable } from '@/lib/googleDrive';
import { callGemini, DOC_TYPE_ACTIONS, type AiDocAction } from '@/lib/ai';

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

  // AI document generation state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiStep, setAiStep] = useState<'config' | 'generating' | 'review'>('config');
  const [aiDocType, setAiDocType] = useState<string>('contrato');
  const [aiTitle, setAiTitle] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiClauses, setAiClauses] = useState('');
  const [aiBaseTemplateBody, setAiBaseTemplateBody] = useState('');
  const [aiUseBaseTemplate, setAiUseBaseTemplate] = useState(true);
  const [aiBaseTemplateId, setAiBaseTemplateId] = useState('');
  const [aiGeneratedBody, setAiGeneratedBody] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);

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

  const openAiGenerate = () => {
    setAiStep('config');
    setAiDocType('contrato');
    setAiTitle('');
    setAiInstructions('');
    setAiClauses('');
    setAiBaseTemplateBody('');
    setAiUseBaseTemplate(true);
    setAiBaseTemplateId('');
    setAiGeneratedBody('');
    setAiError(null);
    // pre-select default template of this type
    const defaultTpl = templates.find((t) => t.type === 'contrato' && t.is_default) ?? templates.find((t) => t.type === 'contrato');
    if (defaultTpl) {
      setAiBaseTemplateId(defaultTpl.id);
      setAiBaseTemplateBody(defaultTpl.body);
      setAiTitle(defaultTpl.title);
    }
    setAiOpen(true);
  };

  const onAiDocTypeChange = (type: string) => {
    setAiDocType(type);
    const typeLabels: Record<string, string> = { contrato: 'Contrato de Prestação de Serviços', termo: 'Termo de Responsabilidade', autorizacao: 'Autorização de Uso de Imagem', recibo: 'Recibo de Pagamento', declaracao: 'Declaração', outro: 'Documento' };
    const tpl = templates.find((t) => t.type === type && t.is_default) ?? templates.find((t) => t.type === type);
    if (tpl) {
      setAiBaseTemplateId(tpl.id);
      setAiBaseTemplateBody(tpl.body);
      if (!aiTitle || aiTitle === 'Contrato de Prestação de Serviços' || aiTitle === 'Termo de Responsabilidade' || aiTitle === 'Autorização de Uso de Imagem' || aiTitle === 'Recibo de Pagamento' || aiTitle === 'Declaração') {
        setAiTitle(tpl.title);
      }
    } else {
      setAiBaseTemplateId('');
      setAiBaseTemplateBody('');
      setAiTitle(typeLabels[type] ?? 'Documento');
    }
  };

  const runAiGeneration = async () => {
    const action = DOC_TYPE_ACTIONS[aiDocType] ?? ('gerar_documento_outro' as AiDocAction);
    setAiStep('generating');
    setAiError(null);
    try {
      const contextParts: string[] = [];
      if (aiUseBaseTemplate && aiBaseTemplateBody) {
        contextParts.push(`Modelo aprovado do estúdio (use como base e estrutura, adapte e melhore o conteúdo):\n${aiBaseTemplateBody}`);
      }
      if (aiInstructions.trim()) {
        contextParts.push(`Finalidade / instruções específicas:\n${aiInstructions.trim()}`);
      }
      if (aiClauses.trim()) {
        contextParts.push(`Cláusulas ou condições adicionais a incluir:\n${aiClauses.trim()}`);
      }
      const context = contextParts.join('\n\n');
      const result = await callGemini(action, context, '');
      setAiGeneratedBody(result.text);
      setAiStep('review');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao gerar documento com IA');
      setAiStep('config');
    }
  };

  const saveAiAsTemplate = async () => {
    if (!aiGeneratedBody) return;
    const name = aiTitle || `Documento IA ${aiDocType}`;
    const { error } = await supabase.from('document_templates').insert({
      name,
      type: aiDocType,
      title: aiTitle || name,
      body: aiGeneratedBody,
      header: '',
      footer: '',
      is_default: false,
    });
    if (error) { toast('Erro ao salvar modelo', 'error'); return; }
    toast('Modelo salvo a partir da geração IA', 'success');
    load();
  };

  const confirmAiDocument = () => {
    // Create a pseudo-template from AI output and transition to existing generate flow
    const tpl: DocumentTemplate = {
      id: `ai_${Date.now()}`,
      name: aiTitle || `Documento IA ${aiDocType}`,
      type: aiDocType,
      title: aiTitle || `Documento IA ${aiDocType}`,
      body: aiGeneratedBody,
      header: '',
      footer: '',
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setAiOpen(false);
    openGenerate(tpl);
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
      <PageHeader title="Contratos e documentos" subtitle={`${templates.length} modelo(s) disponível(is)`} actions={<div className="flex gap-2"><button onClick={openAiGenerate} className="btn-secondary"><Sparkles className="h-4 w-4" /> Gerar documento com IA</button><button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Novo modelo</button></div>} />

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

      {/* AI Generation Modal */}
      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="Gerar documento com IA" size="xl">
        {aiStep === 'config' && (
          <div className="space-y-4">
            <div className="card p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">A IA gera apenas o texto do documento com marcadores ({'{NOME_CLIENTE}'}, etc.). Os dados reais do cliente são preenchidos localmente após a geração. Nenhum dado pessoal é enviado ao Gemini.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Tipo de documento</label>
                <select className="input" value={aiDocType} onChange={(e) => onAiDocTypeChange(e.target.value)}>
                  {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Título do documento</label>
                <input className="input" value={aiTitle} onChange={(e) => setAiTitle(e.target.value)} placeholder="Ex: Contrato de Prestação de Serviços" />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={aiUseBaseTemplate} onChange={(e) => setAiUseBaseTemplate(e.target.checked)} className="h-4 w-4 rounded accent-teal-600" />
                <span className="text-sm text-slate-700 dark:text-slate-300">Usar modelo aprovado como base (recomendado)</span>
              </label>
              {aiUseBaseTemplate && (
                <select className="input" value={aiBaseTemplateId} onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); setAiBaseTemplateId(e.target.value); if (t) { setAiBaseTemplateBody(t.body); if (!aiTitle) setAiTitle(t.title); } }}>
                  <option value="">Selecione um modelo base...</option>
                  {templates.filter((t) => t.type === aiDocType).map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (padrão)' : ''}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="label">Finalidade / instruções específicas (opcional)</label>
              <textarea className="input min-h-[80px]" value={aiInstructions} onChange={(e) => setAiInstructions(e.target.value)} placeholder="Ex: Contrato para ensaio gestante com sessão em estúdio e externa, entrega em 15 dias..." />
            </div>
            <div>
              <label className="label">Cláusulas ou condições adicionais (opcional)</label>
              <textarea className="input min-h-[80px]" value={aiClauses} onChange={(e) => setAiClauses(e.target.value)} placeholder="Ex: Incluir cláusula de exclusividade de produção, proibição de terceirização..." />
            </div>
            {aiError && <div className="card p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">{aiError}</div>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setAiOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={runAiGeneration} className="btn-primary"><Sparkles className="h-4 w-4" /> Gerar com IA</button>
            </div>
          </div>
        )}
        {aiStep === 'generating' && (
          <div className="py-16 text-center">
            <RefreshCw className="h-8 w-8 text-teal-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Gerando documento com Google Gemini...</p>
            <p className="text-xs text-slate-400 mt-2">Aguarde, isso pode levar alguns segundos.</p>
          </div>
        )}
        {aiStep === 'review' && (
          <div className="space-y-4">
            <div className="card p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-sky-700 dark:text-sky-300">Revise o conteúdo gerado. Você pode editar o texto abaixo antes de confirmar. Ao confirmar, o documento passará para a etapa de preenchimento com dados do cliente, assinatura e geração de PDF.</p>
              </div>
            </div>
            <div>
              <label className="label">Documento gerado (editável)</label>
              <textarea className="input min-h-[400px] font-mono text-xs" value={aiGeneratedBody} onChange={(e) => setAiGeneratedBody(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3 flex-wrap">
              <button onClick={() => setAiStep('config')} className="btn-secondary">Voltar e ajustar</button>
              <button onClick={runAiGeneration} className="btn-secondary"><RefreshCw className="h-4 w-4" /> Regenerar</button>
              <button onClick={saveAiAsTemplate} className="btn-secondary"><Save className="h-4 w-4" /> Salvar como modelo</button>
              <button onClick={confirmAiDocument} className="btn-primary"><ArrowRight className="h-4 w-4" /> Revisar e preencher</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Excluir modelo" message={`Confirma a exclusão de "${deleteTarget?.name}"?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
