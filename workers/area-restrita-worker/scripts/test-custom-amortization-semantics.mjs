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

const percentualIdealMisclassified = {
  regraPosContemplacao: "saldo_devedor_prazo_restante",
  regraPosContemplacaoDescricao: `Da Amortização das parcelas:
    O consorciado irá amortizar o percentual ideal referente ao prazo de
    sua cota do início ao fim até a quitação do saldo devedor.`,
  customRule: {
    lePrazoPct: null,
    leParcelaPct: null,
    llPrazoPct: null,
    llParcelaPct: null,
  },
  evidencias: [],
  alertas: [],
};
normalizeCustomAmortizationRule(percentualIdealMisclassified);
assert.equal(
  percentualIdealMisclassified.regraPosContemplacao,
  "mantem_parcela_reduz_prazo",
  "A cláusula de percentual ideal deve manter a parcela e reduzir o prazo.",
);

const explicitRemainingTermRecalculation = {
  regraPosContemplacao: "saldo_devedor_prazo_restante",
  regraPosContemplacaoDescricao: "Após a contemplação, o saldo devedor será dividido pelo prazo remanescente, com redução do valor da parcela.",
  customRule: {
    lePrazoPct: null,
    leParcelaPct: null,
    llPrazoPct: null,
    llParcelaPct: null,
  },
  evidencias: [],
  alertas: [],
};
normalizeCustomAmortizationRule(explicitRemainingTermRecalculation);
assert.equal(
  explicitRemainingTermRecalculation.regraPosContemplacao,
  "saldo_devedor_prazo_restante",
  "Uma regra expressa de recálculo pelo prazo remanescente deve ser preservada.",
);

console.log("Regra de amortização validada: percentual ideal mantém a parcela; recurso próprio fica em LL; Lance Embutido reduz o prazo por padrão.");
