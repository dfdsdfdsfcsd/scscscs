import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import {
  Building2,
  Save,
  Palette,
  Bell,
  FolderOpen,
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Upload,
  X,
  AlertCircle,
  Sparkles,
  ExternalLink,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import type { Settings as SettingsType, MessageTemplate, CashAuditLog } from '@/lib/types';
import { createPasswordHash, verifyPassword, isLockedOut, recordFailedAttempt, resetAttempts, getRemainingAttempts } from '@/lib/cashSecurity';
import { isElectron, nativeSelectLogo, nativeReadLogoAsDataURL, nativeRemoveLogo } from '@/lib/nativeFile';
import { isGDriveAvailable, connectGDrive, disconnectGDrive, getGDriveStatus, getGDriveRootUrl } from '@/lib/googleDrive';

const colorPresets = [
  { primary: '#0f766e', accent: '#f59e0b', name: 'Esmeralda' },
  { primary: '#1e40af', accent: '#f59e0b', name: 'Azul profissional' },
  { primary: '#9d174d', accent: '#f59e0b', name: 'Rosa estúdio' },
  { primary: '#854d0e', accent: '#0f766e', name: 'Dourado' },
  { primary: '#1f2937', accent: '#f59e0b', name: 'Grafite' },
  { primary: '#0c4a6e', accent: '#f59e0b', name: 'Azul profundo' },
];

type Tab = 'identity' | 'appearance' | 'preferences' | 'templates' | 'cashSecurity' | 'ai' | 'gdrive';

export function SettingsPage() {
  const { settings, loading, save } = useSettings();
  const [form, setForm] = useState<SettingsType>(settings);
  const [tab, setTab] = useState<Tab>('identity');
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplEditing, setTplEditing] = useState<MessageTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ name: '', content: '', category: 'aniversario' });
  const [tplDelete, setTplDelete] = useState<MessageTemplate | null>(null);
  const [cashPassword, setCashPassword] = useState('');
  const [cashPasswordConfirm, setCashPasswordConfirm] = useState('');
  const [cashCurrentPassword, setCashCurrentPassword] = useState('');
  const [cashShowPassword, setCashShowPassword] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashAuditLogs, setCashAuditLogs] = useState<CashAuditLog[]>([]);
  const [cashLockedMsg, setCashLockedMsg] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [gdriveStatus, setGdriveStatus] = useState<{ connected: boolean; email?: string }>({ connected: false });
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [gdriveRootUrl, setGdriveRootUrl] = useState<string | null>(null);

  useEffect(() => {
    if (form.logo_url) {
      setLogoPreview(form.logo_url);
    } else {
      setLogoPreview(null);
    }
  }, [form.logo_url]);

  const handleSelectLogo = async () => {
    if (!isElectron()) {
      toast('A seleção de arquivo está disponível apenas no aplicativo desktop. Você ainda pode colar uma URL de imagem abaixo.', 'warning');
      return;
    }
    setLogoUploading(true);
    try {
      const result = await nativeSelectLogo();
      if (result.canceled) {
        if (result.error) toast(result.error, 'error');
        setLogoUploading(false);
        return;
      }
      if (result.logoPath) {
        const dataRes = await nativeReadLogoAsDataURL(result.logoPath);
        if (dataRes.success && dataRes.dataURL) {
          setForm((prev) => ({ ...prev, logo_url: dataRes.dataURL ?? null }));
          setLogoPreview(dataRes.dataURL);
          toast('Logomarca carregada. Clique em "Salvar configurações" para confirmar.', 'success');
        } else {
          toast('Erro ao ler o arquivo de imagem', 'error');
        }
      }
    } catch {
      toast('Erro ao selecionar logomarca', 'error');
    }
    setLogoUploading(false);
  };

  const handleRemoveLogo = async () => {
    setForm((prev) => ({ ...prev, logo_url: null }));
    setLogoPreview(null);
    toast('Logomarca removida. Clique em "Salvar configurações" para confirmar.', 'info');
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
        address: data.logradouro ? `${data.logradouro}${data.complemento ? ', ' + data.complemento : ''}` : prev.address,
      }));
      toast('Endereço preenchido pelo CEP', 'success');
    } catch {
      toast('Erro ao buscar CEP. Verifique sua conexão.', 'error');
    }
  };

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    supabase.from('message_templates').select('*').order('name').then(({ data }) => {
      setTemplates((data as MessageTemplate[]) ?? []);
    });
  }, []);

  useEffect(() => {
    if (tab === 'cashSecurity') {
      supabase.from('cash_audit_logs').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => {
        setCashAuditLogs((data as CashAuditLog[]) ?? []);
      });
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'gdrive') {
      getGDriveStatus().then(setGdriveStatus);
      getGDriveRootUrl().then((res) => { if (res.success && res.url) setGdriveRootUrl(res.url); });
    }
  }, [tab]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400">Carregando configurações...</div>;
  }

  const openTplNew = () => {
    setTplEditing(null);
    setTplForm({ name: '', content: '', category: 'aniversario' });
    setTplModalOpen(true);
  };

  const openTplEdit = (t: MessageTemplate) => {
    setTplEditing(t);
    setTplForm({ name: t.name, content: t.content, category: t.category });
    setTplModalOpen(true);
  };

  const handleTplSave = async () => {
    if (!tplForm.name.trim() || !tplForm.content.trim()) {
      toast('Preencha nome e conteúdo', 'warning');
      return;
    }
    if (tplEditing) {
      const { error } = await supabase.from('message_templates').update(tplForm).eq('id', tplEditing.id);
      if (error) { toast('Erro ao atualizar modelo', 'error'); return; }
      toast('Modelo atualizado', 'success');
    } else {
      const { error } = await supabase.from('message_templates').insert(tplForm);
      if (error) { toast('Erro ao criar modelo', 'error'); return; }
      toast('Modelo criado', 'success');
    }
    setTplModalOpen(false);
    supabase.from('message_templates').select('*').order('name').then(({ data }) => setTemplates((data as MessageTemplate[]) ?? []));
  };

  const handleTplDelete = async () => {
    if (!tplDelete) return;
    const { error } = await supabase.from('message_templates').delete().eq('id', tplDelete.id);
    if (error) { toast('Erro ao excluir modelo', 'error'); return; }
    toast('Modelo excluído', 'success');
    setTplDelete(null);
    supabase.from('message_templates').select('*').order('name').then(({ data }) => setTemplates((data as MessageTemplate[]) ?? []));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(form);
      toast('Configurações salvas com sucesso', 'success');
    } catch {
      toast('Erro ao salvar configurações. Tente novamente.', 'error');
    }
    setSaving(false);
  };

  const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
    { id: 'identity', label: 'Identidade do estúdio', icon: Building2 },
    { id: 'appearance', label: 'Aparência', icon: Palette },
    { id: 'preferences', label: 'Preferências', icon: FolderOpen },
    { id: 'templates', label: 'Modelos de mensagem', icon: MessageSquare },
    { id: 'cashSecurity', label: 'Segurança do Caixa', icon: Lock },
    { id: 'ai', label: 'Inteligência Artificial', icon: Sparkles },
    { id: 'gdrive', label: 'Google Drive', icon: Cloud },
  ];

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Personalize o aplicativo de acordo com o seu estúdio"
        actions={
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        }
      />

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'
              }`}
              style={tab === t.id ? { borderColor: 'var(--color-primary)' } : { borderColor: 'transparent' }}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'identity' && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Dados do estúdio</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nome empresarial</label>
              <input className="input" value={form.studio_name} onChange={(e) => setForm({ ...form, studio_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Nome fantasia</label>
              <input className="input" value={form.fantasy_name ?? ''} onChange={(e) => setForm({ ...form, fantasy_name: e.target.value })} />
            </div>
            <div>
              <label className="label">CNPJ ou CPF (opcional)</label>
              <input className="input" value={form.tax_id ?? ''} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input className="input" value={form.whatsapp ?? ''} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">CEP do estúdio</label>
              <div className="flex gap-2">
                <input className="input" placeholder="00000-000" value={form.cep ?? ''} onChange={(e) => setForm({ ...form, cep: e.target.value })} onBlur={(e) => lookupCep(e.target.value)} />
                <button type="button" onClick={() => lookupCep(form.cep ?? '')} className="btn-secondary px-3 whitespace-nowrap">Buscar CEP</button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Endereço</label>
              <input className="input" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Logomarca do estúdio</label>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-32 h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-800/50">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Prévia da logomarca" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={handleSelectLogo} disabled={logoUploading} className="btn-secondary text-sm">
                      {logoUploading ? <><AlertCircle className="h-4 w-4 animate-spin" /> Carregando...</> : <><Upload className="h-4 w-4" /> {logoPreview ? 'Substituir logo' : 'Selecionar logo'}</>}
                    </button>
                    {logoPreview && (
                      <button type="button" onClick={handleRemoveLogo} className="btn-ghost text-sm text-red-500">
                        <X className="h-4 w-4" /> Remover
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {isElectron() ? 'Selecione um arquivo PNG, JPG, JPEG ou SVG do seu computador. A imagem é guardada permanentemente no aplicativo.' : 'O seletor de arquivo está disponível no aplicativo desktop. Alternativamente, informe a URL da imagem abaixo.'}
                  </p>
                  {!isElectron() && (
                    <input className="input text-sm mt-2" placeholder="https://..." value={form.logo_url ?? ''} onChange={(e) => { setForm({ ...form, logo_url: e.target.value || null }); setLogoPreview(e.target.value || null); }} />
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-400">A logo aparecerá em orçamentos, autorizações e documentos gerados.</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Tema</h3>
            <div className="flex gap-4">
              <button
                onClick={() => setForm({ ...form, theme: 'light' })}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${form.theme === 'light' ? 'border-slate-800' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <div className="h-16 w-24 rounded-lg bg-white border border-slate-200" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Claro</span>
              </button>
              <button
                onClick={() => setForm({ ...form, theme: 'dark' })}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${form.theme === 'dark' ? 'border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <div className="h-16 w-24 rounded-lg bg-slate-900 border border-slate-700" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Escuro</span>
              </button>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Cores do aplicativo</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {colorPresets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setForm({ ...form, primary_color: preset.primary, accent_color: preset.accent })}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${form.primary_color === preset.primary ? 'border-slate-400 dark:border-slate-500' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <div className="flex gap-1">
                    <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: preset.primary }} />
                    <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: preset.accent }} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{preset.name}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Cor principal</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-10 w-16 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer" />
                  <input className="input" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Cor de destaque</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-10 w-16 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer" />
                  <input className="input" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'preferences' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Preferências gerais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Duração padrão dos serviços (minutos)</label>
                <input type="number" className="input" value={form.default_duration_min} onChange={(e) => setForm({ ...form, default_duration_min: parseInt(e.target.value) || 60 })} />
              </div>
              <div>
                <label className="label">Antecedência dos lembretes (dias)</label>
                <input type="number" className="input" value={form.alert_advance_days} onChange={(e) => setForm({ ...form, alert_advance_days: parseInt(e.target.value) || 7 })} />
              </div>
              <div>
                <label className="label">Horários de funcionamento</label>
                <input className="input" placeholder="Ex: Seg-Sex 9h-18h, Sáb 9h-13h" value={form.business_hours ?? ''} onChange={(e) => setForm({ ...form, business_hours: e.target.value })} />
              </div>
              <div>
                <label className="label">Pasta padrão para documentos</label>
                <input className="input" placeholder="Caminho no computador" value={form.documents_folder ?? ''} onChange={(e) => setForm({ ...form, documents_folder: e.target.value })} />
              </div>
              <div>
                <label className="label">Pasta padrão para exportações</label>
                <input className="input" placeholder="Caminho no computador" value={form.exports_folder ?? ''} onChange={(e) => setForm({ ...form, exports_folder: e.target.value })} />
              </div>
              <div>
                <label className="label">Pasta de backup</label>
                <input className="input" placeholder="Caminho no computador" value={form.backup_folder ?? ''} onChange={(e) => setForm({ ...form, backup_folder: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Alertas</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.alerts_enabled} onChange={(e) => setForm({ ...form, alerts_enabled: e.target.checked })} className="h-5 w-5 rounded accent-teal-600" />
              <span className="text-sm text-slate-700 dark:text-slate-300">Habilitar alertas de aniversários, agendamentos e vencimentos</span>
            </label>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Termos de cancelamento e reagendamento</h3>
            <p className="text-sm text-slate-400 mb-4">Estes textos aparecem automaticamente nos orçamentos impressos e podem ser inseridos em contratos e documentos usando os campos <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{`{TERMOS_CANCELAMENTO}`}</code> e <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{`{TERMOS_REAGENDAMENTO}`}</code>.</p>
            <div className="space-y-4">
              <div>
                <label className="label">Termos de cancelamento</label>
                <textarea className="input min-h-[100px]" placeholder="Ex: O cancelamento deve ser solicitado com no mínimo 48h de antecedência. Cancelamentos com menos de 24h implicam na perda do sinal. Reembolsos são processados em até 7 dias úteis." value={form.cancellation_rules ?? ''} onChange={(e) => setForm({ ...form, cancellation_rules: e.target.value })} />
              </div>
              <div>
                <label className="label">Termos de reagendamento</label>
                <textarea className="input min-h-[100px]" placeholder="Ex: O reagendamento pode ser feito com até 24h de antecedência, sujeito à disponibilidade de agenda. No máximo 2 reagendamentos por ensaio sem cobrança adicional." value={form.reschedule_rules ?? ''} onChange={(e) => setForm({ ...form, reschedule_rules: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      )}
      {tab === 'cashSecurity' && (
        <div className='space-y-6'>
          <div className='card p-6'>
            <div className='flex items-center justify-between mb-4'>
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 rounded-xl flex items-center justify-center text-white' style={{ backgroundColor: 'var(--color-primary)' }}><Lock className='h-5 w-5' /></div>
                <div>
                  <h3 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>Segurança do Caixa</h3>
                  <p className='text-sm text-slate-400'>Proteja a abertura e fechamento do caixa com senha administrativa</p>
                </div>
              </div>
            </div>

            <div className='rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4 mb-4'>
              <label className='flex items-center gap-3 cursor-pointer'>
                <input type='checkbox' checked={form.cash_security_enabled} onChange={(e) => { setForm({ ...form, cash_security_enabled: e.target.checked }); if (!e.target.checked) { setCashPassword(''); setCashPasswordConfirm(''); setCashCurrentPassword(''); } }} className='h-5 w-5 rounded accent-teal-600' />
                <div>
                  <span className='text-sm font-medium text-slate-700 dark:text-slate-300'>Exigir senha para abrir e fechar o caixa</span>
                  <p className='text-xs text-slate-400 mt-0.5'>Quando ativado, toda operação de caixa exigirá a senha administrativa</p>
                </div>
              </label>
            </div>

            {form.cash_security_enabled && (
              <div className='space-y-4'>
                <div className='rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300'>
                  <ShieldCheck className='h-4 w-4 flex-shrink-0' />
                  {settings.cash_password_hash ? 'Senha já configurada. Use os campos abaixo para alterar.' : 'Nenhuma senha cadastrada ainda. Crie sua senha administrativa abaixo.'}
                </div>

                {settings.cash_password_hash && (
                  <div>
                    <label className='label'>Senha atual *</label>
                    <div className='relative'>
                      <input type={cashShowPassword ? 'text' : 'password'} className='input pr-10' placeholder='Digite a senha atual' value={cashCurrentPassword} onChange={(e) => setCashCurrentPassword(e.target.value)} />
                      <button type='button' onClick={() => setCashShowPassword(!cashShowPassword)} className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600'>{cashShowPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}</button>
                    </div>
                  </div>
                )}

                <div>
                  <label className='label'>{settings.cash_password_hash ? 'Nova senha *' : 'Senha administrativa *'}</label>
                  <input type={cashShowPassword ? 'text' : 'password'} className='input' placeholder='Mínimo 4 caracteres' value={cashPassword} onChange={(e) => setCashPassword(e.target.value)} />
                </div>
                <div>
                  <label className='label'>Confirmar senha *</label>
                  <input type={cashShowPassword ? 'text' : 'password'} className='input' placeholder='Repita a senha' value={cashPasswordConfirm} onChange={(e) => setCashPasswordConfirm(e.target.value)} />
                </div>

                {cashPassword && cashPasswordConfirm && cashPassword !== cashPasswordConfirm && (
                  <div className='rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300'>As senhas não coincidem.</div>
                )}

                <button
                  onClick={async () => {
                    if (cashPassword.length < 4) { toast('A senha deve ter no mínimo 4 caracteres', 'warning'); return; }
                    if (cashPassword !== cashPasswordConfirm) { toast('As senhas não coincidem', 'warning'); return; }
                    if (settings.cash_password_hash) {
                      const ok = await verifyPassword(cashCurrentPassword, settings.cash_password_hash, settings.cash_password_salt ?? '');
                      if (!ok) { toast('Senha atual incorreta', 'error'); return; }
                    }
                    setCashSaving(true);
                    try {
                      const { hash, salt } = await createPasswordHash(cashPassword);
                      await save({ cash_password_hash: hash, cash_password_salt: salt, cash_security_enabled: true });
                      toast('Senha do caixa salva com sucesso', 'success');
                      setCashPassword(''); setCashPasswordConfirm(''); setCashCurrentPassword('');
                      resetAttempts();
                    } catch { toast('Erro ao salvar senha', 'error'); }
                    setCashSaving(false);
                  }}
                  disabled={cashSaving || (cashPassword !== cashPasswordConfirm) || cashPassword.length < 4}
                  className='btn-primary'
                >
                  <Lock className='h-4 w-4' />
                  {cashSaving ? 'Salvando...' : settings.cash_password_hash ? 'Alterar senha' : 'Cadastrar senha'}
                </button>
              </div>
            )}

            {cashLockedMsg && <div className='rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300'>{cashLockedMsg}</div>}
          </div>

          {form.cash_security_enabled && settings.cash_password_hash && (
            <div className='card p-6'>
              <h3 className='text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4'>Histórico de operações</h3>
              {cashAuditLogs.length === 0 ? (
                <p className='text-sm text-slate-400 text-center py-6'>Nenhuma operação registrada ainda.</p>
              ) : (
                <div className='space-y-2 max-h-72 overflow-y-auto'>
                  {cashAuditLogs.map((log) => (
                    <div key={log.id} className='flex items-center justify-between text-sm border-b border-slate-100 dark:border-slate-700 pb-2'>
                      <div>
                        <span className={`badge text-xs ${log.success ? 'badge-success' : 'badge-danger'}`}>{log.success ? 'Sucesso' : 'Bloqueado'}</span>
                        <span className='ml-2 text-slate-700 dark:text-slate-300'>{log.operation}</span>
                        {log.responsible && <span className='text-xs text-slate-400 ml-2'>— {log.responsible}</span>}
                        {log.failure_reason && <span className='text-xs text-red-500 ml-2'>({log.failure_reason})</span>}
                      </div>
                      <span className='text-xs text-slate-400'>{new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Modelos de mensagem</h3>
              <p className="text-sm text-slate-400 mt-1">Modelos para envio via WhatsApp. Use <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{`{NOME}`}</code> para o nome do cliente e <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{`{NOME_ESTUDIO}`}</code> para o estúdio.</p>
            </div>
            <button onClick={openTplNew} className="btn-primary">
              <Plus className="h-4 w-4" /> Novo modelo
            </button>
          </div>
          {templates.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title="Nenhum modelo cadastrado"
              description="Crie modelos de mensagem para aniversários, lembretes e confirmações."
              action={<button onClick={openTplNew} className="btn-primary"><Plus className="h-4 w-4" /> Criar modelo</button>}
            />
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <div key={t.id} className="card p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">{t.name}</h4>
                      <span className="badge badge-neutral text-xs">{t.category}</span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{t.content}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openTplEdit(t)} className="btn-ghost" title="Editar"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setTplDelete(t)} className="btn-ghost text-red-500" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={tplModalOpen} onClose={() => setTplModalOpen(false)} title={tplEditing ? 'Editar modelo' : 'Novo modelo de mensagem'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Nome do modelo *</label>
            <input className="input" placeholder="Ex: Aniversário, Confirmação de ensaio..." value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={tplForm.category} onChange={(e) => setTplForm({ ...tplForm, category: e.target.value })}>
              <option value="aniversario">Aniversário</option>
              <option value="confirmacao">Confirmação</option>
              <option value="lembrete">Lembrete</option>
              <option value="agradecimento">Agradecimento</option>
              <option value="outros">Outros</option>
            </select>
          </div>
          <div>
            <label className="label">Conteúdo da mensagem *</label>
            <textarea className="input min-h-[120px]" placeholder="Olá {NOME}, o {NOME_ESTUDIO} deseja um feliz aniversário!" value={tplForm.content} onChange={(e) => setTplForm({ ...tplForm, content: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">Variáveis: {`{NOME}`}, {`{NOME_ESTUDIO}`}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setTplModalOpen(false)} className="btn-secondary">Cancelar</button>
          <button onClick={handleTplSave} className="btn-primary">{tplEditing ? 'Salvar' : 'Criar modelo'}</button>
        </div>
      </Modal>

      {tab === 'ai' && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inteligência Artificial (Google Gemini)</h3>
                <p className="text-sm text-slate-400">Configure a API do Google Gemini para usar o assistente de IA no CRM</p>
              </div>
            </div>

            <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4 mb-4">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Como configurar</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-slate-500 dark:text-slate-400">
                <li>Acesse o Google AI Studio em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline inline-flex items-center gap-1">aistudio.google.com/apikey <ExternalLink className="h-3 w-3" /></a></li>
                <li>Faça login com sua conta Google e clique em "Create API key"</li>
                <li>Selecione o projeto Google Cloud (ou crie um novo)</li>
                <li>Copie a chave gerada (começa com "AIza...")</li>
                <li>Cole a chave no campo abaixo e clique em "Salvar chave"</li>
              </ol>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                A chave fica armazenada com segurança no servidor (Supabase Edge Function) e nunca é exposta no navegador, no localStorage ou no código do aplicativo.
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Modelo e limites gratuitos</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                O aplicativo usa o modelo <strong>gemini-2.0-flash</strong>, disponível no nível gratuito do Google AI. Os limites de uso (requisições por minuto e por dia) podem variar — consulte a documentação oficial em{' '}
                <a href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline inline-flex items-center gap-1">ai.google.dev/gemini-api/docs/models <ExternalLink className="h-3 w-3" /></a>{' '}
                para confirmar disponibilidade e condições atuais. O aplicativo nunca ativa cobranças automaticamente nem alterna para serviços pagos sem sua autorização.
              </p>
            </div>

            <GeminiKeyConfig />
          </div>

          <div className="card p-6">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Privacidade e proteção de dados</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Dados sensíveis (CPF, CNPJ, telefone, endereço, e-mail) são automaticamente removidos antes do envio</li>
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> A IA apenas sugere textos — nenhuma alteração é feita automaticamente em cadastros, pagamentos, contratos ou compromissos</li>
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Todas as sugestões devem ser revisadas pelo usuário antes de serem utilizadas</li>
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Os dados são processados pelo Google Gemini (serviço externo) conforme os termos do Google AI</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'gdrive' && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Google Drive</h3>
                <p className="text-sm text-slate-400">Conecte sua conta Google para sincronizar documentos automaticamente</p>
              </div>
            </div>

            {!isGDriveAvailable() && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 mb-4">
                <p className="text-sm text-amber-700 dark:text-amber-300">A conexão com Google Drive está disponível apenas no aplicativo desktop. O aplicativo continua funcionando normalmente sem essa integração.</p>
              </div>
            )}

            {gdriveStatus.connected ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Conectado como {gdriveStatus.email}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Escopo: apenas arquivos criados pelo aplicativo (drive.file)</p>
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.gdrive_auto_sync} onChange={(e) => { setForm({ ...form, gdrive_auto_sync: e.target.checked }); }} className="h-5 w-5 rounded accent-teal-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Enviar documentos automaticamente ao Google Drive após salvar</span>
                </label>

                {form.gdrive_last_sync && <p className="text-xs text-slate-400">Último envio confirmado: {form.gdrive_last_sync}</p>}

                <div className="flex gap-2 flex-wrap">
                  {gdriveRootUrl && <button onClick={() => window.open(gdriveRootUrl, '_blank')} className="btn-secondary text-sm"><ExternalLink className="h-4 w-4" /> Abrir pasta principal</button>}
                  <button onClick={async () => {
                    await disconnectGDrive();
                    await save({ gdrive_connected: false, gdrive_account_email: null, gdrive_auto_sync: false });
                    setGdriveStatus({ connected: false });
                    setGdriveRootUrl(null);
                    toast('Google Drive desconectado. Arquivos já enviados não foram removidos.', 'info');
                  }} className="btn-secondary text-sm text-red-500"><CloudOff className="h-4 w-4" /> Desconectar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Ao conectar, o aplicativo irá:</p>
                  <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                    <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Solicitar autorização OAuth segura com PKCE — sua senha Google não é solicitada</li>
                    <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Acessar apenas arquivos criados por este aplicativo (escopo drive.file)</li>
                    <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Organizar documentos em pastas por categoria, ano e cliente</li>
                    <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Não criar links públicos automaticamente</li>
                  </ul>
                </div>
                <button onClick={async () => {
                  setGdriveConnecting(true);
                  try {
                    const res = await connectGDrive();
                    if (res.success) {
                      await save({ gdrive_connected: true, gdrive_account_email: res.email ?? null });
                      setGdriveStatus({ connected: true, email: res.email });
                      toast(`Conectado como ${res.email}`, 'success');
                      const rootRes = await getGDriveRootUrl();
                      if (rootRes.success && rootRes.url) {
                        setGdriveRootUrl(rootRes.url);
                        await save({ gdrive_root_folder_url: rootRes.url });
                      }
                    } else {
                      toast(res.error ?? 'Erro ao conectar', 'error');
                    }
                  } catch { toast('Erro ao conectar com Google Drive', 'error'); }
                  setGdriveConnecting(false);
                }} disabled={gdriveConnecting || !isGDriveAvailable()} className="btn-primary">
                  {gdriveConnecting ? <><RefreshCw className="h-4 w-4 animate-spin" /> Conectando...</> : <><Cloud className="h-4 w-4" /> Conectar Google Drive</>}
                </button>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Segurança e privacidade</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Os tokens de acesso são armazenados com segurança no ambiente do Electron, nunca no navegador, localStorage ou variáveis VITE_</li>
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> A autenticação usa OAuth 2.0 com PKCE — não solicitamos sua senha Google</li>
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Cada instalação do aplicativo deve autenticar separadamente — tokens não são replicados entre dispositivos</li>
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> Desconectar o Google Drive não apaga arquivos já enviados</li>
              <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" /> O aplicativo continua funcionando localmente sem conexão com o Drive</li>
            </ul>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!tplDelete}
        title="Excluir modelo"
        message={`Excluir "${tplDelete?.name}"?`}
        onConfirm={handleTplDelete}
        onCancel={() => setTplDelete(null)}
      />
    </div>
  );
}

function GeminiKeyConfig() {
  const [geminiKey, setGeminiKey] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyChecking, setKeyChecking] = useState(false);

  const checkKeyStatus = async () => {
    setKeyChecking(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-ai`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'mensagem_atendimento' }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.error && data.error.includes('não configurada')) {
        setKeyConfigured(false);
      } else {
        setKeyConfigured(true);
      }
    } catch {
      setKeyConfigured(false);
    }
    setKeyChecking(false);
  };

  useEffect(() => {
    checkKeyStatus();
  }, []);

  const handleSaveKey = async () => {
    if (!geminiKey.trim()) { toast('Informe a chave da API', 'warning'); return; }
    if (!geminiKey.trim().startsWith('AIza')) { toast('A chave do Gemini geralmente começa com "AIza". Verifique se copiou corretamente.', 'warning'); return; }
    setKeySaving(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-ai`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'set_key', gemini_key: geminiKey.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && !data.error) {
        toast('Chave do Gemini salva com segurança no servidor', 'success');
        setGeminiKey('');
        setKeyConfigured(true);
      } else {
        toast(data.error ?? 'Erro ao salvar chave', 'error');
      }
    } catch {
      toast('Erro de conexão ao salvar chave', 'error');
    }
    setKeySaving(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {keyChecking ? (
          <span className="badge badge-neutral">Verificando...</span>
        ) : keyConfigured ? (
          <span className="badge badge-success">Chave configurada</span>
        ) : (
          <span className="badge badge-warning">Chave não configurada</span>
        )
        }
      </div>
      <label className="label">Chave da API do Google Gemini</label>
      <div className="flex gap-2">
        <input type="password" className="input" placeholder="AIza..." value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
        <button onClick={handleSaveKey} disabled={keySaving || !geminiKey.trim()} className="btn-primary whitespace-nowrap disabled:opacity-50">
          {keySaving ? 'Salvando...' : 'Salvar chave'}
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-2">A chave é armazenada como um segredo do servidor (Supabase Edge Function) e nunca aparece no código do aplicativo.</p>
    </div>
  );
}
