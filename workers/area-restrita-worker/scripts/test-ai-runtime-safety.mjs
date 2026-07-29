import assert from "node:assert/strict";
import { buildAiGroupPatch } from "../src/group-document-ai.mjs";

const previousKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;

try {
  const result = await buildAiGroupPatch(
    {
      id: "teste",
      grupo: "634",
      config: {},
    },
    [
      {
        kind: "tabela_precos",
        entry: { label: "TABELA DE PREÇOS GRUPO 0634" },
        pdfPath: "/tmp/tabela-0634.pdf",
        sourceUrl: "https://example.invalid/tabela.pdf",
        sha256: "tabela",
        extraction: {
          credits: [163594, 327189],
          planTerms: [72],
          adminRates: [0.18],
          reserveRates: [0.01],
          embeddedBidRates: [],
        },
      },
      {
        kind: "aditamento",
        entry: { label: "TERMO DE ADITAMENTO GRUPO 0634" },
        pdfPath: "/tmp/aditamento-0634.pdf",
        sourceUrl: "https://example.invalid/aditamento.pdf",
        sha256: "aditamento",
        extraction: {
          credits: [],
          planTerms: [],
          adminRates: [],
          reserveRates: [],
          embeddedBidRates: [],
        },
      },
    ],
  );

  assert.equal(result.patch.grupo, "0634");
  assert.equal(result.patch.config.detailsSource, "area-restrita-deterministic-fallback");
  assert.match(result.summary.aiError || "", /OPENAI_API_KEY/);
  console.log("Teste do runtime da IA concluído: grupo canônico e fallback válidos.");
} finally {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
}
