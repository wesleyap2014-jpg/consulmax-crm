import { supabaseAdmin } from "../_supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_IDEAS_PER_RUN = Math.max(1, Math.min(5, Number(process.env.MARKETING_RADAR_IDEAS_PER_RUN || 3)));
const IDEA_DEDUPE_DAYS = Math.max(3, Number(process.env.MARKETING_RADAR_IDEA_DEDUPE_DAYS || 10));

type Pulse = {
  id: string;
  provider: string;
  dimension_type: string;
  dimension_value: string;
  score: number | string;
  confidence: number | string;
  stage: string;
  sample_size: number;
  generated_at: string;
};

type Observation = {
  id: string;
  market_profile_id: string;
  provider_post_id: string | null;
  post_url: string | null;
  published_at: string | null;
  observed_at: string;
  format: string | null;
  topic: string | null;
  hook: string | null;
  cta: string | null;
  transcript: string | null;
  performance_index: number | string | null;
  analysis: Record<string, any> | null;
};

type Profile = {
  id: string;
  handle: string;
  display_name: string | null;
};

type GeneratedIdea = {
  signal_key?: string;
  title?: string;
  angle?: string;
  audience?: string;
  objective?: string;
  pillar?: string;
  format?: string;
  hook_style?: string;
  structure?: string;
  cta?: string;
  why_now?: string;
  timing_days?: number;
};

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function clean(value: unknown, max = 300) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseJsonObject(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Resposta da IA não contém JSON válido.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function commercialRelevance(topic: string) {
  const key = topic.toLowerCase();
  if (key.includes("capital de giro")) return 96;
  if (key.includes("alavancagem")) return 95;
  if (key.includes("imóve") || key.includes("imove")) return 88;
  if (key.includes("planejamento")) return 84;
  if (key.includes("consórcio") || key.includes("consorcio")) return 80;
  if (key.includes("lance") || key.includes("contempl")) return 72;
  return 60;
}

function stageWeight(stage: string) {
  if (stage === "quente") return 100;
  if (stage === "aquecendo") return 92;
  if (stage === "emergente") return 88;
  if (stage === "estavel") return 70;
  if (stage === "saturando") return 45;
  if (stage === "esfriando") return 30;
  return 60;
}

function consulmaxScore(signal: Pulse) {
  const market = Math.min(100, num(signal.score));
  const confidence = Math.min(100, num(signal.confidence));
  const commercial = commercialRelevance(signal.dimension_value);
  const stage = stageWeight(signal.stage);
  return Math.round(market * 0.35 + confidence * 0.2 + commercial * 0.3 + stage * 0.15);
}

function fingerprint(signal: Pulse, format: string, hook: string, structure: string) {
  const bucket = Math.round(num(signal.score) / 5) * 5;
  return [signal.provider, signal.dimension_value.toLowerCase(), signal.stage, bucket, format, hook, structure].join("|");
}

function fallbackIdea(signal: Pulse, format: string, hook: string, structure: string): GeneratedIdea {
  const topic = signal.dimension_value;
  const templates: Record<string, string[]> = {
    "alavancagem patrimonial": [
      "Seu patrimônio pode trabalhar mais sem consumir todo o seu caixa",
      "Comprar à vista pode ser a decisão mais cara da sua estratégia patrimonial",
      "Capital parado em patrimônio ou patrimônio trabalhando a favor do seu caixa?",
    ],
    "capital de giro": [
      "O problema não é falta de patrimônio. É patrimônio demais e caixa de menos",
      "Como liberar capital sem abrir mão do patrimônio que sua empresa construiu",
      "Imobilizar caixa para crescer pode sair mais caro do que parece",
    ],
    "consórcio": [
      "Consórcio não é sobre esperar: é sobre estruturar capital com estratégia",
      "A pergunta certa não é quando contemplar, mas como o crédito entra no seu plano",
      "Consórcio como ferramenta financeira, não como produto de prateleira",
    ],
    "lance e contemplação": [
      "Lance alto não corrige uma estratégia mal montada",
      "Contemplação sem planejamento pode ser só metade da solução",
      "O que analisar antes de decidir quanto ofertar de lance",
    ],
  };
  const choices = templates[topic.toLowerCase()] || [
    `O que o mercado está sinalizando agora sobre ${topic}`,
    `${topic}: o ângulo que quase ninguém está explicando direito`,
    `Como transformar ${topic} em uma decisão financeira melhor`,
  ];
  const index = Math.abs(Math.round(num(signal.score) + num(signal.sample_size))) % choices.length;
  return {
    signal_key: topic,
    title: choices[index],
    angle: `Explique ${topic} pelo ponto de vista estratégico da Consulmax, sem repetir o discurso dos perfis de referência. Use o sinal do mercado como ponto de partida e traga aplicação prática para o cliente.`,
    audience: topic.toLowerCase().includes("alavanc") || topic.toLowerCase().includes("capital") ? "Empresários, investidores e produtores com patrimônio" : "Clientes que buscam planejamento financeiro e aquisição patrimonial",
    objective: "Autoridade + geração de leads",
    pillar: topic,
    format,
    hook_style: hook || "quebra_de_crenca",
    structure: structure || "gancho_contexto_desenvolvimento_cta",
    cta: "Convide a pessoa a conversar para entender qual estrutura faz sentido para o objetivo dela.",
    why_now: `${topic} está em estágio ${signal.stage}, com score ${num(signal.score).toFixed(0)} e confiança ${num(signal.confidence).toFixed(0)}%.`,
    timing_days: ["quente", "aquecendo", "emergente"].includes(signal.stage) ? 7 : 14,
  };
}

async function callOpenAI(payload: any) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.62,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você é o Max Content, Head de Conteúdo da Consulmax Consórcios. Sua função é transformar sinais de mercado em ideias ORIGINAIS para a Consulmax.\n\nRegras obrigatórias:\n- Escreva em português do Brasil.\n- Nunca copie frase, roteiro, título ou estrutura literal de concorrente.\n- Use as referências apenas para entender assunto, formato, abordagem e apetite do mercado.\n- Priorize o posicionamento premium, consultivo e estratégico da Consulmax.\n- Público prioritário: empresários, produtores rurais, investidores, médicos, advogados, dentistas e clientes de maior renda, sem excluir outros públicos quando o tema pedir.\n- Não invente números, taxas, garantias, contemplação, rentabilidade ou economia.\n- Se um sinal estiver saturando, evite repetir o ângulo mais comum e proponha uma leitura nova.\n- Cada ideia deve ser clara o suficiente para um produtor abrir o CRM e saber o que gravar ou criar.\n- Responda somente JSON válido no formato {"ideas":[{"signal_key":"...","title":"...","angle":"...","audience":"...","objective":"...","pillar":"...","format":"...","hook_style":"...","structure":"...","cta":"...","why_now":"...","timing_days":7}]}.`,
        },
        {
          role: "user",
          content: `Gere uma ideia para cada sinal elegível abaixo. Não crie ideias para sinais fora da lista.\n\nCONTEXTO DO RADAR:\n${JSON.stringify(payload).slice(0, 24000)}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const body = await response.json();
  const answer = body?.choices?.[0]?.message?.content;
  if (!answer) throw new Error("A IA não retornou ideias.");
  return parseJsonObject(String(answer));
}

export async function generateRadarIdeas({ generatedAt, providers }: { generatedAt: string; providers: string[] }) {
  const runTime = new Date(generatedAt);
  const windowStart = new Date(runTime.getTime() - 30 * 86400000).toISOString();
  const dedupeStart = new Date(runTime.getTime() - IDEA_DEDUPE_DAYS * 86400000).toISOString();

  const [pulseRes, observationRes, profileRes, existingRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from("marketing_algorithm_pulses")
      .select("id,provider,dimension_type,dimension_value,score,confidence,stage,sample_size,generated_at")
      .eq("generated_at", generatedAt)
      .in("provider", providers)
      .order("score", { ascending: false }),
    supabaseAdmin
      .from("marketing_market_observations")
      .select("id,market_profile_id,provider_post_id,post_url,published_at,observed_at,format,topic,hook,cta,transcript,performance_index,analysis")
      .gte("observed_at", windowStart)
      .order("performance_index", { ascending: false })
      .limit(500),
    supabaseAdmin.from("marketing_market_profiles").select("id,handle,display_name"),
    supabaseAdmin
      .from("marketing_content_ideas")
      .select("id,title,source_metadata,created_at")
      .eq("source_type", "radar")
      .gte("created_at", dedupeStart)
      .order("created_at", { ascending: false })
      .limit(150),
    supabaseAdmin.from("marketing_content_settings").select("setting_type,name,payload").eq("active", true).order("setting_type"),
  ]);
  if (pulseRes.error) throw pulseRes.error;
  if (observationRes.error) throw observationRes.error;
  if (profileRes.error) throw profileRes.error;
  if (existingRes.error) throw existingRes.error;

  const pulses = (pulseRes.data || []) as Pulse[];
  if (!pulses.length) return { created: 0, reason: "no_pulses" };

  const bestFormat = pulses.find((p) => p.dimension_type === "format" && p.stage !== "esfriando")?.dimension_value || "reel";
  const bestHook = pulses.find((p) => p.dimension_type === "hook" && !["saturando", "esfriando"].includes(p.stage))?.dimension_value || "quebra_de_crenca";
  const bestStructure = pulses.find((p) => p.dimension_type === "structure" && p.stage !== "esfriando")?.dimension_value || "gancho_contexto_desenvolvimento_cta";
  const saturated = pulses
    .filter((p) => p.stage === "saturando")
    .slice(0, 6)
    .map((p) => ({ type: p.dimension_type, value: p.dimension_value, score: num(p.score), confidence: num(p.confidence) }));

  let topicSignals = pulses
    .filter((p) => p.dimension_type === "topic" && p.dimension_value !== "outros")
    .filter((p) => !["saturando", "esfriando"].includes(p.stage))
    .filter((p) => num(p.score) >= 54 && num(p.confidence) >= 55)
    .sort((a, b) => consulmaxScore(b) - consulmaxScore(a));

  if (!topicSignals.length) {
    topicSignals = pulses
      .filter((p) => p.dimension_type === "topic" && p.dimension_value !== "outros" && p.stage !== "esfriando")
      .sort((a, b) => consulmaxScore(b) - consulmaxScore(a));
  }

  const existingFingerprints = new Set(
    (existingRes.data || [])
      .map((row: any) => String(row?.source_metadata?.radar_fingerprint || ""))
      .filter(Boolean),
  );

  const profiles = new Map<string, Profile>((profileRes.data || []).map((p: any) => [String(p.id), p]));
  const observations = (observationRes.data || []) as Observation[];
  const latestByPost = new Map<string, Observation>();
  for (const row of observations) {
    const key = `${row.market_profile_id}:${row.provider_post_id || row.id}`;
    if (!latestByPost.has(key)) latestByPost.set(key, row);
  }
  const uniqueObservations = [...latestByPost.values()];

  const eligible = topicSignals
    .map((signal) => ({
      signal,
      fingerprint: fingerprint(signal, bestFormat, bestHook, bestStructure),
      score: consulmaxScore(signal),
    }))
    .filter((item) => !existingFingerprints.has(item.fingerprint))
    .slice(0, MAX_IDEAS_PER_RUN);

  if (!eligible.length) return { created: 0, reason: "no_new_signal" };

  const signalPayload = eligible.map(({ signal, fingerprint: fp, score }) => {
    const refs = uniqueObservations
      .filter((o) => String(o.topic || "").toLowerCase() === signal.dimension_value.toLowerCase() && Boolean(o.post_url))
      .sort((a, b) => num(b.performance_index) - num(a.performance_index))
      .slice(0, 3)
      .map((o) => {
        const profile = profiles.get(String(o.market_profile_id));
        return {
          url: o.post_url,
          profile: profile?.display_name || profile?.handle || "Perfil monitorado",
          handle: profile?.handle || null,
          format: o.format,
          hook: clean(o.hook, 180),
          excerpt: clean(o.transcript, 320),
          performance_index: num(o.performance_index),
          published_at: o.published_at,
        };
      });
    return {
      signal_key: signal.dimension_value,
      provider: signal.provider,
      topic: signal.dimension_value,
      stage: signal.stage,
      score: num(signal.score),
      confidence: num(signal.confidence),
      sample_size: signal.sample_size,
      consulmax_score: score,
      recommended_format: bestFormat,
      recommended_hook: bestHook,
      recommended_structure: bestStructure,
      fingerprint: fp,
      references: refs,
    };
  });

  let aiIdeas: GeneratedIdea[] = [];
  try {
    const ai = await callOpenAI({
      signals: signalPayload,
      saturated_signals_to_avoid_repeating: saturated,
      active_editorial_settings: settingsRes.data || [],
    });
    aiIdeas = Array.isArray(ai?.ideas) ? ai.ideas : [];
  } catch (error) {
    console.warn("[radar-ideas] IA indisponível; usando fallback editorial.", error);
  }

  const createdRows: any[] = [];
  for (const item of signalPayload) {
    const generated = aiIdeas.find((idea) => clean(idea?.signal_key, 120).toLowerCase() === item.signal_key.toLowerCase())
      || fallbackIdea(eligible.find((e) => e.signal.dimension_value === item.signal_key)!.signal, bestFormat, bestHook, bestStructure);

    const timingDays = Math.max(3, Math.min(21, Number(generated.timing_days || (["quente", "aquecendo", "emergente"].includes(item.stage) ? 7 : 14))));
    const expiresAt = new Date(runTime.getTime() + timingDays * 86400000).toISOString();
    const references = item.references.slice(0, 3);
    const title = clean(generated.title, 220) || fallbackIdea(eligible.find((e) => e.signal.dimension_value === item.signal_key)!.signal, bestFormat, bestHook, bestStructure).title!;
    const angle = clean(generated.angle, 1800);
    const whyNow = clean(generated.why_now, 900) || `${item.topic} está ${item.stage} no Pulso atual.`;
    const priority = item.consulmax_score >= 72 || ["quente", "aquecendo", "emergente"].includes(item.stage) ? "agora" : "nova";

    const rawInput = [
      `IDEIA: ${title}`,
      angle ? `ÂNGULO: ${angle}` : null,
      `PÚBLICO: ${clean(generated.audience, 500) || "Público aderente ao tema"}`,
      `OBJETIVO: ${clean(generated.objective, 300) || "Autoridade + geração de leads"}`,
      `FORMATO RECOMENDADO: ${clean(generated.format, 120) || item.recommended_format}`,
      `GANCHO: ${clean(generated.hook_style, 160) || item.recommended_hook}`,
      `ESTRUTURA: ${clean(generated.structure, 220) || item.recommended_structure}`,
      `CTA: ${clean(generated.cta, 600) || "Convidar para uma conversa consultiva."}`,
      `POR QUE AGORA: ${whyNow}`,
      `TIMING: produzir nos próximos ${timingDays} dias.`,
    ].filter(Boolean).join("\n");

    const row = {
      title,
      raw_input: rawInput,
      source_type: "radar",
      source_url: references[0]?.url || null,
      status: "inbox",
      source_metadata: {
        radar_generated: true,
        generator: "max_radar_ideas_v1",
        radar_generated_at: generatedAt,
        radar_fingerprint: item.fingerprint,
        priority,
        timing_days: timingDays,
        expires_at: expiresAt,
        topic: item.topic,
        stage: item.stage,
        score: item.score,
        confidence: item.confidence,
        sample_size: item.sample_size,
        consulmax_score: item.consulmax_score,
        audience: clean(generated.audience, 500),
        objective: clean(generated.objective, 300) || "Autoridade + geração de leads",
        pillar: clean(generated.pillar, 300) || item.topic,
        recommended_format: clean(generated.format, 120) || item.recommended_format,
        recommended_hook: clean(generated.hook_style, 160) || item.recommended_hook,
        recommended_structure: clean(generated.structure, 220) || item.recommended_structure,
        cta: clean(generated.cta, 600),
        why_now: whyNow,
        references,
        reference_note: "Use estas peças apenas como evidência de mercado e referência de formato/abordagem. Não copiar título, texto, roteiro ou criação.",
      },
    };

    const { data: inserted, error: insertError } = await supabaseAdmin.from("marketing_content_ideas").insert(row).select("id,title").single();
    if (insertError) throw insertError;
    createdRows.push(inserted);
  }

  return { created: createdRows.length, ideas: createdRows };
}
