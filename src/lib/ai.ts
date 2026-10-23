import { supabase } from './supabase';

export type AiAction =
  | 'mensagem_atendimento'
  | 'briefing'
  | 'resumo_historico'
  | 'acompanhamento_comercial'
  | 'sugerir_tarefas'
  | 'texto_campanha'
  | 'organizar_informacoes'
  | 'oportunidades_retorno';

export const AI_ACTIONS: { id: AiAction; label: string; description: string }[] = [
  { id: 'mensagem_atendimento', label: 'Mensagem de atendimento', description: 'Crie uma mensagem de boas-vindas ou retorno para o cliente' },
  { id: 'briefing', label: 'Briefing', description: 'Gere um briefing organizado a partir das informações' },
  { id: 'resumo_historico', label: 'Resumir histórico', description: 'Resuma o histórico do cliente em poucas linhas' },
  { id: 'acompanhamento_comercial', label: 'Acompanhamento comercial', description: 'Sugira uma abordagem de acompanhamento ou upsell' },
  { id: 'sugerir_tarefas', label: 'Sugerir tarefas', description: 'Liste tarefas e próximos passos sugeridos' },
  { id: 'texto_campanha', label: 'Texto de campanha', description: 'Elabore texto promocional para redes sociais ou WhatsApp' },
  { id: 'organizar_informacoes', label: 'Organizar informações', description: 'Estruture informações comerciais de forma legível' },
  { id: 'oportunidades_retorno', label: 'Oportunidades de retorno', description: 'Identifique oportunidades de reengajar clientes' },
];

function stripSensitive(text: string): string {
  return text
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF removido]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ removido]')
    .replace(/\b\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/g, '[telefone removido]')
    .replace(/\b\d{5}-\d{3}\b/g, '[CEP removido]')
    .replace(/[^\s]+@[^\s]+\.[^\s]+/g, '[e-mail removido]');
}

export function sanitizeClientData(data: Record<string, unknown>): string {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      safe[key] = stripSensitive(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return JSON.stringify(safe, null, 2);
}

export interface AiResult {
  text: string;
  model: string;
}

export async function callGemini(action: AiAction, context: string, clientSummary?: string): Promise<AiResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-ai`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, context, clientSummary }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Erro de conexão' }));
    throw new Error(body.error ?? `Erro ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return { text: data.text, model: data.model };
}
