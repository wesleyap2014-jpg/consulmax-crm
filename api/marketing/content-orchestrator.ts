import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

type Provider = "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "whatsapp" | "email" | "blog";

type Target = {
  provider: Provider;
  format: string;
};

type ContentInput = {
  id?: string;
  title: string;
  theme?: string | null;
  thesis?: string | null;
  objective?: string | null;
  audience?: string | null;
  segment?: string | null;
  content_pillar?: string | null;
  cta?: string | null;
};

type RequestBody = {
  action?: "expand" | "head";
  content?: ContentInput;
  idea?: string;
  targets?: Target[];
  instructions?: string;
};

type EditorialSetting = {
  setting_type: string;
  name: string;
  payload: Record<string, unknown>;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const DEFAULT_TARGETS: Target[] = [
  { provider: "instagram", format: "reel" },
  { provider: "tiktok", format: "video" },
  { provider: "youtube", format: "short" },
  { provider: "instagram", format: "carrossel" },
  { provider: "instagram", format: "stories" },
  { provider: "linkedin", format: "post" },
  { provider: "linkedin", format: "artigo" },
  { provider: "whatsapp", format: "status" },
];

const ALLOWED_PROVIDERS = new Set<Provider>([
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "whatsapp",
  "email",
  "blog",
]);

async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const { user } = await getAuthUser(req);
  if (!user) {
    unauthorized(res);
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || data?.role !== "admin") {
    json(res, 403, { ok: false, message: "A Central de Conteúdo está restrita a administradores." });
    return null;
  }

  return user;
}

function parseJsonObject(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Resposta da IA não contém JSON válido.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function normalizeTargets(targets?: Target[]) {
  const safe = (targets || DEFAULT_TARGETS)
    .filter((target) => target && ALLOWED_PROVIDERS.has(target.provider) && typeof target.format === "string" && target.format.trim())
    .slice(0, 12)
    .map((target) => ({ provider: target.provider, format: target.format.trim().slice(0, 60) }));
  return safe.length ? safe : DEFAULT_TARGETS;
}

async function loadEditorialSettings() {
  const { data, error } = await supabaseAdmin
    .from("marketing_content_settings")
    .select("setting_type,name,payload")
    .eq("active", true)
    .order("setting_type", { ascending: true });

  if (error) {
    console.warn("[content-orchestrator] não foi possível carregar configurações editoriais", error.message);
    return [] as EditorialSetting[];
  }

  return (data || []) as EditorialSetting[];
}

function systemPrompt(settings: EditorialSetting[] = []) {
  const editorialContext = settings.length
    ? `\n\nCONFIGURAÇÃO EDITORIAL ATIVA DO CRM:\n${JSON.stringify(settings).slice(0, 18000)}\n\nUse estas configurações como regras e contexto operacional. Brand Kit define identidade; Personas definem para quem falar; Linha Editorial define pilares e cadência; Autonomia define limites de decisão; Community Manager define postura de interação. Em caso de conflito, regras explícitas de segurança e compliance prevalecem.`
    : "\n\nAinda não há configurações editoriais ativas no CRM; use somente as regras-base abaixo.";

  return `Você é o Max Content, Head de Conteúdo da Consulmax Consórcios.

Sua função é transformar uma ideia central em uma operação editorial multicanal profissional.

Princípios obrigatórios:
- Escreva em português do Brasil.
- Preserve a tese do conteúdo-mãe, mas NÃO copie o mesmo texto entre canais.
- Adapte linguagem, ritmo, profundidade, hook e CTA ao comportamento nativo de cada plataforma e formato.
- Posicionamento: premium, consultivo, moderno, claro, responsável e comercial sem ser apelativo.
- Priorize autoridade, educação financeira e geração de conversa qualificada.
- Não prometa contemplação, rentabilidade, economia, aprovação ou resultado garantido.
- Diferencie marca pessoal, institucional e público quando o contexto indicar.
- Artigo do LinkedIn deve ter profundidade própria; Stories devem ser sequenciais e curtos; carrossel deve ter narrativa página a página; vídeo curto deve ter hook falável e roteiro natural.
- Aprender com mercado não significa copiar concorrentes.
- Quando houver informação financeira, não invente números, taxas ou resultados.
- Entregue somente JSON válido quando solicitado.${editorialContext}`;
}

async function callOpenAI(messages: Array<{ role: "system" | "user"; content: string }>) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada na Vercel.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const answer = payload?.choices?.[0]?.message?.content;
  if (!answer || typeof answer !== "string") throw new Error("A IA não retornou conteúdo.");
  return parseJsonObject(answer);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, message: "Method not allowed" });
  }

  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const body = (req.body || {}) as RequestBody;
    const action = body.action || "expand";
    const editorialSettings = await loadEditorialSettings();

    if (action === "head") {
      const idea = String(body.idea || "").trim();
      if (!idea) return json(res, 400, { ok: false, message: "Envie uma ideia para o Head de Conteúdo." });

      const result = await callOpenAI([
        { role: "system", content: systemPrompt(editorialSettings) },
        {
          role: "user",
          content: `Analise a ideia abaixo como Head de Conteúdo e devolva JSON com as chaves: title, theme, thesis, objective, audience, content_pillar, cta, head_recommendation, recommended_targets. recommended_targets deve ser um array de objetos {provider, format, reason}.\n\nIDEIA:\n${idea.slice(0, 12000)}\n\nINSTRUÇÕES ADICIONAIS:\n${String(body.instructions || "").slice(0, 3000)}`,
        },
      ]);

      return json(res, 200, { ok: true, result, editorial_settings_used: editorialSettings.length });
    }

    const content = body.content;
    if (!content?.title) {
      return json(res, 400, { ok: false, message: "Conteúdo-mãe é obrigatório para o desdobramento." });
    }

    const targets = normalizeTargets(body.targets);
    const result = await callOpenAI([
      { role: "system", content: systemPrompt(editorialSettings) },
      {
        role: "user",
        content: `Crie os desdobramentos editoriais do conteúdo-mãe abaixo para os destinos solicitados.

CONTEÚDO-MÃE:
${JSON.stringify(content)}

DESTINOS:
${JSON.stringify(targets)}

INSTRUÇÕES ADICIONAIS:
${String(body.instructions || "").slice(0, 3000)}

Responda em JSON no formato:
{
  "head_note": "resumo curto da estratégia",
  "variants": [
    {
      "provider": "instagram",
      "format": "reel",
      "title": "...",
      "hook": "...",
      "body": "...",
      "caption": "...",
      "script": "...",
      "cta": "...",
      "hashtags": ["..."],
      "creative_brief": "...",
      "duration_seconds": 45,
      "aspect_ratio": "9:16"
    }
  ]
}

Regras: gere exatamente uma variante por destino; não repita literalmente o texto entre redes; respeite a linguagem nativa de cada canal.`,
      },
    ]);

    const variants = Array.isArray(result?.variants)
      ? result.variants.filter((item: any) => item && ALLOWED_PROVIDERS.has(item.provider) && typeof item.format === "string")
      : [];

    return json(res, 200, { ok: true, result: { ...result, variants }, editorial_settings_used: editorialSettings.length });
  } catch (error: any) {
    console.error("[content-orchestrator]", error);
    return json(res, 500, {
      ok: false,
      message: "Não foi possível processar o Max Content agora.",
      detail: String(error?.message || error).slice(0, 700),
    });
  }
}
