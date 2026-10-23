import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import {
  formatDate,
  calculateGestationalWeek,
  buildWhatsAppUrl,
  normalizePhone,
  fillTemplate,
  daysUntil,
  toLocalISODate,
} from '@/lib/utils';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  Eye,
  FolderOpen,
  MessageCircle,
  Copy,
  Baby,
  History,
  Paperclip,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  FileText,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  nativeSelectFile,
  nativeSelectFolder,
  nativeOpenPath,
  nativePathExists,
  nativeCopyFile,
  isAllowedFileType,
  allowedExtensionsLabel,
  isElectron,
} from '@/lib/nativeFile';
import type {
  Client,
  ClientPhotoFolder,
  ClientHistory,
  ClientAttachment,
  MessageTemplate,
  Appointment,
  Budget,
  ImageAuthorization,
} from '@/lib/types';
import type { Page } from '@/components/Sidebar';
import { ValidationDialog, type ValidationError } from '@/components/ValidationDialog';
import { GitMerge, Building2, User, ArrowUp, ArrowDown } from 'lucide-react';
import { useSaving } from '@/lib/useSaving';

const emptyForm: Partial<Client> = {
  code: '',
  person_type: 'fisica',
  full_name: '',
  social_name: '',
  cpf: '',
  cnpj: '',
  legal_name: '',
  fantasy_name: '',
  state_registration: '',
  municipal_registration: '',
  contact_person_name: '',
  birth_date: '',
  phone: '',
  whatsapp: '',
  email: '',
  cep: '',
  address: '',
  address_number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  first_contact: toLocalISODate(new Date()),
  origin: '',
  observations: '',
  status: 'ativo',
  due_date: '',
  baby_name: '',
  shoot_type: '',
  scenery_preferences: '',
  costume_preferences: '',
  references_notes: '',
  companion_name: '',
  pose_notes: '',
};

type DetailTab = 'info' | 'gestante' | 'photos' | 'authorizations' | 'attachments' | 'history';

const AUTH_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'badge-neutral' },
  aguardando_assinatura: { label: 'Aguardando assinatura', color: 'badge-warning' },
  autorizado: { label: 'Autorizado', color: 'badge-success' },
  recusado: { label: 'Recusado', color: 'badge-danger' },
  revogado: { label: 'Revogado', color: 'badge-danger' },
  expirado: { label: 'Expirado', color: 'badge-danger' },
  substituido: { label: 'Substituído', color: 'badge-neutral' },
};

interface ClientsPageProps {
  onNavigate?: (page: Page) => void;
  onCreateAuthorization?: (clientId: string) => void;
  onViewAuthorization?: (authId: string) => void;
}

export function ClientsPage({ onNavigate, onCreateAuthorization, onViewAuthorization }: ClientsPageProps = {}) {
  const { settings } = useSettings();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client>>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [detailTarget, setDetailTarget] = useState<Client | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [photoFolders, setPhotoFolders] = useState<ClientPhotoFolder[]>([]);
  const [history, setHistory] = useState<ClientHistory[]>([]);
  const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
  const [clientBudgets, setClientBudgets] = useState<Budget[]>([]);
  const [clientAppointments, setClientAppointments] = useState<Appointment[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [whatsappModal, setWhatsappModal] = useState<Client | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [messageText, setMessageText] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newFolderStatus, setNewFolderStatus] = useState('pendente');
  const [newFolderNotes, setNewFolderNotes] = useState('');
  const [attachmentModal, setAttachmentModal] = useState(false);
  const [newAttachment, setNewAttachment] = useState({ name: '', file_path: '', file_type: '', observations: '', mode: 'referenced' as 'referenced' | 'copied' });
  const [editingFolder, setEditingFolder] = useState<ClientPhotoFolder | null>(null);
  const [editFolderPath, setEditFolderPath] = useState('');
  const [editFolderStatus, setEditFolderStatus] = useState('pendente');
  const [editFolderNotes, setEditFolderNotes] = useState('');
  const [folderExistsCache, setFolderExistsCache] = useState<Record<string, boolean>>({});
  const [fileExistsCache, setFileExistsCache] = useState<Record<string, boolean>>({});
  const [clientAuths, setClientAuths] = useState<ImageAuthorization[]>([]);
  const [authBadgeCount, setAuthBadgeCount] = useState<Record<string, { total: number; active: number; issues: number }>>({});
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validationOpen, setValidationOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<Client[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ source: Client; target: Client } | null>(null);
  const [mergeStep, setMergeStep] = useState<'select' | 'confirm' | 'done'>('select');
  const [mergeRelatedCounts, setMergeRelatedCounts] = useState<{ budgets: number; appointments: number; entries: number; folders: number; attachments: number; history: number; auths: number } | null>(null);
  const [sortBy, setSortBy] = useState<'code' | 'name'>('code');
  const [sortDesc, setSortDesc] = useState(false);
  const { saving, withSaving } = useSaving();

  const validateForm = (): ValidationError[] => {
    const errors: ValidationError[] = [];
    const isJuridica = form.person_type === 'juridica';

    if (!form.full_name?.trim()) {
      errors.push({ field: 'full_name', label: isJuridica ? 'Nome fantasia / Nome de contato' : 'Nome completo', message: 'Este campo é obrigatório.' });
    }
    if (!form.code?.trim()) {
      errors.push({ field: 'code', label: 'Código', message: 'O código do cliente é obrigatório.' });
    }
    if (isJuridica && !form.legal_name?.trim()) {
      errors.push({ field: 'legal_name', label: 'Razão social', message: 'A razão social é obrigatória para pessoas jurídicas.' });
    }
    if (!isJuridica && !form.birth_date) {
      errors.push({ field: 'birth_date', label: 'Data de nascimento', message: 'A data de nascimento é obrigatória para pessoas físicas.' });
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.push({ field: 'email', label: 'E-mail', message: 'O e-mail informado não é válido.' });
    }
    if (form.cnpj && form.cnpj.replace(/\D/g, '').length !== 14) {
      errors.push({ field: 'cnpj', label: 'CNPJ', message: 'O CNPJ deve conter 14 dígitos.' });
    }
    if (form.cpf && form.cpf.replace(/\D/g, '').length !== 11) {
      errors.push({ field: 'cpf', label: 'CPF', message: 'O CPF deve conter 11 dígitos.' });
    }
    if (form.cep && form.cep.replace(/\D/g, '').length !== 8) {
      errors.push({ field: 'cep', label: 'CEP', message: 'O CEP deve conter 8 dígitos.' });
    }
    return errors;
  };

  const lookupCnpj = async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) { toast('O CNPJ deve conter 14 dígitos', 'warning'); return; }
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!res.ok) { toast('CNPJ não encontrado', 'warning'); return; }
      const data = await res.json();
      setForm((prev) => ({
        ...prev,
        legal_name: data.razao_social ?? prev.legal_name,
        fantasy_name: data.nome_fantasia ?? prev.fantasy_name,
        full_name: prev.full_name || data.nome_fantasia || data.razao_social || prev.full_name,
        cep: data.cep ? data.cep.replace('-', '').replace('.', '') : prev.cep,
        address: data.logradouro ?? prev.address,
        address_number: data.numero ?? prev.address_number,
        complement: data.complemento ?? prev.complement,
        neighborhood: data.bairro ?? prev.neighborhood,
        city: data.municipio ?? prev.city,
        state: data.uf ?? prev.state,
        email: data.email ?? prev.email,
        phone: data.ddd_telefone_1 ?? data.ddd_telefone_2 ?? prev.phone,
      }));
      toast('Dados do CNPJ preenchidos. Revise antes de salvar.', 'success');
    } catch {
      toast('Erro ao consultar CNPJ. Verifique a conexão ou preencha manualmente.', 'error');
    } finally {
      setCnpjLoading(false);
    }
  };

  const checkDuplicates = async (): Promise<Client[]> => {
    if (!form.full_name?.trim()) return [];
    const conditions: string[] = [];
    const params: Record<string, string> = {};
    const name = form.full_name.trim().toLowerCase();
    conditions.push(`full_name.ilike.%${name}%`);
    if (form.cpf?.trim()) {
      const cleanCpf = form.cpf.replace(/\D/g, '');
      if (cleanCpf) conditions.push(`cpf.eq.${cleanCpf}`);
    }
    if (form.cnpj?.trim()) {
      const cleanCnpj = form.cnpj.replace(/\D/g, '');
      if (cleanCnpj) conditions.push(`cnpj.eq.${cleanCnpj}`);
    }
    if (form.phone?.trim()) {
      conditions.push(`phone.eq.${form.phone.trim()}`);
    }
    if (form.email?.trim()) {
      conditions.push(`email.eq.${form.email.trim()}`);
    }
    let query = supabase.from('clients').select('*');
    if (editing) query = query.neq('id', editing.id);
    const { data } = await query.or(conditions.join(','));
    return (data as Client[]) ?? [];
  };

  const loadClients = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setClients((data as Client[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClients();
    (async () => { try { const { data } = await supabase.from('message_templates').select('*'); setMessageTemplates((data as MessageTemplate[]) ?? []); } catch { /* ignore */ } })();
  }, [loadClients]);

  const filtered = clients.filter((c) => {
    const matchesSearch =
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp: number;
    if (sortBy === 'code') {
      const na = parseInt(a.code.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.code.replace(/\D/g, ''), 10) || 0;
      cmp = na - nb;
      if (cmp === 0) cmp = a.code.localeCompare(b.code, undefined, { numeric: true });
    } else {
      cmp = a.full_name.localeCompare(b.full_name, 'pt-BR', { sensitivity: 'base' });
    }
    return sortDesc ? -cmp : cmp;
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, code: `CLI-${String(clients.length + 1).padStart(4, '0')}` });
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm(c);
    setModalOpen(true);
  };

  const addHistory = async (clientId: string, eventType: string, description: string) => {
    const { error } = await supabase.from('client_history').insert({ client_id: clientId, event_type: eventType, description });
    if (error) console.error('Erro ao registrar histórico:', error.message);
  };

  const lookupCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) { toast('CEP não encontrado', 'warning'); return; }
      setForm((prev) => ({
        ...prev,
        address: data.logradouro ?? prev.address,
        neighborhood: data.bairro ?? prev.neighborhood,
        city: data.localidade ?? prev.city,
        state: data.uf ?? prev.state,
      }));
      toast('Endereço preenchido pelo CEP', 'success');
    } catch {
      toast('Erro ao buscar CEP. Verifique sua conexão.', 'error');
    }
  };

  const cleanDate = (v: string | null | undefined): string | null => (v && v.trim() ? v : null);

  const performSave = async () => {
    return withSaving(async () => {
    const payload = {
      ...form,
      birth_date: cleanDate(form.birth_date),
      due_date: cleanDate(form.due_date),
      first_contact: cleanDate(form.first_contact),
    };
    if (editing) {
      const { error } = await supabase.from('clients').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast('Erro ao atualizar cliente', 'error'); return; }
      await addHistory(editing.id, 'alteracao', 'Cadastro alterado');
      toast('Cliente atualizado', 'success');
    } else {
      const { data, error } = await supabase.from('clients').insert(payload).select('*').maybeSingle();
      if (error) { toast('Erro ao cadastrar cliente', 'error'); return; }
      if (data) await addHistory((data as Client).id, 'cadastro', 'Cliente cadastrado');
      toast('Cliente cadastrado', 'success');
    }
    setModalOpen(false);
    loadClients();
    });
  };

  const handleSave = async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setValidationOpen(true);
      return;
    }
    if (!editing) {
      const dupes = await checkDuplicates();
      if (dupes.length > 0) {
        setDuplicateMatches(dupes);
        setDuplicateOpen(true);
        return;
      }
    }
    performSave();
  };

  const handleSaveAfterDupeReview = async () => {
    setDuplicateOpen(false);
    performSave();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('clients').delete().eq('id', deleteTarget.id);
    if (error) { toast('Erro ao excluir cliente', 'error'); return; }
    toast('Cliente excluído', 'success');
    setDeleteTarget(null);
    loadClients();
  };

  const openMerge = (source: Client) => {
    setMergeTarget({ source, target: source });
    setMergeStep('select');
    setMergeRelatedCounts(null);
  };

  const selectMergeTarget = async (target: Client) => {
    if (!mergeTarget || target.id === mergeTarget.source.id) return;
    setMergeTarget({ ...mergeTarget, target });
    setMergeStep('confirm');
    const [b, a, fe, fo, at, h, au] = await Promise.all([
      supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('client_id', mergeTarget.source.id),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('client_id', mergeTarget.source.id),
      supabase.from('financial_entries').select('id', { count: 'exact', head: true }).eq('client_id', mergeTarget.source.id),
      supabase.from('client_photo_folders').select('id', { count: 'exact', head: true }).eq('client_id', mergeTarget.source.id),
      supabase.from('client_attachments').select('id', { count: 'exact', head: true }).eq('client_id', mergeTarget.source.id),
      supabase.from('client_history').select('id', { count: 'exact', head: true }).eq('client_id', mergeTarget.source.id),
      supabase.from('image_authorizations').select('id', { count: 'exact', head: true }).eq('client_id', mergeTarget.source.id),
    ]);
    setMergeRelatedCounts({
      budgets: b.count ?? 0,
      appointments: a.count ?? 0,
      entries: fe.count ?? 0,
      folders: fo.count ?? 0,
      attachments: at.count ?? 0,
      history: h.count ?? 0,
      auths: au.count ?? 0,
    });
  };

  const performMerge = async () => {
    if (!mergeTarget) return;
    const { source, target } = mergeTarget;
    const tables = ['budgets', 'appointments', 'financial_entries', 'client_photo_folders', 'client_attachments', 'client_history', 'image_authorizations', 'service_orders', 'cash_transactions'];
    for (const table of tables) {
      await supabase.from(table).update({ client_id: target.id }).eq('client_id', source.id);
    }
    await addHistory(target.id, 'mesclagem', `Cliente ${source.code} (${source.full_name}) mesclado neste cadastro. Histórico, orçamentos, pagamentos e autorizações foram transferidos.`);
    await supabase.from('clients').delete().eq('id', source.id);
    await supabase.from('activity_log').insert({ action: 'merge_client', entity: 'clients', entity_id: target.id, description: `Cliente ${source.full_name} (${source.code}) mesclado em ${target.full_name} (${target.code})` });
    toast('Cadastros mesclados com sucesso. Todos os registros foram transferidos.', 'success');
    setMergeTarget(null);
    setMergeStep('select');
    setMergeRelatedCounts(null);
    loadClients();
  };

  const openDetail = async (c: Client) => {
    setDetailTarget(c);
    setDetailTab('info');
    const [folders, hist, attach, budgets, appts, auths] = await Promise.all([
      supabase.from('client_photo_folders').select('*').eq('client_id', c.id),
      supabase.from('client_history').select('*').eq('client_id', c.id).order('created_at', { ascending: false }),
      supabase.from('client_attachments').select('*').eq('client_id', c.id).order('attached_at', { ascending: false }),
      supabase.from('budgets').select('*').eq('client_id', c.id).order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').eq('client_id', c.id).order('appointment_date', { ascending: false }),
      supabase.from('image_authorizations').select('*').eq('client_id', c.id).order('created_at', { ascending: false }),
    ]);
    setPhotoFolders((folders.data as ClientPhotoFolder[]) ?? []);
    setHistory((hist.data as ClientHistory[]) ?? []);
    setAttachments((attach.data as ClientAttachment[]) ?? []);
    setClientBudgets((budgets.data as Budget[]) ?? []);
    setClientAppointments((appts.data as Appointment[]) ?? []);
    setClientAuths((auths.data as ImageAuthorization[]) ?? []);
  };

  const openWhatsapp = (c: Client) => {
    setWhatsappModal(c);
    const tpl = messageTemplates.find((t) => t.category === 'aniversario');
    const content = tpl?.content ?? 'Olá, {NOME}! Feliz aniversário!';
    setSelectedTemplate(tpl?.id ?? '');
    setMessageText(fillTemplate(content, {
      NOME: c.full_name,
      NOME_ESTUDIO: settings.studio_name,
    }));
  };

  const handleSendWhatsapp = (c: Client) => {
    const phone = c.whatsapp ?? c.phone ?? '';
    if (!phone) { toast('Cliente não possui telefone/WhatsApp cadastrado', 'warning'); return; }
    window.open(buildWhatsAppUrl(phone, messageText), '_blank');
    addHistory(c.id, 'mensagem', 'Mensagem de aniversário preparada para envio via WhatsApp');
    toast('WhatsApp aberto. Confirme o envio no aplicativo.', 'info');
    setWhatsappModal(null);
  };

  const addPhotoFolder = async () => {
    if (!detailTarget || !newFolderPath) { toast('Informe o caminho da pasta', 'warning'); return; }
    const { error } = await supabase.from('client_photo_folders').insert({
      client_id: detailTarget.id,
      folder_path: newFolderPath,
      authorization_status: newFolderStatus,
      authorization_notes: newFolderNotes,
      last_checked: toLocalISODate(new Date()),
    });
    if (error) { toast('Erro ao registrar pasta', 'error'); return; }
    await addHistory(detailTarget.id, 'pasta_fotos', `Pasta de fotos registrada: ${newFolderPath}`);
    toast('Pasta registrada', 'success');
    setNewFolderPath(''); setNewFolderStatus('pendente'); setNewFolderNotes('');
    openDetail(detailTarget);
  };

  const updateFolderStatus = async (folder: ClientPhotoFolder, status: string) => {
    await supabase.from('client_photo_folders').update({ authorization_status: status, updated_at: new Date().toISOString() }).eq('id', folder.id);
    if (status === 'revogada') {
      await addHistory(detailTarget!.id, 'autorizacao', `Autorização revogada para pasta: ${folder.folder_path}`);
      await supabase.from('client_history').insert({ client_id: detailTarget!.id, event_type: 'alerta', description: 'ALERTA: Autorização de uso de imagem revogada. Revise o uso futuro das fotografias.' });
      toast('Autorização revogada. Alerta registrado para revisão do uso das imagens.', 'warning');
    } else {
      toast('Status da autorização atualizado', 'success');
    }
    openDetail(detailTarget!);
  };

  const addAttachment = async () => {
    if (!detailTarget || !newAttachment.name || !newAttachment.file_path) { toast('Preencha nome e caminho do arquivo', 'warning'); return; }
    const ext = newAttachment.file_type || (newAttachment.file_path.split('.').pop() ?? '');
    if (ext && !isAllowedFileType(ext)) {
      toast(`Formato não permitido. Use: ${allowedExtensionsLabel()}`, 'warning');
      return;
    }
    let finalPath = newAttachment.file_path;
    if (newAttachment.mode === 'copied') {
      const destDir = settings.documents_folder || '';
      if (!destDir) {
        toast('Configure a pasta de documentos nas Configurações para usar o modo "copiar".', 'warning');
        return;
      }
      const copyResult = await nativeCopyFile(newAttachment.file_path, destDir);
      if (!copyResult.success || !copyResult.destPath) {
        toast('Erro ao copiar arquivo: ' + (copyResult.error ?? 'desconhecido'), 'error');
        return;
      }
      finalPath = copyResult.destPath;
      toast('Arquivo copiado para a pasta gerenciada', 'success');
    }
    const { error } = await supabase.from('client_attachments').insert({
      client_id: detailTarget.id,
      name: newAttachment.name,
      file_path: finalPath,
      file_type: ext.toUpperCase(),
      observations: newAttachment.observations,
      mode: newAttachment.mode,
    });
    if (error) { toast('Erro ao anexar documento', 'error'); return; }
    await addHistory(detailTarget.id, 'documento', `Documento anexado (${newAttachment.mode === 'copied' ? 'cópia' : 'referência'}): ${newAttachment.name}`);
    toast('Documento anexado', 'success');
    setNewAttachment({ name: '', file_path: '', file_type: '', observations: '', mode: 'referenced' });
    setAttachmentModal(false);
    openDetail(detailTarget);
  };

  const deleteAttachment = async (a: ClientAttachment) => {
    await supabase.from('client_attachments').delete().eq('id', a.id);
    toast('Anexo removido', 'success');
    openDetail(detailTarget!);
  };

  const pickAttachmentFile = async () => {
    const result = await nativeSelectFile();
    if (result.canceled || !result.filePath) return;
    const ext = result.fileExt ?? '';
    if (ext && !isAllowedFileType(ext)) {
      toast(`Formato .${ext} não permitido. Use: ${allowedExtensionsLabel()}`, 'warning');
      return;
    }
    setNewAttachment(prev => ({
      ...prev,
      file_path: result.filePath!,
      name: prev.name || (result.fileName ?? ''),
      file_type: ext ? ext.toUpperCase() : '',
    }));
  };

  const pickFolderPath = async (target: 'new' | 'edit') => {
    const result = await nativeSelectFolder();
    if (result.canceled || !result.folderPath) return;
    if (target === 'new') setNewFolderPath(result.folderPath);
    else setEditFolderPath(result.folderPath);
  };

  const verifyFolder = async (folder: ClientPhotoFolder) => {
    const exists = await nativePathExists(folder.folder_path);
    setFolderExistsCache(prev => ({ ...prev, [folder.id]: exists }));
    await supabase.from('client_photo_folders').update({ last_checked: toLocalISODate(new Date()) }).eq('id', folder.id);
    await addHistory(detailTarget!.id, 'pasta_fotos', `Verificação da pasta: ${folder.folder_path} — ${exists ? 'disponível' : 'não localizada'}`);
    if (!exists) toast('Pasta não localizada. O arquivo pode ter sido movido ou excluído.', 'warning');
    else toast('Pasta verificada e disponível', 'success');
    openDetail(detailTarget!);
  };

  const saveEditFolder = async () => {
    if (!editingFolder || !editFolderPath) { toast('Informe o caminho da pasta', 'warning'); return; }
    await supabase.from('client_photo_folders').update({
      folder_path: editFolderPath,
      authorization_status: editFolderStatus,
      authorization_notes: editFolderNotes,
      updated_at: new Date().toISOString(),
    }).eq('id', editingFolder.id);
    await addHistory(detailTarget!.id, 'pasta_fotos', `Caminho da pasta alterado: ${editFolderPath}`);
    toast('Pasta atualizada', 'success');
    setEditingFolder(null);
    openDetail(detailTarget!);
  };

  const verifyAttachment = async (a: ClientAttachment) => {
    const exists = await nativePathExists(a.file_path);
    setFileExistsCache(prev => ({ ...prev, [a.id]: exists }));
    if (!exists) toast('Arquivo não localizado. Pode ter sido movido ou excluído.', 'warning');
    else toast('Arquivo disponível', 'success');
  };

  const birthdaysUpcoming = clients.filter((c) => {
    if (!c.birth_date) return false;
    const d = daysUntil(`${new Date().getFullYear()}-${c.birth_date.slice(5)}`);
    return d >= 0 && d <= 30;
  });

  const tabs: { id: DetailTab; label: string; icon: typeof Eye }[] = [
    { id: 'info', label: 'Dados cadastrais', icon: Eye },
    { id: 'gestante', label: 'Gestante', icon: Baby },
    { id: 'photos', label: 'Pasta de fotos', icon: FolderOpen },
    { id: 'authorizations', label: `Autorizações${clientAuths.length > 0 ? ` (${clientAuths.length})` : ''}`, icon: ShieldCheck },
    { id: 'attachments', label: 'Documentos', icon: Paperclip },
    { id: 'history', label: 'Histórico', icon: History },
  ];

  const onCreateAuth = (c: Client) => {
    if (onCreateAuthorization) {
      onCreateAuthorization(c.id);
    } else if (onNavigate) {
      onNavigate('authorizations');
    }
  };

  const onViewAuth = (a: ImageAuthorization) => {
    if (onViewAuthorization) {
      onViewAuthorization(a.id);
    } else if (onNavigate) {
      onNavigate('authorizations');
    }
  };

  useEffect(() => {
    const loadAuthBadges = async () => {
      const { data } = await supabase.from('image_authorizations').select('client_id,status,end_date');
      const map: Record<string, { total: number; active: number; issues: number }> = {};
      const now = new Date();
      (data as { client_id: string; status: string; end_date: string | null }[] ?? []).forEach((a) => {
        if (a.status === 'substituido') return;
        if (!map[a.client_id]) map[a.client_id] = { total: 0, active: 0, issues: 0 };
        map[a.client_id].total++;
        if (a.status === 'autorizado' && !(a.end_date && new Date(a.end_date) < now)) map[a.client_id].active++;
        if (a.status === 'revogado' || a.status === 'expirado' || (a.status === 'autorizado' && a.end_date && new Date(a.end_date) < now)) map[a.client_id].issues++;
      });
      setAuthBadgeCount(map);
    };
    loadAuthBadges();
  }, [loadClients]);

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} cliente(s) cadastrado(s) · ${birthdaysUpcoming.length} aniversário(s) próximo(s)`}
        actions={
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo cliente
          </button>
        }
      />

      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-10" placeholder="Pesquisar por nome, código, telefone ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input sm:w-48" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
          <div className="flex gap-2">
            <select className="input sm:w-44" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'code' | 'name')}>
              <option value="code">Número do cliente</option>
              <option value="name">Nome (A–Z)</option>
            </select>
            <button type="button" onClick={() => setSortDesc((v) => !v)} className="btn-secondary px-3 whitespace-nowrap" title={sortDesc ? 'Decrescente' : 'Crescente'}>
              {sortDesc ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando...</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={<Users className="h-12 w-12" />} title="Nenhum cliente encontrado" description="Cadastre seu primeiro cliente para começar." action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Cadastrar cliente</button>} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Telefone</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Aniversário</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sorted.map((c) => {
                const bdayDays = c.birth_date ? daysUntil(`${new Date().getFullYear()}-${c.birth_date.slice(5)}`) : null;
                return (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{c.full_name}</p>
                          {c.social_name && <p className="text-xs text-slate-400">{c.social_name}</p>}
                        </div>
                        {bdayDays !== null && bdayDays === 0 && <span className="badge badge-warning">Aniversário hoje!</span>}
                        {bdayDays !== null && bdayDays > 0 && bdayDays <= 7 && <span className="badge badge-info">Aniv. em {bdayDays}d</span>}
                        {authBadgeCount[c.id]?.issues > 0 && <span className="badge badge-danger" title="Autorização vencida ou revogada"><ShieldAlert className="h-3 w-3 mr-1" />Autorização</span>}
                        {authBadgeCount[c.id]?.active > 0 && !authBadgeCount[c.id]?.issues && <span className="badge badge-success" title="Autorização ativa"><ShieldCheck className="h-3 w-3 mr-1" />Autorizada</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{formatDate(c.birth_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${c.status === 'ativo' ? 'badge-success' : 'badge-neutral'}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openDetail(c)} className="btn-ghost" title="Ver ficha"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => openWhatsapp(c)} className="btn-ghost text-green-600" title="WhatsApp"><MessageCircle className="h-4 w-4" /></button>
                        <button onClick={() => openEdit(c)} className="btn-ghost" title="Editar"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => openMerge(c)} className="btn-ghost text-slate-500" title="Mesclar com outro cadastro"><GitMerge className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteTarget(c)} className="btn-ghost text-red-500" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit/Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar cliente' : 'Novo cliente'} size="xl">
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border transition-colors ${form.person_type !== 'juridica' ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" name="personType" checked={form.person_type !== 'juridica'} onChange={() => setForm({ ...form, person_type: 'fisica' })} className="accent-teal-600" />
                <User className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pessoa física</span>
              </label>
              <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border transition-colors ${form.person_type === 'juridica' ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" name="personType" checked={form.person_type === 'juridica'} onChange={() => setForm({ ...form, person_type: 'juridica' })} className="accent-teal-600" />
                <Building2 className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pessoa jurídica</span>
              </label>
            </div>

            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Dados cadastrais</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="label">Código</label><input className="input" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div className="sm:col-span-2">
                <label className="label">{form.person_type === 'juridica' ? 'Nome fantasia / Nome para contato *' : 'Nome completo *'}</label>
                <input className="input" value={form.full_name ?? ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>

              {form.person_type === 'juridica' && (
                <>
                  <div className="sm:col-span-2"><label className="label">Razão social *</label><input className="input" value={form.legal_name ?? ''} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></div>
                  <div><label className="label">CNPJ</label><div className="flex gap-2"><input className="input" placeholder="00.000.000/0000-00" value={form.cnpj ?? ''} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /><button type="button" onClick={() => lookupCnpj(form.cnpj ?? '')} disabled={cnpjLoading} className="btn-secondary px-3 whitespace-nowrap">{cnpjLoading ? 'Buscando...' : 'Consultar'}</button></div></div>
                  <div><label className="label">Inscrição estadual</label><input className="input" value={form.state_registration ?? ''} onChange={(e) => setForm({ ...form, state_registration: e.target.value })} /></div>
                  <div><label className="label">Inscrição municipal</label><input className="input" value={form.municipal_registration ?? ''} onChange={(e) => setForm({ ...form, municipal_registration: e.target.value })} /></div>
                  <div><label className="label">Nome do responsável</label><input className="input" value={form.contact_person_name ?? ''} onChange={(e) => setForm({ ...form, contact_person_name: e.target.value })} /></div>
                  <div><label className="label">Telefone comercial</label><input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><label className="label">E-mail comercial</label><input className="input" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </>
              )}

              {form.person_type !== 'juridica' && (
                <>
                  <div><label className="label">Nome social</label><input className="input" value={form.social_name ?? ''} onChange={(e) => setForm({ ...form, social_name: e.target.value })} /></div>
                  <div><label className="label">CPF</label><input className="input" value={form.cpf ?? ''} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
                  <div><label className="label">Data de nascimento *</label><input type="date" className="input" value={form.birth_date ?? ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
                  <div><label className="label">Telefone</label><input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><label className="label">WhatsApp</label><input className="input" value={form.whatsapp ?? ''} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
                  <div><label className="label">E-mail</label><input className="input" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </>
              )}

              <div><label className="label">CEP</label><div className="flex gap-2"><input className="input" placeholder="00000-000" value={form.cep ?? ''} onChange={(e) => setForm({ ...form, cep: e.target.value })} onBlur={(e) => lookupCep(e.target.value)} /><button type="button" onClick={() => lookupCep(form.cep ?? '')} className="btn-secondary px-3">Buscar</button></div></div>
              <div className="sm:col-span-2"><label className="label">Endereço</label><input className="input" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><label className="label">Número</label><input className="input" value={form.address_number ?? ''} onChange={(e) => setForm({ ...form, address_number: e.target.value })} /></div>
              <div><label className="label">Complemento</label><input className="input" value={form.complement ?? ''} onChange={(e) => setForm({ ...form, complement: e.target.value })} /></div>
              <div><label className="label">Bairro</label><input className="input" value={form.neighborhood ?? ''} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></div>
              <div><label className="label">Cidade</label><input className="input" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><label className="label">Estado</label><input className="input" value={form.state ?? ''} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div><label className="label">Data do primeiro contato</label><input type="date" className="input" value={form.first_contact ?? ''} onChange={(e) => setForm({ ...form, first_contact: e.target.value })} /></div>
              <div><label className="label">Origem</label><input className="input" placeholder="Instagram, indicação..." value={form.origin ?? ''} onChange={(e) => setForm({ ...form, origin: e.target.value })} /></div>
              <div><label className="label">Status</label><select className="input" value={form.status ?? 'ativo'} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="label">Observações internas</label><textarea className="input min-h-[60px]" value={form.observations ?? ''} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></div>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Informações de gestante (opcional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="label">Data provável do parto</label><input type="date" className="input" value={form.due_date ?? ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              <div><label className="label">Nome do bebê</label><input className="input" value={form.baby_name ?? ''} onChange={(e) => setForm({ ...form, baby_name: e.target.value })} /></div>
              <div><label className="label">Tipo de ensaio desejado</label><input className="input" value={form.shoot_type ?? ''} onChange={(e) => setForm({ ...form, shoot_type: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="label">Preferências de cenários</label><input className="input" value={form.scenery_preferences ?? ''} onChange={(e) => setForm({ ...form, scenery_preferences: e.target.value })} /></div>
              <div><label className="label">Preferências de figurinos</label><input className="input" value={form.costume_preferences ?? ''} onChange={(e) => setForm({ ...form, costume_preferences: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="label">Referências enviadas</label><textarea className="input min-h-[50px]" value={form.references_notes ?? ''} onChange={(e) => setForm({ ...form, references_notes: e.target.value })} /></div>
              <div><label className="label">Nome do acompanhante</label><input className="input" value={form.companion_name ?? ''} onChange={(e) => setForm({ ...form, companion_name: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="label">Observações sobre poses e conforto</label><textarea className="input min-h-[50px]" value={form.pose_notes ?? ''} onChange={(e) => setForm({ ...form, pose_notes: e.target.value })} /></div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Salvando...' : (editing ? 'Salvar alterações' : 'Cadastrar cliente')}</button>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detailTarget} onClose={() => setDetailTarget(null)} title={detailTarget?.full_name ?? ''} size="xl">
        {detailTarget && (
          <div>
            <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setDetailTab(t.id)} className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detailTab === t.id ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`} style={detailTab === t.id ? { borderColor: 'var(--color-primary)' } : { borderColor: 'transparent' }}>
                    <Icon className="h-4 w-4" /> {t.label}
                  </button>
                );
              })}
            </div>

            {detailTab === 'info' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="Código" value={detailTarget.code} />
                <Field label="Nome social" value={detailTarget.social_name} />
                <Field label="CPF" value={detailTarget.cpf} />
                <Field label="Nascimento" value={formatDate(detailTarget.birth_date)} />
                <Field label="Telefone" value={detailTarget.phone} />
                <Field label="WhatsApp" value={detailTarget.whatsapp} />
                <Field label="E-mail" value={detailTarget.email} />
                <Field label="Endereço" value={[detailTarget.address, detailTarget.address_number, detailTarget.complement].filter(Boolean).join(', ')} />
                <Field label="Bairro" value={detailTarget.neighborhood} />
                <Field label="Cidade/UF" value={[detailTarget.city, detailTarget.state].filter(Boolean).join('/')} />
                <Field label="Primeiro contato" value={formatDate(detailTarget.first_contact)} />
                <Field label="Origem" value={detailTarget.origin} />
                <Field label="Status" value={detailTarget.status} />
                {detailTarget.observations && <div className="sm:col-span-2"><span className="text-slate-400 block">Observações:</span><p className="text-slate-700 dark:text-slate-300">{detailTarget.observations}</p></div>}
                {clientBudgets.length > 0 && (
                  <div className="sm:col-span-2 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span className="text-slate-400 block mb-2">Orçamentos ({clientBudgets.length})</span>
                    {clientBudgets.map((b) => (
                      <div key={b.id} className="flex justify-between text-slate-700 dark:text-slate-300 py-1"><span>{b.code} — {b.status}</span><span>{b.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                    ))}
                  </div>
                )}
                {clientAppointments.length > 0 && (
                  <div className="sm:col-span-2 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span className="text-slate-400 block mb-2">Agendamentos ({clientAppointments.length})</span>
                    {clientAppointments.slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-slate-700 dark:text-slate-300 py-1"><Calendar className="h-3 w-3 text-slate-400" /><span>{formatDate(a.appointment_date)} {a.start_time} — {a.title}</span></div>
                    ))}
                  </div>
                )}
                <div className="sm:col-span-2 flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button onClick={() => openWhatsapp(detailTarget)} className="btn-secondary text-green-600"><MessageCircle className="h-4 w-4" /> WhatsApp</button>
                </div>
              </div>
            )}

            {detailTab === 'gestante' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="Data provável do parto" value={formatDate(detailTarget.due_date)} />
                <Field label="Semana gestacional" value={calculateGestationalWeek(detailTarget.due_date)} />
                <Field label="Nome do bebê" value={detailTarget.baby_name} />
                <Field label="Tipo de ensaio" value={detailTarget.shoot_type} />
                <Field label="Preferências de cenários" value={detailTarget.scenery_preferences} />
                <Field label="Preferências de figurinos" value={detailTarget.costume_preferences} />
                <Field label="Acompanhante" value={detailTarget.companion_name} />
                {detailTarget.references_notes && <div className="sm:col-span-2"><span className="text-slate-400 block">Referências:</span><p className="text-slate-700 dark:text-slate-300">{detailTarget.references_notes}</p></div>}
                {detailTarget.pose_notes && <div className="sm:col-span-2"><span className="text-slate-400 block">Observações de poses:</span><p className="text-slate-700 dark:text-slate-300">{detailTarget.pose_notes}</p></div>}
                {!detailTarget.due_date && !detailTarget.baby_name && !detailTarget.shoot_type && (
                  <p className="sm:col-span-2 text-slate-400 text-center py-8">Nenhuma informação de gestante cadastrada para este cliente.</p>
                )}
              </div>
            )}

            {detailTab === 'photos' && (
              <div>
                <div className="card p-4 mb-4 bg-slate-50 dark:bg-slate-800/50">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Pasta de Fotos com Autorização de Uso de Imagem</h4>
                  <p className="text-xs text-slate-400 mb-3">O app não move, renomeia ou exclui fotografias. Apenas registra o caminho e o status da autorização.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="sm:col-span-2">
                      <label className="label">Caminho da pasta</label>
                      <div className="flex gap-2">
                        <input className="input" placeholder="Ex: C:\Fotos\Clientes\Maria" value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)} />
                        {isElectron() && <button type="button" onClick={() => pickFolderPath('new')} className="btn-secondary px-3 whitespace-nowrap"><FolderOpen className="h-4 w-4" /> Procurar</button>}
                      </div>
                    </div>
                    <div><label className="label">Status da autorização</label><select className="input" value={newFolderStatus} onChange={(e) => setNewFolderStatus(e.target.value)}><option value="pendente">Pendente</option><option value="autorizada">Autorizada</option><option value="restrita">Restrita</option><option value="revogada">Revogada</option><option value="expirada">Expirada</option></select></div>
                    <div><label className="label">Observações sobre permissões</label><input className="input" value={newFolderNotes} onChange={(e) => setNewFolderNotes(e.target.value)} /></div>
                  </div>
                  <button onClick={addPhotoFolder} className="btn-primary"><Plus className="h-4 w-4" /> Registrar pasta</button>
                </div>

                {photoFolders.length === 0 ? (
                  <EmptyState icon={<FolderOpen className="h-10 w-10" />} title="Nenhuma pasta registrada" description="Registre a pasta onde as fotografias autorizadas deste cliente estão armazenadas." />
                ) : (
                  <div className="space-y-3">
                    {photoFolders.map((f) => {
                      const exists = folderExistsCache[f.id];
                      const showNotFound = exists === false;
                      const isRevoked = f.authorization_status === 'revogada';
                      return (
                        <div key={f.id} className="card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900 dark:text-slate-100 break-all">{f.folder_path}</p>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`badge ${f.authorization_status === 'autorizada' ? 'badge-success' : f.authorization_status === 'pendente' ? 'badge-warning' : f.authorization_status === 'revogada' ? 'badge-danger' : 'badge-neutral'}`}>{f.authorization_status}</span>
                                <span className="text-xs text-slate-400">Última verificação: {formatDate(f.last_checked)}</span>
                                {showNotFound && <span className="badge badge-danger"><AlertTriangle className="h-3 w-3 mr-1" />Pasta não localizada</span>}
                                {isRevoked && <span className="badge badge-danger">Uso de imagem revogado — revise</span>}
                              </div>
                              {f.authorization_notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{f.authorization_notes}</p>}
                              {(() => { const linkedAuth = clientAuths.find((a) => a.photo_folder_id === f.id); if (linkedAuth) return (<p className="text-xs text-slate-500 dark:text-slate-400 mt-2"><ShieldCheck className="h-3 w-3 inline mr-1" />Vinculada ao documento {linkedAuth.doc_number} — {AUTH_STATUS_BADGE[linkedAuth.status]?.label ?? linkedAuth.status}</p>); return null; })()}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-3 border-t border-slate-100 dark:border-slate-700 pt-3 flex-wrap">
                            {isElectron() && <button onClick={() => nativeOpenPath(f.folder_path)} className="btn-ghost text-xs" title="Abrir no Explorador"><ExternalLink className="h-4 w-4" /> Abrir pasta</button>}
                            {isElectron() && <button onClick={() => verifyFolder(f)} className="btn-ghost text-xs" title="Verificar se existe"><RefreshCw className="h-4 w-4" /> Verificar</button>}
                            <button onClick={() => { setEditingFolder(f); setEditFolderPath(f.folder_path); setEditFolderStatus(f.authorization_status); setEditFolderNotes(f.authorization_notes ?? ''); }} className="btn-ghost text-xs" title="Editar caminho"><Pencil className="h-4 w-4" /> Editar</button>
                            <select className="input w-auto text-xs ml-auto" value={f.authorization_status} onChange={(e) => updateFolderStatus(f, e.target.value)}>
                              <option value="pendente">Pendente</option><option value="autorizada">Autorizada</option><option value="restrita">Restrita</option><option value="revogada">Revogada</option><option value="expirada">Expirada</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {editingFolder && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingFolder(null)} />
                    <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-2xl p-6">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Editar pasta de fotos</h3>
                      <div className="space-y-3">
                        <div><label className="label">Caminho da pasta</label><div className="flex gap-2"><input className="input" value={editFolderPath} onChange={(e) => setEditFolderPath(e.target.value)} />{isElectron() && <button type="button" onClick={() => pickFolderPath('edit')} className="btn-secondary px-3"><FolderOpen className="h-4 w-4" /></button>}</div></div>
                        <div><label className="label">Status da autorização</label><select className="input" value={editFolderStatus} onChange={(e) => setEditFolderStatus(e.target.value)}><option value="pendente">Pendente</option><option value="autorizada">Autorizada</option><option value="restrita">Restrita</option><option value="revogada">Revogada</option><option value="expirada">Expirada</option></select></div>
                        <div><label className="label">Observações</label><input className="input" value={editFolderNotes} onChange={(e) => setEditFolderNotes(e.target.value)} /></div>
                      </div>
                      <div className="flex justify-end gap-3 mt-4"><button onClick={() => setEditingFolder(null)} className="btn-secondary">Cancelar</button><button onClick={saveEditFolder} className="btn-primary">Salvar</button></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {detailTab === 'authorizations' && (
              <div>
                <div className="flex justify-end mb-3">
                  <button onClick={() => onCreateAuth(detailTarget)} className="btn-primary"><Plus className="h-4 w-4" /> Nova autorização</button>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">Modelos de autorização requerem revisão jurídica antes da utilização como documento definitivo.</p>
                {clientAuths.length === 0 ? (
                  <EmptyState icon={<ShieldCheck className="h-10 w-10" />} title="Nenhuma autorização registrada" description="Crie um termo de autorização de uso de imagem para este cliente." action={<button onClick={() => onCreateAuth(detailTarget)} className="btn-primary"><Plus className="h-4 w-4" /> Criar autorização</button>} />
                ) : (
                  <div className="space-y-3">
                    {clientAuths.map((a) => {
                      const isExpired = a.status === 'autorizado' && a.end_date && new Date(a.end_date) < new Date();
                      const sc = AUTH_STATUS_BADGE[a.status] ?? AUTH_STATUS_BADGE.rascunho;
                      return (
                        <div key={a.id} className="card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-mono text-xs text-slate-500">{a.doc_number}</p>
                                <span className={`badge ${sc.color}`}>{sc.label}</span>
                                <span className="text-xs text-slate-400">v{a.version}</span>
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{a.session_title ?? 'Ensaio não identificado'}</p>
                              <p className="text-xs text-slate-400 mt-1">Autorizante: {a.authorizer_name ?? '—'} · Vigência: {formatDate(a.start_date)} → {a.end_date ? formatDate(a.end_date) : 'indeterminado'}</p>
                              {isExpired && <span className="badge badge-danger mt-2"><AlertTriangle className="h-3 w-3 mr-1" />Vencida</span>}
                              {a.status === 'revogado' && <span className="badge badge-danger mt-2"><AlertTriangle className="h-3 w-3 mr-1" />Revogada — revise o uso das imagens</span>}
                            </div>
                            <button onClick={() => onViewAuth(a)} className="btn-ghost text-xs" title="Ver documento"><Eye className="h-4 w-4" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'attachments' && (
              <div>
                <div className="flex justify-end mb-3">
                  <button onClick={() => setAttachmentModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> Anexar documento</button>
                </div>
                {attachments.length === 0 ? (
                  <EmptyState icon={<Paperclip className="h-10 w-10" />} title="Nenhum documento anexado" description="Anexe contratos, autorizações, comprovantes e outros documentos do cliente." />
                ) : (
                  <div className="space-y-2">
                    {attachments.map((a) => {
                      const exists = fileExistsCache[a.id];
                      const showNotFound = exists === false;
                      return (
                        <div key={a.id} className="flex items-center justify-between card p-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{a.name}</p>
                              {a.file_type && <span className="badge badge-neutral text-xs">{a.file_type}</span>}
                              {a.mode === 'copied' ? <span className="badge badge-success text-xs">Cópia</span> : <span className="badge badge-info text-xs">Referência</span>}
                            </div>
                            <p className="text-xs text-slate-400 truncate mt-1">{a.file_path}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-slate-400">Anexado em {formatDate(a.attached_at)}</p>
                              {showNotFound && <span className="badge badge-danger text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Arquivo não localizado</span>}
                            </div>
                            {a.observations && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{a.observations}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isElectron() && <button onClick={() => nativeOpenPath(a.file_path)} className="btn-ghost" title="Abrir arquivo"><ExternalLink className="h-4 w-4" /></button>}
                            {isElectron() && <button onClick={() => verifyAttachment(a)} className="btn-ghost" title="Verificar se existe"><RefreshCw className="h-4 w-4" /></button>}
                            <button onClick={() => deleteAttachment(a)} className="btn-ghost text-red-500" title="Remover"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'history' && (
              <div>
                {history.length === 0 ? (
                  <EmptyState icon={<History className="h-10 w-10" />} title="Sem histórico" description="As atividades deste cliente aparecerão aqui." />
                ) : (
                  <div className="space-y-3">
                    {history.map((h) => (
                      <div key={h.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                          <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />
                        </div>
                        <div className="pb-4">
                          <p className="text-sm text-slate-900 dark:text-slate-100">{h.description}</p>
                          <p className="text-xs text-slate-400">{formatDate(h.created_at)} · {h.event_type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* WhatsApp Modal */}
      <Modal open={!!whatsappModal} onClose={() => setWhatsappModal(null)} title="Mensagem de aniversário" size="md">
        {whatsappModal && (
          <div className="space-y-4">
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-sm text-slate-600 dark:text-slate-300">Para: <strong>{whatsappModal.full_name}</strong></p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Telefone: {whatsappModal.whatsapp ?? whatsappModal.phone ?? 'Não cadastrado'}</p>
            </div>
            <div>
              <label className="label">Modelo de mensagem</label>
              <select className="input" value={selectedTemplate} onChange={(e) => {
                setSelectedTemplate(e.target.value);
                const tpl = messageTemplates.find((t) => t.id === e.target.value);
                if (tpl) setMessageText(fillTemplate(tpl.content, { NOME: whatsappModal.full_name, NOME_ESTUDIO: settings.studio_name }));
              }}>
                <option value="">Mensagem em branco</option>
                {messageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Mensagem</label>
              <textarea className="input min-h-[120px]" value={messageText} onChange={(e) => setMessageText(e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">Use {'{NOME}'} e {'{NOME_ESTUDIO}'} como campos automáticos.</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { navigator.clipboard.writeText(messageText); toast('Mensagem copiada', 'success'); }} className="btn-secondary"><Copy className="h-4 w-4" /> Copiar</button>
              <button onClick={() => handleSendWhatsapp(whatsappModal)} className="btn-primary bg-green-600 hover:bg-green-700" style={{ backgroundColor: '#16a34a' }}><MessageCircle className="h-4 w-4" /> Abrir WhatsApp</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Attachment Modal */}
      <Modal open={attachmentModal} onClose={() => setAttachmentModal(false)} title="Anexar documento" size="md">
        <div className="space-y-4">
          <div><label className="label">Nome do documento</label><input className="input" placeholder="Ex: Contrato assinado" value={newAttachment.name} onChange={(e) => setNewAttachment({ ...newAttachment, name: e.target.value })} /></div>
          <div>
            <label className="label">Arquivo</label>
            <div className="flex gap-2">
              <input className="input" placeholder="Selecione um arquivo..." value={newAttachment.file_path} onChange={(e) => setNewAttachment({ ...newAttachment, file_path: e.target.value, file_type: e.target.value.split('.').pop()?.toUpperCase() ?? '', name: newAttachment.name || (e.target.value.split(/[\\/]/).pop() ?? '') })} />
              {isElectron() && <button type="button" onClick={pickAttachmentFile} className="btn-secondary px-3 whitespace-nowrap"><FolderOpen className="h-4 w-4" /> Procurar</button>}
            </div>
            <p className="text-xs text-slate-400 mt-1">Formatos permitidos: {allowedExtensionsLabel()}</p>
          </div>
          <div>
            <label className="label">Modo de gerenciamento</label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input type="radio" name="attachMode" checked={newAttachment.mode === 'referenced'} onChange={() => setNewAttachment({ ...newAttachment, mode: 'referenced' })} className="mt-0.5 accent-teal-600" />
                <div><p className="text-sm font-medium text-slate-700 dark:text-slate-300">Referenciar no local original</p><p className="text-xs text-slate-400">O arquivo permanece onde está. Se for movido ou excluído, será exibido um aviso de não localizado.</p></div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input type="radio" name="attachMode" checked={newAttachment.mode === 'copied'} onChange={() => setNewAttachment({ ...newAttachment, mode: 'copied' })} className="mt-0.5 accent-teal-600" />
                <div><p className="text-sm font-medium text-slate-700 dark:text-slate-300">Copiar para pasta gerenciada</p><p className="text-xs text-slate-400">O arquivo é copiado para a pasta de documentos configurada no app. A cópia fica protegida mesmo se o original for excluído.</p></div>
              </label>
            </div>
            {newAttachment.mode === 'copied' && !settings.documents_folder && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Configure a pasta de documentos nas Configurações para usar este modo.</p>
            )}
          </div>
          <div><label className="label">Tipo do arquivo</label><input className="input" placeholder="PDF, JPG, PNG..." value={newAttachment.file_type} onChange={(e) => setNewAttachment({ ...newAttachment, file_type: e.target.value })} /></div>
          <div><label className="label">Observações</label><textarea className="input min-h-[60px]" value={newAttachment.observations} onChange={(e) => setNewAttachment({ ...newAttachment, observations: e.target.value })} /></div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setAttachmentModal(false)} className="btn-secondary">Cancelar</button>
            <button onClick={addAttachment} className="btn-primary">Anexar</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Excluir cliente" message={`Tem certeza que deseja excluir "${deleteTarget?.full_name}"? Todos os dados vinculados (orçamentos, anexos, pastas) também serão removidos.`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />

      <ValidationDialog
        open={validationOpen}
        errors={validationErrors}
        onCorrect={() => { setValidationOpen(false); setModalOpen(true); }}
        onBack={() => setValidationOpen(false)}
      />

      {/* Duplicate detection modal */}
      <Modal open={duplicateOpen} onClose={() => setDuplicateOpen(false)} title="Possível cliente duplicado" size="md">
        {duplicateMatches.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Encontramos cadastros que podem ser duplicatas deste cliente. Revise antes de continuar:
            </p>
            <div className="space-y-2">
              {duplicateMatches.map((d) => (
                <div key={d.id} className="card p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{d.full_name}</p>
                    <p className="text-xs text-slate-400">{d.code} · {d.phone ?? 'Sem telefone'} · {d.email ?? 'Sem e-mail'}</p>
                  </div>
                  <button onClick={() => { setDuplicateOpen(false); setModalOpen(false); openDetail(d); }} className="btn-ghost text-xs">Ver ficha</button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button onClick={() => setDuplicateOpen(false)} className="btn-secondary">Voltar ao formulário</button>
              <button onClick={handleSaveAfterDupeReview} className="btn-primary">Cadastrar mesmo assim</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Merge modal */}
      <Modal open={!!mergeTarget} onClose={() => { setMergeTarget(null); setMergeStep('select'); setMergeRelatedCounts(null); }} title="Mesclar cadastros duplicados" size="md">
        {mergeTarget && (
          <div className="space-y-4">
            {mergeStep === 'select' && (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Selecione qual cadastro será mantido como destino da mesclagem. O cadastro de <strong>{mergeTarget.source.full_name}</strong> ({mergeTarget.source.code}) será removido e todos os seus registros transferidos.
                </p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {clients.filter((c) => c.id !== mergeTarget.source.id).map((c) => (
                    <button key={c.id} onClick={() => selectMergeTarget(c)} className="card p-3 w-full text-left hover:border-teal-400 transition-colors">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{c.full_name}</p>
                      <p className="text-xs text-slate-400">{c.code} · {c.phone ?? 'Sem telefone'} · {c.email ?? 'Sem e-mail'}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
            {mergeStep === 'confirm' && mergeRelatedCounts && (
              <>
                <div className="card p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-1">Confirme a mesclagem</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Origem: <strong>{mergeTarget.source.full_name}</strong> ({mergeTarget.source.code})<br />
                    Destino: <strong>{mergeTarget.target.full_name}</strong> ({mergeTarget.target.code})<br />
                    O cadastro de origem será removido. Esta operação não pode ser desfeita.
                  </p>
                </div>
                <div className="card p-3">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Registros que serão transferidos:</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Orçamentos:</span><span className="font-medium">{mergeRelatedCounts.budgets}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Agendamentos:</span><span className="font-medium">{mergeRelatedCounts.appointments}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Contas a receber:</span><span className="font-medium">{mergeRelatedCounts.entries}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Pastas de fotos:</span><span className="font-medium">{mergeRelatedCounts.folders}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Documentos:</span><span className="font-medium">{mergeRelatedCounts.attachments}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Autorizações:</span><span className="font-medium">{mergeRelatedCounts.auths}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Histórico:</span><span className="font-medium">{mergeRelatedCounts.history}</span></div>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setMergeStep('select')} className="btn-secondary">Voltar</button>
                  <button onClick={performMerge} className="btn-primary" style={{ backgroundColor: '#0d9488' }}><GitMerge className="h-4 w-4" /> Confirmar mesclagem</button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-slate-400 block text-xs">{label}</span>
      <span className="text-slate-700 dark:text-slate-300">{value || '—'}</span>
    </div>
  );
}
