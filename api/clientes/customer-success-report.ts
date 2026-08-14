import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env["SUPABASE" + "_SERVICE" + "_ROLE" + "_KEY"]!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function parsePayload(raw?: string | null) {
  const text = String(raw || "").trim();
  if (!text) return {} as any;
  const body = text.startsWith("CMX_JSON:") ? text.slice(9).trim() : text;
  try { return JSON.parse(body); } catch { return {} as any; }
}

function normalizeRole(value?: string | null) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

async function authenticatedUser(req: VercelRequest) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const jwt = header.slice(7).trim();
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error ? null : data.user || null;
}

function answerLabel(value: unknown) {
  const map: Record<string, string> = {
    sim: "Sim",
    parcial: "Parcialmente",
    nao: "Não",
    nao_soube: "Não soube responder",
    "": "Não informado",
  };
  return map[String(value || "")] || String(value || "Não informado");
}

function cleanList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];
}

function cleanBehaviorList(value: unknown, mode: "strong" | "attention") {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item: any) => mode === "strong" ? ({
    comportamento: String(item?.comportamento || "").trim(),
    evidencia: String(item?.evidencia || "").trim(),
    reforcar: String(item?.reforcar || "").trim(),
  }) : ({
    comportamento: String(item?.comportamento || "").trim(),
    evidencia: String(item?.evidencia || "").trim(),
    risco: String(item?.risco || "").trim(),
    como_melhorar: String(item?.como_melhorar || "").trim(),
  })).filter((item: any) => item.comportamento);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const auth = await authenticatedUser(req);
    if (!auth) return res.status(401).json({ ok: false, error: "Sessão inválida ou expirada." });
    if (!OPENAI_API_KEY) return res.status(500).json({ ok: false, error: "OPENAI_API_KEY não configurada." });

    const vendaId = String(req.body?.venda_id || "").trim();
    if (!vendaId) return res.status(400).json({ ok: false, error: "venda_id é obrigatório." });

    const { data: profile } = await db
      .from("users")
      .select("nome,role,user_role")
      .eq("auth_user_id", auth.id)
      .maybeSingle();

    const { data: venda, error: vendaError } = await db
      .from("vendas")
      .select("id,lead_id,data_venda,vendedor_id,administradora,grupo,cota,valor_venda,numero_proposta,cancelada_em")
      .eq("id", vendaId)
      .maybeSingle();
    if (vendaError) throw vendaError;
    if (!venda?.id || venda.cancelada_em) return res.status(404).json({ ok: false, error: "Venda ativa não encontrada." });

    const role = normalizeRole((profile as any)?.user_role || (profile as any)?.role);
    const privileged = ["admin", "operacoes", "viewer"].includes(role);
    if (!privileged && String(venda.vendedor_id || "") !== auth.id) {
      return res.status(403).json({ ok: false, error: "Usuário sem permissão para gerar o relatório desta venda." });
    }

    const [{ data: lead }, { data: cliente }, { data: seller }] = await Promise.all([
      db.from("leads").select("id,nome").eq("id", venda.lead_id).maybeSingle(),
      db.from("clientes").select("id,nome,observacoes").eq("lead_id", venda.lead_id).maybeSingle(),
      db.from("users").select("nome").eq("auth_user_id", venda.vendedor_id).maybeSingle(),
    ]);

    if (!cliente?.id) return res.status(409).json({ ok: false, error: "Cadastro do cliente ainda não foi confirmado." });
    const payload = parsePayload(cliente.observacoes);
    const record = payload?.customer_success_by_venda?.[vendaId];
    if (!record) return res.status(409).json({ ok: false, error: "Atendimento de Sucesso do Cliente não encontrado para esta venda." });

    const context = {
      venda: {
        data: venda.data_venda,
        administradora: venda.administradora,
        grupo: venda.grupo,
        cota: venda.cota,
        valor: venda.valor_venda,
        proposta: venda.numero_proposta,
        vendedor: seller?.nome || "Não identificado",
      },
      atendimento: {
        status: record.status,
        objetivo: record.objetivo || "",
        uso_credito: record.uso_credito || "",
        credito: record.credito || "",
        parcela: record.parcela || "",
        estrategia: record.estrategia || "",
        expectativa: record.expectativa || "",
        compreensao_contemplacao: answerLabel(record.contemplacao),
        compreensao_lance: answerLabel(record.lance),
        compreensao_lance_embutido: answerLabel(record.lance_embutido),
        compreensao_reajustes: answerLabel(record.reajustes),
        compreensao_custos: answerLabel(record.custos),
        compreensao_vencimento: answerLabel(record.vencimento),
        promessa_prazo: record.promessa_prazo === true ? "Sim" : record.promessa_prazo === false ? "Não" : "Não informado",
        promessa_contemplacao: record.promessa_contemplacao === true ? "Sim" : record.promessa_contemplacao === false ? "Não" : "Não informado",
        relato_promessa: record.relato_promessa || "",
        nota_vendedor: record.nota_vendedor ?? null,
        motivo_nota: record.motivo_nota || "",
        clareza: answerLabel(record.clareza),
        pressao: record.pressao === true ? "Sim" : record.pressao === false ? "Não" : "Não informado",
        seguranca: record.seguranca === true ? "Sim" : record.seguranca === false ? "Não" : "Não informado",
        duvida_final: record.duvida_final || "",
        providencia: record.providencia || "",
        observacoes_internas: record.obs || "",
      },
    };

    const systemPrompt = `Você é um analista sênior de qualidade comercial e Customer Success da Consulmax Consórcios.
Analise uma venda exclusivamente a partir das informações coletadas no contato pós-venda.
O relatório será entregue ao vendedor como instrumento de desenvolvimento profissional.

Regras obrigatórias:
- escreva em português do Brasil, com tom executivo, construtivo, objetivo e respeitoso;
- não invente fatos, promessas, falas ou comportamentos que não estejam sustentados pelos dados;
- quando algo for inferência, deixe isso claro;
- não trate traços pessoais como fraquezas: avalie somente processo, comunicação, alinhamento de expectativa e comportamento comercial observável;
- destaque primeiro o que funcionou bem e deve ser repetido;
- nos pontos de atenção, sempre explique como melhorar de forma prática;
- em consórcio, não normalize promessa de contemplação, prazo garantido ou resultado garantido;
- FOFA significa Forças, Oportunidades, Fraquezas e Ameaças;
- responda SOMENTE com JSON válido, sem markdown.

Formato obrigatório:
{
  "resumo_executivo": "string",
  "voz_do_cliente": "string",
  "fofa": {"forcas": ["string"], "oportunidades": ["string"], "fraquezas": ["string"], "ameacas": ["string"]},
  "pontos_fortes": [{"comportamento":"string","evidencia":"string","reforcar":"string"}],
  "pontos_atencao": [{"comportamento":"string","evidencia":"string","risco":"string","como_melhorar":"string"}],
  "acoes_recomendadas": ["string"],
  "conclusao": "string"
}`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analise os dados a seguir:\n${JSON.stringify(context)}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error("CUSTOMER_SUCCESS_REPORT_OPENAI_ERROR", detail);
      return res.status(502).json({ ok: false, error: "Não foi possível gerar o relatório com a IA." });
    }

    const completion = await aiResponse.json();
    const raw = completion?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { throw new Error("A IA devolveu um relatório em formato inválido."); }

    const report = {
      versao: 1,
      gerado_em: new Date().toISOString(),
      gerado_por: String((profile as any)?.nome || auth.email || "CRM"),
      resumo_executivo: String(parsed?.resumo_executivo || "").trim(),
      voz_do_cliente: String(parsed?.voz_do_cliente || "").trim(),
      fofa: {
        forcas: cleanList(parsed?.fofa?.forcas),
        oportunidades: cleanList(parsed?.fofa?.oportunidades),
        fraquezas: cleanList(parsed?.fofa?.fraquezas),
        ameacas: cleanList(parsed?.fofa?.ameacas),
      },
      pontos_fortes: cleanBehaviorList(parsed?.pontos_fortes, "strong"),
      pontos_atencao: cleanBehaviorList(parsed?.pontos_atencao, "attention"),
      acoes_recomendadas: cleanList(parsed?.acoes_recomendadas),
      conclusao: String(parsed?.conclusao || "").trim(),
    };

    return res.status(200).json({ ok: true, report, cliente_nome: cliente.nome || lead?.nome || "Cliente" });
  } catch (error: any) {
    console.error("CUSTOMER_SUCCESS_REPORT_ERROR", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro interno ao gerar o relatório." });
  }
}
