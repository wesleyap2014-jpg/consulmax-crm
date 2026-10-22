import assert from "node:assert/strict";
import { buildAiGroupPatch } from "../src/group-document-ai.mjs";

const previousKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;

function priceDocument({
  group,
  credits,
  planTerms,
  adminRates,
  reserveRates,
  embeddedBidRates,
}) {
  return {
    kind: "tabela_precos",
    entry: { label: `TABELA DE PREÇOS GRUPO ${group}` },
    pdfPath: `/tmp/tabela-${group}.pdf`,
    sourceUrl: "https://example.invalid/tabela.pdf",
    sha256: `tabela-${group}`,
    extraction: {
      credits,
      planTerms,
      adminRates,
      reserveRates,
      embeddedBidRates,
    },
  };
}

function addendumDocument(group, embeddedBidRates = []) {
  return {
    kind: "aditamento",
    entry: { label: `TERMO DE ADITAMENTO GRUPO ${group}` },
    pdfPath: `/tmp/aditamento-${group}.pdf`,
    sourceUrl: "https://example.invalid/aditamento.pdf",
    sha256: `aditamento-${group}`,
    extraction: {
      credits: [],
      planTerms: [],
      adminRates: [],
      reserveRates: [],
      embeddedBidRates,
    },
  };
}

try {
  const result = await buildAiGroupPatch(
    {
      id: "teste",
      grupo: "634",
      prazo_original: 74,
      prazo_restante: 74,
      taxa_adm_pct: 0.25,
      fundo_reserva_pct: 0.01,
      lance_embutido_max_pct: 0.1,
      config: {},
    },
    [
      priceDocument({
        group: "0634",
        credits: [163594, 327189],
        planTerms: [72],
        adminRates: [0.18],
        reserveRates: [0.01],
        embeddedBidRates: [0.2],
      }),
      addendumDocument("0634", [0.2]),
    ],
  );

  assert.equal(result.patch.grupo, "0634");
  assert.equal(result.patch.config.detailsSource, "area-restrita-deterministic-fallback");
  assert.equal(result.patch.prazo_original, 72);
  assert.equal(result.patch.prazo_restante, 72);
  assert.equal(result.patch.taxa_adm_pct, 0.18);
  assert.equal(result.patch.fundo_reserva_pct, 0.01);
  assert.equal(result.patch.lance_embutido_max_pct, 0.2);
  assert.equal(result.patch.config.prazoRules[0].prazo, 72);
  assert.equal(result.patch.config.prazoRules[0].taxaAdmPct, 0.18);
  assert.equal(result.patch.config.maxLanceEmbutidoPct, 0.2);
  assert.match(result.summary.aiError || "", /OPENAI_API_KEY/);

  const group2020 = await buildAiGroupPatch(
    {
      id: "grupo-2020",
      grupo: "2020",
      prazo_original: 203,
      prazo_restante: 203,
      taxa_adm_pct: 0.25,
      fundo_reserva_pct: 0.01,
      lance_embutido_max_pct: 0.2,
      config: {
        prazoRules: [
          {
            id: "antiga",
            prazo: 203,
            taxaAdmPct: 0.25,
            fundoReservaPct: 0.01,
          },
        ],
      },
    },
    [
      priceDocument({
        group: "2020",
        credits: [211402, 243112, 274822, 306532, 327672, 359383, 391093, 422803],
        planTerms: [201],
        adminRates: [0.27],
        reserveRates: [0.01],
        embeddedBidRates: [0.2],
      }),
      addendumDocument("2020", [0.2]),
    ],
  );

  assert.equal(group2020.patch.prazo_original, 201);
  assert.equal(group2020.patch.prazo_restante, 201);
  assert.equal(group2020.patch.taxa_adm_pct, 0.27);
  assert.equal(group2020.patch.fundo_reserva_pct, 0.01);
  assert.equal(group2020.patch.lance_embutido_max_pct, 0.2);
  assert.deepEqual(group2020.patch.config.prazoRules, [
    {
      id: "area_restrita_2020_prazo_1",
      prazo: 201,
      taxaAdmPct: 0.27,
      fundoReservaPct: 0.01,
    },
  ]);
  assert.equal(group2020.summary.prazoMax, 201);
  assert.equal(group2020.summary.maxLanceEmbutidoPct, 0.2);

  console.log("Fallback determinístico Maggi validado, inclusive regressão do grupo 2020.");
} finally {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
}
