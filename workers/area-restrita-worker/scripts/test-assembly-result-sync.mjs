import assert from "node:assert/strict";
import { calculateAssemblyStats, canonicalGroupNumber, fixedBidPercentages } from "../src/assembly-result-sync.mjs";

const group = {
  grupo: "0634",
  lance_fixo_pct: 0.25,
  config: {
    lanceOptions: [
      { key: "primeiro_fixo", enabled: true, pct: 0.25, nomeComercial: "Lance Fixo 25%" },
      { key: "segundo_fixo", enabled: true, pct: 0.35, nomeComercial: "Lance Fixo 35%" },
      { key: "livre", enabled: true, pct: 0, nomeComercial: "Lance Livre" },
    ],
  },
};

assert.equal(canonicalGroupNumber("634"), "0634");
assert.deepEqual(fixedBidPercentages(group), [25, 35]);

const rows = [
  { cota: "1668", tipo: "Sorteio", lancePct: "0,0000", data: "22/07/2026" },
  { cota: "131", tipo: "Lance", lancePct: "62,6200", data: "22/07/2026" },
  { cota: "802", tipo: "Lance", lancePct: "62,1700", data: "22/07/2026" },
  { cota: "138", tipo: "Lance", lancePct: "62,0000", data: "22/07/2026" },
  { cota: "1125", tipo: "Lance", lancePct: "61,5200", data: "22/07/2026" },
  { cota: "1678", tipo: "Lance", lancePct: "35,0000", data: "22/07/2026" },
  { cota: "1657", tipo: "Lance", lancePct: "35,0000", data: "22/07/2026" },
  { cota: "1677", tipo: "Lance", lancePct: "35,0000", data: "22/07/2026" },
  { cota: "1669", tipo: "Lance", lancePct: "25,0000", data: "22/07/2026" },
  { cota: "1676", tipo: "Lance", lancePct: "25,0000", data: "22/07/2026" },
  { cota: "1658", tipo: "Lance", lancePct: "25,0000", data: "22/07/2026" },
];

const stats = calculateAssemblyStats(rows, [25, 35]);
assert.equal(stats.menorPct, 61.52);
assert.equal(stats.medianaPct, 62.085);
assert.equal(stats.maiorPct, 62.62);
assert.equal(stats.quantidadeLancesLivres, 4);
assert.equal(stats.quantidadeFixosDescartados, 6);
assert.equal(stats.quantidadeContemplados, 10);

console.log("Resultado de assembleias: sorteio e fixos descartados; menor, mediana e maior calculados corretamente.");
