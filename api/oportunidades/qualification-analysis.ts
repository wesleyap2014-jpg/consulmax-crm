import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

type QualificationData = {
  objetivo: string;
  valor_parcela: string;
  prazo: string;
  lance_entrada: string;
  renda_formal: string;
  decisao_contato: string;
};

type CriterionKey = keyof QualificationData;

type CriterionConfig = {
  max: number;
  points: Record<string, number>;
};

const RUBRIC: Record<CriterionKey, CriterionConfig> = {
  objetivo: {
    max: 4,
    points: {
      objetivo_claro: 4,
      investimento_reserva: 3,
      quitacao_divida: 2,
      vago: 0,
    },
  },
  valor_parcela: {
    max: 5,
    points: {
      compativel_confortavel: 5,
      compativel_apertado: 3,
      esforco_relevante: 2,
      inviavel_ou_incompleto: 0,
    },
  },
  prazo: {
    max: 4,
    points: {
      de_12_a_24_meses: 4,
      de_4_a_11_meses: 3,
      acima_de_24_meses: 3,
      sem_prazo: 2,
      ate_3_meses: 1,
      incompleto: 0,
    },
  },
  lance_entrada: {
    max: 5,
    points: {
      trinta_ou_mais_pct: 5,
      vinte_a_29_pct: 4,
      dez_a_19_pct: 3,
      abaixo_de_10_pct: 2,
      sem_lance: 1,
      incompleto: 0,
    },
  },
  renda_formal: {
    max: 5,
    points: {
      comprova_formalmente: 5,
      informal_com_evidencias: 3,
      informal_sem_evidencias: 1,
      nao_comprova_ou_restricao: 0,
      incompleto: 0,
    },
  },
  decisao_contato: {
    max: 2,
    points: {
      decide_sozinho_canal_definido: 2,
      decisao_compartilhada_canal_definido: 1,
      decisao_ou_canal_indefinidos: 0,
    },
  },
};

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function authenticatedUser(req: VercelRequest) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const jwt = header.slice(7).trim();
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error ? null : data.user || null;
}

function cleanAnswers(raw: any): QualificationData {
  return {
    objetivo: String(raw?.objetivo || "").trim(),
    valor_parcela: String(raw?.valor_parcela || "").trim(),
    prazo: String(raw?.prazo || "").trim(),
    lance_entrada: String(raw?.lance_entrada || "").trim(),
    renda_formal: String(raw?.renda_formal || "").trim(),
    decisao_contato: String(raw?.decisao_contato || "").trim(),
  };
}

function cleanList(value: unknown, limit = 6) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit)
    : [];
}

function safeCategory(key: CriterionKey, value: unknown) {
  const category = String(value || "").trim();
  return Object.prototype.hasOwnProperty.call(RUBRIC[key].points, category)
    ? category
    : Object.keys(RUBRIC[key].points).find((item) => item === "incompleto") ||
        Object.keys(RUBRIC[key].points)[Object.keys(RUBRIC[key].points).length - 1];
}

function statusFromScore(score: number) {
  if (score >= 20) return "quente";
  if (score >= 13) return "morno";
  return "frio";
}

function legacyScoreFromStatus(status: string) {
  if (status === "quente") return 4;
  if (status === "morno") return 3;
  return 1;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await authenticatedUser(req);
    if (!auth) {
      return res.status(401).json({ ok: false, error: "Sessão inválida ou expirada." });
    }
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY não configurada." });
    }

    const opportunityId = String(req.body?.opportunity_id || "").trim();
    const answers = cleanAnswers(req.body?.answers);
    if (!opportunityId) {
      return res.status(400).json({ ok: false, error: "opportunity_id é obrigatório." });
    }
    if (Object.values(answers).some((answer) => !answer)) {
      return res.status(400).json({ ok: false, error: "Responda as 6 perguntas da qualificação." });
    }

    const { data: profile } = await db
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level")
      .eq("auth_user_id", auth.id)
      .maybeSingle();

    const { data: opportunity, error: opportunityError } = await db
      .from("opportunities")
      .select("id,lead_id,vendedor_id,owner_id,segmento,valor_credito,estagio")
      .eq("id", opportunityId)
      .maybeSingle();
    if (opportunityError) throw opportunityError;
    if (!opportunity?.id) {
      return res.status(404).json({ ok: false, error: "Oportunidade não encontrada." });
    }

    const role = normalizeText((profile as any)?.user_role || (profile as any)?.role);
    const hierarchy = normalizeText((profile as any)?.hierarchy_level);
    const privileged = ["admin", "operacoes"].includes(role) || hierarchy === "matriz";
    let allowed = privileged || String(opportunity.vendedor_id || "") === auth.id;

    if (!allowed && hierarchy === "gestor_filial" && (profile as any)?.unit_id) {
      const { data: seller } = await db
        .from("users")
        .select("unit_id")
        .eq("auth_user_id", opportunity.vendedor_id)
        .maybeSingle();
      allowed = !!seller?.unit_id && seller.unit_id === (profile as any).unit_id;
    }

    if (!allowed) {
      return res.status(403).json({ ok: false, error: "Usuário sem permissão para qualificar esta oportunidade." });
    }

    const [{ data: lead }, { data: seller }] = await Promise.all([
      db.from("leads").select("id,nome").eq("id", opportunity.lead_id).maybeSingle(),
      db.from("users").select("nome").eq("auth_user_id", opportunity.vendedor_id).maybeSingle(),
    ]);

    const savedAt = new Date().toISOString();
    const { error: saveAnswersError } = await db
      .from("opportunities")
      .update({
        qualification_data: answers,
        qualified_at: savedAt,
        finalidade_recurso: answers.objetivo,
        prazo_contemplacao: answers.prazo,
        updated_at: savedAt,
      })
      .eq("id", opportunity.id);
    if (saveAnswersError) throw saveAnswersError;

    const context = {
      lead: lead?.nome || "Lead",
      vendedor: seller?.nome || "Não identificado",
      segmento_atual: opportunity.segmento || "Não definido",
      valor_credito_atual: Number(opportunity.valor_credito || 0),
      estagio_atual: opportunity.estagio || "Não definido",
      respostas: answers,
    };

    const systemPrompt = `Você é um analista comercial sênior da Consulmax Consórcios.
Sua tarefa é interpretar 6 respostas de qualificação comercial, enquadrar cada resposta em UMA categoria fechada e produzir orientação prática ao vendedor.

REGRAS GERAIS
- Responda em português do Brasil e SOMENTE com JSON válido, sem markdown.
- Não invente renda, patrimônio, urgência, intenção, valor, restrição ou comportamento que não apareça nas respostas.
- Quando houver ambiguidade, escolha a categoria mais conservadora e explique na justificativa.
- A classificação é de aderência/comercial, não é análise de crédito e não garante aprovação.
- Não prometa contemplação, prazo garantido, lance vencedor ou resultado garantido.
- Para "valor x parcela", não afirme disponibilidade atual de plano de mercado; avalie a coerência do que o cliente informou, o conforto declarado e a completude dos dados.
- Para "lance/entrada", só use faixas percentuais se valor de crédito e lance puderem ser inferidos claramente das respostas. Se não for possível, use "incompleto".
- O score numérico NÃO deve ser escolhido por você. Você escolhe somente as categorias; o CRM transformará categorias em pontos.

CATEGORIAS OBRIGATÓRIAS
1. objetivo (máx. 4):
- objetivo_claro: destino definido e objetivo concreto de aquisição/realização;
- investimento_reserva: investimento, reserva ou planejamento patrimonial;
- quitacao_divida: objetivo principal é quitar dívida;
- vago: não sabe, resposta vaga ou sem destino claro.

2. valor_parcela (máx. 5):
- compativel_confortavel: valor e parcela foram informados e o cliente declara conforto/coerência;
- compativel_apertado: parece possível, mas com pouca folga ou necessidade de ajuste;
- esforco_relevante: o próprio relato indica esforço relevante ou desconforto na parcela;
- inviavel_ou_incompleto: faltam dados essenciais ou há incompatibilidade explícita no relato.

3. prazo (máx. 4):
- de_12_a_24_meses;
- de_4_a_11_meses;
- acima_de_24_meses;
- sem_prazo;
- ate_3_meses;
- incompleto.

4. lance_entrada (máx. 5):
- trinta_ou_mais_pct;
- vinte_a_29_pct;
- dez_a_19_pct;
- abaixo_de_10_pct;
- sem_lance: informou explicitamente que não tem valor disponível;
- incompleto: não foi possível medir.

5. renda_formal (máx. 5):
- comprova_formalmente: confirma comprovação por holerite, extrato, IR, pró-labore ou documentação equivalente;
- informal_com_evidencias: renda informal, mas há meios documentais/evidências consistentes;
- informal_sem_evidencias: renda informal sem comprovação clara;
- nao_comprova_ou_restricao: afirma não comprovar ou relata restrição relevante;
- incompleto.

6. decisao_contato (máx. 2):
- decide_sozinho_canal_definido;
- decisao_compartilhada_canal_definido;
- decisao_ou_canal_indefinidos.

FORMATO OBRIGATÓRIO
{
  "classificacoes": {
    "objetivo": {"categoria":"string","justificativa":"string"},
    "valor_parcela": {"categoria":"string","justificativa":"string"},
    "prazo": {"categoria":"string","justificativa":"string"},
    "lance_entrada": {"categoria":"string","justificativa":"string"},
    "renda_formal": {"categoria":"string","justificativa":"string"},
    "decisao_contato": {"categoria":"string","justificativa":"string"}
  },
  "analise": {
    "resumo_executivo":"string",
    "aderencia_consorcio":"Alta|Média|Baixa",
    "perfil_comercial":"string",
    "pontos_fortes":["string"],
    "pontos_atencao":["string"],
    "abordagem_recomendada":"string",
    "proximo_passo":"string",
    "objecoes_provaveis":["string"],
    "perguntas_aprofundamento":["string"],
    "segmento_sugerido":"string",
    "canal_preferido":"string",
    "alertas":["string"]
  }
}`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Qualifique este lead a partir dos dados:\n${JSON.stringify(context)}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error("OPPORTUNITY_QUALIFICATION_OPENAI_ERROR", detail);
      return res.status(502).json({
        ok: false,
        saved: true,
        error: "As respostas foram salvas, mas a análise da IA não pôde ser concluída agora.",
      });
    }

    const completion = await aiResponse.json();
    const raw = completion?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        ok: false,
        saved: true,
        error: "As respostas foram salvas, mas a IA devolveu uma análise em formato inválido.",
      });
    }

    const keys: CriterionKey[] = [
      "objetivo",
      "valor_parcela",
      "prazo",
      "lance_entrada",
      "renda_formal",
      "decisao_contato",
    ];

    const breakdown: Record<string, any> = {};
    let total = 0;
    for (const key of keys) {
      const aiItem = parsed?.classificacoes?.[key] || {};
      const category = safeCategory(key, aiItem?.categoria);
      const points = RUBRIC[key].points[category] ?? 0;
      total += points;
      breakdown[key] = {
        categoria: category,
        pontos: points,
        maximo: RUBRIC[key].max,
        justificativa: String(aiItem?.justificativa || "").trim(),
      };
    }

    const status = statusFromScore(total);
    const analysis = {
      resumo_executivo: String(parsed?.analise?.resumo_executivo || "").trim(),
      aderencia_consorcio: String(parsed?.analise?.aderencia_consorcio || "").trim(),
      perfil_comercial: String(parsed?.analise?.perfil_comercial || "").trim(),
      pontos_fortes: cleanList(parsed?.analise?.pontos_fortes),
      pontos_atencao: cleanList(parsed?.analise?.pontos_atencao),
      abordagem_recomendada: String(parsed?.analise?.abordagem_recomendada || "").trim(),
      proximo_passo: String(parsed?.analise?.proximo_passo || "").trim(),
      objecoes_provaveis: cleanList(parsed?.analise?.objecoes_provaveis),
      perguntas_aprofundamento: cleanList(parsed?.analise?.perguntas_aprofundamento),
      segmento_sugerido: String(parsed?.analise?.segmento_sugerido || "").trim(),
      canal_preferido: String(parsed?.analise?.canal_preferido || "").trim(),
      alertas: cleanList(parsed?.analise?.alertas),
    };

    const analyzedAt = new Date().toISOString();
    const legacyScore = legacyScoreFromStatus(status);
    const { error: updateError } = await db
      .from("opportunities")
      .update({
        qualification_score: total,
        qualification_status: status,
        qualification_breakdown: breakdown,
        qualification_ai_analysis: analysis,
        qualification_analyzed_at: analyzedAt,
        score: legacyScore,
        updated_at: analyzedAt,
      })
      .eq("id", opportunity.id);
    if (updateError) throw updateError;

    await db.from("opportunity_notes").insert({
      opportunity_id: opportunity.id,
      lead_id: opportunity.lead_id,
      user_id: auth.id,
      kind: "qualification_ai",
      note: `Qualificação concluída: ${total}/25 • ${status.charAt(0).toUpperCase() + status.slice(1)}.`,
    });

    return res.status(200).json({
      ok: true,
      result: {
        score: total,
        status,
        breakdown,
        analysis,
        qualified_at: savedAt,
        analyzed_at: analyzedAt,
      },
    });
  } catch (error: any) {
    console.error("OPPORTUNITY_QUALIFICATION_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro interno ao qualificar a oportunidade." });
  }
}
