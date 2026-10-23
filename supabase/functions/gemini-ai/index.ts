import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-2.0-flash";

interface AiRequest {
  action: string;
  context?: string;
  prompt?: string;
  clientSummary?: string;
  gemini_key?: string;
}

const SYSTEM_PROMPT = `Você é um assistente de CRM para um estúdio fotográfico brasileiro.
Responda sempre em português brasileiro, de forma profissional, concisa e prática.
Você NUNCA deve alterar dados, criar registros ou executar ações — apenas sugerir textos e ideias.
O usuário revisará todas as sugestões antes de aplicá-las.
Não invente dados que não foram fornecidos. Se faltar informação, indique o que é necessário.`;

const ACTION_PROMPTS: Record<string, string> = {
  mensagem_atendimento:
    "Crie uma mensagem de atendimento ao cliente. Seja acolhedor, profissional e adequado para WhatsApp. Use emoji com moderação.",
  briefing:
    "Gere um briefing organizado a partir das informações fornecidas. Estruture em tópicos: tipo de ensaio, expectativas, prazos, observações.",
  resumo_historico:
    "Resuma o histórico do cliente de forma organizada, destacando os principais eventos, status de orçamentos, pagamentos e pendências.",
  acompanhamento_comercial:
    "Sugira um acompanhamento comercial personalizado. Considere o histórico e proponha uma abordagem de retorno ou upsell.",
  sugerir_tarefas:
    "Sugira tarefas e próximos passos com base no contexto do cliente. Liste em formato de checklist com prioridade sugerida.",
  texto_campanha:
    "Elabore um texto para campanha promocional do estúdio. Adapte o tom ao canal indicado (Instagram, WhatsApp, etc.).",
  organizar_informacoes:
    "Organize as informações comerciais fornecidas de forma estruturada e legível. Destaque pontos relevantes.",
  oportunidades_retorno:
    "Identifique oportunidades de retorno para clientes inativos ou com pendências. Sugira abordagens específicas para cada caso.",
  gerar_documento_contrato:
    "Gere o corpo de um CONTRATO de prestação de serviços fotográficos. Use linguagem jurídica formal em português brasileiro. NÃO inclua nomes, CPF, telefones, endereços ou dados pessoais reais — use os marcadores {NOME_CLIENTE}, {CPF_CLIENTE}, {NOME_ESTUDIO}, {CNPJ_CPF}, {SERVICO_DESCRICAO}, {DATA_SERVICO}, {LOCAL_SERVICO}, {VALOR_CONTRATADO}, {CONDICOES_PAGAMENTO}, {PRAZO_ENTREGA}, {TERMOS_CANCELAMENTO}, {TERMOS_REAGENDAMENTO} onde aplicável. Inclua cláusulas de: objeto, obrigações das partes, pagamento, prazo de entrega, cancelamento e reagendamento, direitos autorais e uso de imagem, foro. Se o usuário fornecer instruções ou cláusulas específicas, incorpore-as.",
  gerar_documento_termo:
    "Gere o corpo de um TERMO de responsabilidade ou ciência relacionado a serviços fotográficos. Use linguagem formal em português brasileiro. NÃO inclua dados pessoais reais — use marcadores {NOME_CLIENTE}, {CPF_CLIENTE}, {NOME_ESTUDIO}, {SERVICO_DESCRICAO}, {DATA_SERVICO} conforme necessário. Adapte o conteúdo à finalidade indicada pelo usuário.",
  gerar_documento_autorizacao:
    "Gere o corpo de uma AUTORIZAÇÃO de uso de imagem para fotografia, em conformidade com a LGPD. Use linguagem formal em português brasileiro. NÃO inclua dados pessoais reais — use marcadores {NOME_CLIENTE}, {CPF_CLIENTE}, {NOME_ESTUDIO}, {ESCOPO_AUTORIZACAO}, {PRAZO_AUTORIZACAO} onde aplicável. Inclua: finalidades do uso, vigência, direito de revogação, proteção de dados de menores se aplicável.",
  gerar_documento_recibo:
    "Gere o corpo de um RECIBO de pagamento de serviços fotográficos. Use linguagem formal em português brasileiro. NÃO inclua dados pessoais reais — use marcadores {NOME_CLIENTE}, {CPF_CLIENTE}, {NOME_ESTUDIO}, {CNPJ_CPF}, {VALOR_PAGAMENTO}, {DESCRICAO_PAGAMENTO}, {DATA_PAGAMENTO} onde aplicável. Inclua declaração de quitação.",
  gerar_documento_declaracao:
    "Gere o corpo de uma DECLARAÇÃO relacionada a serviços fotográficos. Use linguagem formal em português brasileiro. NÃO inclua dados pessoais reais — use marcadores {NOME_CLIENTE}, {CPF_CLIENTE}, {NOME_ESTUDIO}, {SERVICO_DESCRICAO}, {DATA_SERVICO} conforme necessário. Adapte à finalidade indicada pelo usuário.",
  gerar_documento_outro:
    "Gere o corpo de um documento jurídico/formal para estúdio fotográfico conforme a descrição do usuário. Use linguagem formal em português brasileiro. NÃO inclua dados pessoais reais — use os marcadores disponíveis ({NOME_CLIENTE}, {CPF_CLIENTE}, {NOME_ESTUDIO}, etc.) onde aplicável. Adapte o conteúdo à finalidade indicada.",
};

async function getGeminiKey(): Promise<string | null> {
  const envKey = Deno.env.get("GEMINI_API_KEY");
  if (envKey) return envKey;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
  );

  const { data } = await supabase
    .from("settings")
    .select("gemini_api_key")
    .limit(1)
    .maybeSingle();

  return (data as { gemini_api_key?: string | null })?.gemini_api_key ?? null;
}

async function setGeminiKey(key: string): Promise<boolean> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return false;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
  );

  const { data: existing } = await supabase.from("settings").select("id").limit(1).maybeSingle();

  if (existing) {
    const { error } = await supabase.from("settings").update({ gemini_api_key: key }).eq("id", (existing as { id: string }).id);
    return !error;
  } else {
    const { error } = await supabase.from("settings").insert({ gemini_api_key: key });
    return !error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const body: AiRequest = await req.json();
    const { action } = body;

    if (action === "set_key") {
      const key = body.gemini_key?.trim();
      if (!key) {
        return new Response(
          JSON.stringify({ error: "Chave não fornecida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const ok = await setGeminiKey(key);
      if (ok) {
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Erro ao salvar chave no servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = await getGeminiKey();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Chave da API do Gemini não configurada. Acesse Configurações > Inteligência Artificial para configurar." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!action || !ACTION_PROMPTS[action]) {
      return new Response(
        JSON.stringify({ error: "Ação não reconhecida. Ações válidas: " + Object.keys(ACTION_PROMPTS).join(", ") }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const actionInstruction = ACTION_PROMPTS[action];
    const { context, prompt, clientSummary } = body;

    const userMessage = [
      clientSummary ? `Resumo do cliente:\n${clientSummary}` : "",
      context ? `Contexto adicional:\n${context}` : "",
      prompt ? `Solicitação:\n${prompt}` : "",
    ].filter(Boolean).join("\n\n");

    const fullPrompt = `${actionInstruction}\n\n${userMessage}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: action.startsWith("gerar_documento_") ? 4096 : 2048,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      let errorMessage = "Erro ao comunicar com o Google Gemini.";

      if (geminiResponse.status === 429) {
        errorMessage = "Limite de requisições gratuito atingido. Aguarde alguns minutos e tente novamente.";
      } else if (geminiResponse.status === 401 || geminiResponse.status === 403) {
        errorMessage = "Chave da API do Gemini inválida ou sem permissão. Verifique a chave nas Configurações.";
      } else if (geminiResponse.status === 404) {
        errorMessage = `Modelo ${GEMINI_MODEL} não disponível. Verifique a documentação do Google Gemini para modelos atuais.`;
      } else {
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error?.message) errorMessage = parsed.error.message;
        } catch { /* use default */ }
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: geminiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return new Response(
        JSON.stringify({ error: "O Gemini não retornou nenhum texto. Tente reformular sua solicitação." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ text: generatedText, model: GEMINI_MODEL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno no servidor: " + (err.message ?? "desconhecido") }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
