type AiOffer = {
  id: string;
  admin: string;
  nomeTabela: string;
  grupoCodigo?: string | null;
  creditoContratado: number;
  creditoLiquido: number;
  poderCompra: number;
  lanceProprio: number;
  lanceEmbutido: number;
  lanceTotalPct: number;
  parcelaAposContemplacao: number;
  probabilidadeContemplacao: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  motivos: string[];
  alertas: string[];
};

type GroupRange = {
  id: string;
  label: string;
  valor: number;
};

type GroupSummary = {
  grupoCodigo: string;
  admin: string;
  segmento: string;
  menorPct?: number | null;
  medianaPct?: number | null;
  maiorPct?: number | null;
  ranges: GroupRange[];
};

type RequestedTest = {
  groupCode?: string;
  grupoCodigo?: string;
  ranges?: Array<{ id?: string; rangeId?: string; quantity?: number }>;
  ownBid?: number;
  useEmbedded?: boolean;
  reason?: string;
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
    "O ranking principal já foi definido pelo motor por aderência. Você NÃO deve alterar automaticamente esse ranking.",
    "Sua tarefa é confirmar a melhor opção comercial ou pedir até 3 testes adicionais.",
    "Você não calcula parcelas, crédito, chance ou aderência. O motor calcula.",
    "Você só pode pedir testes usando grupos e faixas informadas em groupSummaries.",
    "Você pode somar faixas do mesmo grupo usando quantity.",
    "Quando o crédito de uma única faixa ficar distante do solicitado, teste combinações de faixas somadas para aproximar o poder de compra do objetivo.",
    "Priorize combinações que aproximem crédito/poder de compra, parcela e lance disponível. Se a mediana do grupo estiver próxima do lance disponível, você pode pedir teste com lance na mediana.",
    "Não peça crédito solto: sempre use IDs de faixas e quantidades.",
    "Se pedir um teste, explique por que esse teste pode melhorar a proposta.",
    "Se nenhuma alternativa parecer superior, confirme a melhor proposta atual.",
    "Responda somente JSON válido neste formato:",
    '{"finalOfferId":"id da oferta calculada ou vazio","summary":"conclusão curta","tests":[{"groupCode":"001652","ranges":[{"id":"faixa-11","quantity":4},{"id":"faixa-3","quantity":1}],"ownBid":208680.33,"useEmbedded":false,"reason":"motivo"}],"commercialNotes":["nota curta"]}',
  ].join("\n");
}

function findGroup(groups: GroupSummary[], code: string) {
  return groups.find((group) => String(group.grupoCodigo) === String(code));
}

function validateTest(test: RequestedTest, groups: GroupSummary[], offers: AiOffer[]) {
  const groupCode = String(test.groupCode || test.grupoCodigo || "");
  const group = findGroup(groups, groupCode);
  if (!group) {
    return { ...test, status: "rejected", reason: "grupo não enviado para reavaliação" };
  }

  const ranges = Array.isArray(test.ranges) ? test.ranges.slice(0, 6) : [];
  let requestedCredit = 0;
  const validRanges = [];

  for (const item of ranges) {
    const id = String(item.id || item.rangeId || "");
    const quantity = Math.max(1, Math.min(12, Number(item.quantity || 1)));
    const range = group.ranges.find((candidate) => String(candidate.id) === id);
    if (!range) continue;
    requestedCredit += Number(range.valor || 0) * quantity;
    validRanges.push({ id: range.id, label: range.label, valor: range.valor, quantity });
  }

  if (!validRanges.length || requestedCredit <= 0) {
    return { ...test, status: "rejected", reason: "teste sem faixas válidas" };
  }

  const candidates = offers
    .filter((offer) => String(offer.grupoCodigo || "") === groupCode)
    .map((offer) => ({ offer, diff: Math.abs(Number(offer.creditoContratado || 0) - requestedCredit) }))
    .sort((a, b) => a.diff - b.diff || b.offer.score - a.offer.score);
  const best = candidates[0]?.offer || null;
  const accepted = Boolean(best && candidates[0].diff <= Math.max(1000, requestedCredit * 0.03));

  return {
    groupCode,
    requestedCredit,
    ranges: validRanges,
    ownBid: Number(test.ownBid || 0),
    useEmbedded: Boolean(test.useEmbedded),
    reason: String(test.reason || ""),
    status: accepted ? "calculated" : "not_calculated",
    resultOfferId: accepted ? best?.id : null,
    matchedCredit: accepted ? best?.creditoContratado : null,
    matchedDiff: accepted ? candidates[0].diff : null,
    engineMessage: accepted ? "motor encontrou oferta calculada compatível" : "motor não encontrou oferta compatível nas propostas calculadas",
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(res, 503, { error: "OPENAI_API_KEY não configurada" });

  const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body;
  const input = body?.input || {};
  const offers: AiOffer[] = Array.isArray(body?.offers) ? body.offers.slice(0, 30) : [];
  const groupSummaries: GroupSummary[] = Array.isArray(body?.groupSummaries) ? body.groupSummaries.slice(0, 30) : [];

  if (!offers.length) return json(res, 400, { error: "Nenhuma oferta enviada" });

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
              objetivoCliente: input,
              ofertasCalculadas: offers,
              groupSummaries,
            }),
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) return json(res, response.status, { error: data?.error?.message || "Falha ao consultar IA" });

    const text =
      data.output_text ||
      data.output?.flatMap((item: any) => item.content || [])?.map((item: any) => item.text || "").join("") ||
      "";
    const parsed = safeJsonParse(text) || {};
    const validIds = new Set(offers.map((offer) => offer.id));
    const tests = Array.isArray(parsed.tests) ? parsed.tests.slice(0, 3).map((test: RequestedTest) => validateTest(test, groupSummaries, offers)) : [];
    const calculatedTestOfferIds = tests
      .map((test: any) => test.resultOfferId)
      .filter((id: unknown): id is string => typeof id === "string" && validIds.has(id));
    const finalOfferId = validIds.has(parsed.finalOfferId) ? parsed.finalOfferId : calculatedTestOfferIds[0] || offers[0].id;

    return json(res, 200, {
      finalOfferId,
      summary: String(parsed.summary || "Reavaliação concluída com base nas propostas calculadas pelo motor."),
      tests,
      commercialNotes: Array.isArray(parsed.commercialNotes) ? parsed.commercialNotes.slice(0, 5).map(String) : [],
    });
  } catch (error: any) {
    return json(res, 500, { error: error?.message || "Erro inesperado ao consultar IA" });
  }
}
