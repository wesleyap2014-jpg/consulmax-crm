import assert from "node:assert/strict";
import { bbGroupIdentityKey } from "../dist/groupIdentity.js";

const base = {
  grupo: "000000",
  segmento: "auto_fipe",
  prazo: 48,
  taxaAdmPct: 0.179,
  fundoReservaPct: 0.03,
  seguroPct: 0,
  venda: null,
};

assert.equal(
  bbGroupIdentityKey({ ...base, credito: 46010 }),
  bbGroupIdentityKey({ ...base, credito: 92020 }),
  "Faixas de crédito do mesmo plano provisório devem permanecer juntas."
);

assert.notEqual(
  bbGroupIdentityKey(base),
  bbGroupIdentityKey({ ...base, prazo: 100, taxaAdmPct: 0.2117 }),
  "Planos provisórios com prazo ou regras diferentes não podem compartilhar a identidade."
);

assert.notEqual(
  bbGroupIdentityKey({ ...base, segmento: "auto_ipca" }),
  bbGroupIdentityKey(base),
  "O segmento faz parte da identidade do plano provisório."
);

assert.equal(
  bbGroupIdentityKey({ ...base, grupo: "001773" }),
  bbGroupIdentityKey({ ...base, grupo: "001773", prazo: 100, taxaAdmPct: 0.3 }),
  "Depois de numerado, o grupo deve ser identificado pelo segmento e pelo número definitivo."
);

const currentProvisionalPlans = [
  { ...base, credito: 46010 },
  { ...base, credito: 92020 },
  { ...base, prazo: 100, taxaAdmPct: 0.2117, credito: 57512.5 },
  { ...base, prazo: 100, taxaAdmPct: 0.2117, credito: 115025 },
  { ...base, segmento: "auto_ipca", prazo: 72, taxaAdmPct: 0.229, credito: 20000 },
  { ...base, segmento: "auto_ipca", prazo: 72, taxaAdmPct: 0.229, credito: 40000 },
  { ...base, segmento: "auto_ipca", prazo: 100, taxaAdmPct: 0.279, credito: 60000 },
  { ...base, segmento: "auto_ipca", prazo: 100, taxaAdmPct: 0.279, credito: 120000 },
];

assert.equal(
  new Set(currentProvisionalPlans.map(bbGroupIdentityKey)).size,
  4,
  "As faixas provisórias atuais da BB devem formar quatro planos independentes."
);

console.log("Identidade dos grupos provisórios BB validada com sucesso.");
