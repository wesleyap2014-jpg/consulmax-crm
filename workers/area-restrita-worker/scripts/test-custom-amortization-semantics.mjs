import assert from "node:assert/strict";
import { normalizeCustomAmortizationRule } from "../src/group-document-ai.mjs";

const wrongOwnResourceMapping = {
  regraPosContemplacao: "custom",
  regraPosContemplacaoDescricao: "No momento da contemplação, 50% do valor de recurso próprio a pagar será abatido nas prestações e os outros 50% será amortizado na ordem inversa da cota.",
  customRule: {
    lePrazoPct: 0.5,
    leParcelaPct: 0.5,
    llPrazoPct: 0,
    llParcelaPct: 0,
  },
  evidencias: [],
  alertas: [],
};
normalizeCustomAmortizationRule(wrongOwnResourceMapping);
assert.deepEqual(wrongOwnResourceMapping.customRule, {
  lePrazoPct: 1,
  leParcelaPct: 0,
  llPrazoPct: 0.5,
  llParcelaPct: 0.5,
});
assert.match(wrongOwnResourceMapping.alertas.join(" "), /Lance Livre\/Próprio/);

const ownResourceAlreadyCorrect = {
  regraPosContemplacao: "custom",
  regraPosContemplacaoDescricao: "O recurso próprio do consorciado será dividido em 30% para o prazo e 70% para as parcelas.",
  customRule: {
    lePrazoPct: 0,
    leParcelaPct: 0,
    llPrazoPct: 0.3,
    llParcelaPct: 0.7,
  },
  evidencias: [],
  alertas: [],
};
normalizeCustomAmortizationRule(ownResourceAlreadyCorrect);
assert.deepEqual(ownResourceAlreadyCorrect.customRule, {
  lePrazoPct: 1,
  leParcelaPct: 0,
  llPrazoPct: 0.3,
  llParcelaPct: 0.7,
});

const explicitEmbeddedRule = {
  regraPosContemplacao: "custom",
  regraPosContemplacaoDescricao: "Do lance embutido, 40% reduzirá o prazo e 60% reduzirá o valor das parcelas.",
  customRule: {
    lePrazoPct: 0.4,
    leParcelaPct: 0.6,
    llPrazoPct: 0,
    llParcelaPct: 0,
  },
  evidencias: [],
  alertas: [],
};
normalizeCustomAmortizationRule(explicitEmbeddedRule);
assert.deepEqual(explicitEmbeddedRule.customRule, {
  lePrazoPct: 0.4,
  leParcelaPct: 0.6,
  llPrazoPct: 0,
  llParcelaPct: 0,
});

const noContraryProvision = {
  regraPosContemplacao: "custom",
  regraPosContemplacaoDescricao: "O lance livre será amortizado integralmente nas parcelas.",
  customRule: {
    lePrazoPct: null,
    leParcelaPct: null,
    llPrazoPct: 0,
    llParcelaPct: 1,
  },
  evidencias: [],
  alertas: [],
};
normalizeCustomAmortizationRule(noContraryProvision);
assert.deepEqual(noContraryProvision.customRule, {
  lePrazoPct: 1,
  leParcelaPct: 0,
  llPrazoPct: 0,
  llParcelaPct: 1,
});

console.log("Regra de amortização validada: recurso próprio em LL e Lance Embutido 100% no prazo salvo disposição expressa em contrário.");
