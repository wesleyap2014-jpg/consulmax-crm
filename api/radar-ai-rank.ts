type OfferForAi = {
  id: string;
  admin: string;
  nomeTabela: string;
  grupoCodigo?: string | null;
  segmento: string;
  creditoContratado: number;
  creditoLiquido: number;
  poderCompra: number;
  lanceProprio: number;
  lanceEmbutido: number;
  lanceTotalPct: number;
  parcelaInicial: number;
  parcelaEstimada: number;
  parcelaAposContemplacao: number;
  prazoRestante: number;
  probabilidadeContemplacao: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  estrategia: string;
  motivos: string[];
  alertas: string[];
};

type RadarAiRequest = {
  input: Record<string, unknown>;
  offers: OfferForAi[];
};

function json(res: any, status: number, body: Record<string, unknown>) {
  if (typeof res.status === "function") res.status(status);
  else res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function systemPrompt() {
  return [
    "Você é uma IA consultora de vendas de consórcio da Consulmax.",
    "Sua tarefa é ranquear as melhores propostas para o cliente com base nos dados calculados pelo motor.",
    "Não recalcule crédito, lance, parcela, probabilidade ou score técnico.",
    "Use somente os dados recebidos.",
    "Escolha as 3 melhores propostas para venda consultiva, considerando aderência ao objetivo, poder de compra, probabilidade, parcela, lance, prazo, alertas e estratégia.",
    "Uma proposta com score técnico menor ainda pode ser top 3 se for comercialmente mais aderente ao pedido.",
    "Responda somente JSON válido no formato:",
    '{"rankedIds":["id1","id2","id3"],"summary":"texto curto","reasons":{"id1":"motivo curto","id2":"motivo curto","id3":"motivo curto"}}',
  ].join("\n");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 503, { error: "OPENAI_API_KEY não configurada" });
  }

  const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body;
  const input = (body || {}) as RadarAiRequest;
  const offers = Array.isArray(input.offers) ? input.offers.slice(0, 30) : [];

  if (!offers.length) {
    return json(res, 400, { error: "Nenhuma oferta enviada para análise" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt() },
          {
            role: "user",
            content: JSON.stringify({
              objetivoCliente: input.input || {},
              propostasCalculadas: offers,
            }),
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return json(res, response.status, { error: data?.error?.message || "Falha ao consultar IA" });
    }

    const text =
      data.output_text ||
      data.output?.flatMap((item: any) => item.content || [])?.map((item: any) => item.text || "").join("") ||
      "";
    const parsed = safeJsonParse(text);
    const validIds = new Set(offers.map((offer) => offer.id));
    const rankedIds = Array.isArray(parsed?.rankedIds)
      ? parsed.rankedIds.filter((id: unknown) => typeof id === "string" && validIds.has(id)).slice(0, 3)
      : [];

    if (!rankedIds.length) {
      return json(res, 502, { error: "IA não retornou ranking válido" });
    }

    return json(res, 200, {
      rankedIds,
      summary: String(parsed?.summary || ""),
      reasons: parsed?.reasons && typeof parsed.reasons === "object" ? parsed.reasons : {},
    });
  } catch (error: any) {
    return json(res, 500, { error: error?.message || "Erro inesperado ao consultar IA" });
  }
}
