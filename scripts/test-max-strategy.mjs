// Testes sem credenciais: transpila o motor TS para rodar o mesmo código em Node.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/contempladas/maxStrategyEngine.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const engine = await import("data:text/javascript;base64," + Buffer.from(transpiled).toString("base64"));
const {
  maxEntrada, maxEvaluateOffer, maxSearchStrategies, maxExternalRow, maxInternalRow, maxParcelaRanges,
  maxCommercialText, maxValidCommission, MAX_DEFAULT_VENDOR_COMMISSION,
} = engine;
let assertions = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); assertions++; };
const truthy = (a, label) => { assert.ok(a, label); assertions++; };
const moneyNear = (a, b) => { assert.ok(Math.abs(a - b) < 0.011, "Expected " + a + " ~= " + b); assertions++; };
const sample = (id, credit, entry, count, installment, admin = "HS", partner = "external") => ({
  id: "external-" + id, codigo: String(id), segmento: "Automóvel", status: "disponivel",
  partnerId: partner, adminId: admin, administradora: "HS Consórcios", origem: "externo",
  credito: credit, entradaBase: entry, parcelas: count, valorParcela: installment,
});
const a = sample(1, 60000, 18000, 26, 1200);
const b = sample(2, 55000, 14000, 32, 800);
const c = sample(3, 20000, 5000, 40, 500);
const criteria = { segmento: "Automóvel", credito: 110000, preco: 117000, recursos: 45000, avaliacao: 100000, parcelaMax: 2200, maxCotas: 5 };
const one = maxEvaluateOffer([a], criteria, 0.025);
moneyNear(one.credito, 60000);
moneyNear(one.entrada, 21000);
moneyNear(one.saldo, 31200);
moneyNear(one.parcelaInicial, 1200);
equal(one.parcelas.length, 1, "Uma cota só tem uma faixa.");
const combo = maxEvaluateOffer([a, b], criteria, 0.025);
moneyNear(combo.credito, 115000);
moneyNear(combo.entrada, 37750); // 18000+14000+5%*115k
moneyNear(combo.saldo, 56800);
moneyNear(combo.parcelaInicial, 2000);
moneyNear(combo.complementoCompra, 2000);
moneyNear(combo.desembolsoInicial, 39750);
moneyNear(combo.recursosRestantes, 5250);
equal(combo.parcelas.map((x) => x.quantidade), [26, 6], "Prazos reais, não média.");
equal(combo.parcelas.map((x) => x.valor), [2000, 800], "Redução por cota encerrada.");
moneyNear(combo.custoTotalNominal, combo.entrada + combo.saldo);
equal(combo.atendeParcela, true);
equal(combo.atendeAvaliacao, true);
equal(combo.atendeOrcamento, true);
const lowCommission = maxEvaluateOffer([a, b], criteria, 0.005);
moneyNear(combo.entrada - lowCommission.entrada, (0.025 - 0.005) * 115000);
moneyNear(lowCommission.credito, combo.credito);
moneyNear(lowCommission.saldo, combo.saldo);
truthy(!maxValidCommission(0.05), "5% não está entre percentuais atuais.");
assert.throws(() => maxEntrada(a, 0.05), /comiss/i); assertions++;
const shortCash = maxEvaluateOffer([a, b], { ...criteria, recursos: 35000 }, 0.025);
moneyNear(shortCash.deficit, 4750);
equal(shortCash.viavelNosCriterios, false);
equal(maxEvaluateOffer([a, b], { ...criteria, avaliacao: 50000 }, 0.025).atendeAvaliacao, false);
equal(maxEvaluateOffer([a, b], { ...criteria, parcelaMax: 1500 }, 0.025).atendeParcela, false);
const three = maxEvaluateOffer([a, b, c], {}, MAX_DEFAULT_VENDOR_COMMISSION);
equal(three.parcelas.map((x) => x.quantidade), [26, 6, 8]);
equal(three.parcelas.map((x) => x.valor), [2500, 1300, 500]);
const four = [sample(10, 30000, 8000, 20, 350),sample(11, 30000, 8000, 22, 360),sample(12, 30000, 8000, 24, 370),sample(13, 30000, 8000, 28, 400)];
const found4 = maxSearchStrategies(four, { credito: 120000, segmento: "Automóvel" }, 0.025);
equal(found4.offers[0].qtdCotas, 4, "Deve encontrar junção de quatro cartas.");
const five = [sample(20, 24000, 6000, 10, 300),sample(21, 24000, 6000, 12, 300),sample(22, 24000, 6000, 14, 300),sample(23, 24000, 6000, 16, 300),sample(24, 24000, 6000, 18, 300)];
const found5 = maxSearchStrategies(five, { credito: 120000, segmento: "Automóvel" }, 0.025);
equal(found5.offers[0].qtdCotas, 5, "Deve encontrar junção de cinco cartas.");
equal(found5.offers[0].codigos.length, 5);
// Sem teto comercial: usa a quantidade que o objetivo realmente exigir.
for (const count of [6, 8, 12, 20]) {
  const set = Array.from({ length: count }, (_, index) => sample(1000 + index, 10000, 2500, 20, 120));
  const found = maxSearchStrategies(set, { credito: count * 10000, segmento: "Automóvel" }, 0.025);
  equal(found.offers[0].qtdCotas, count, "Deve avaliar uma composição de " + count + " cartas, sem teto de 5.");
  equal(found.offers[0].codigos.length, count, "Códigos reais em junções de " + count + ".");
  moneyNear(found.offers[0].credito, count * 10000);
}
const explicitLimit = Array.from({ length: 9 }, (_, index) => sample(1100 + index, 10000, 2500, 20, 120));
const cappedAtRequest = maxSearchStrategies(explicitLimit, { credito: 90000, segmento: "Automóvel", maxCotas: 3 }, 0.025);
truthy(cappedAtRequest.offers.every((o) => o.qtdCotas <= 3), "Só limitar por solicitação explícita do vendedor.");
const clearedLimit = maxSearchStrategies(explicitLimit, { credito: 90000, segmento: "Automóvel", maxCotas: 0 }, 0.025);
equal(clearedLimit.offers[0].qtdCotas, 9, "Zero remove limite de cotas previamente informado.");
// A amostra heurística não é um teto de cartas: junção longa pelo estoque integral.
const overTwoHundred = Array.from({ length: 205 }, (_, i) => sample(2000 + i, 1000, 200, 12, 25));
const longCombination = maxSearchStrategies(overTwoHundred, { credito: 205000, segmento: "Automóvel" }, 0.025);
equal(longCombination.offers[0].qtdCotas, 205, "Sem limite arbitrário mesmo acima da amostra heurística.");
equal(longCombination.offers[0].codigos.length, 205, "Todos os códigos reais presentes na junção extensa.");
moneyNear(longCombination.offers[0].credito, 205000);
const incompatible = sample(35, 25000, 5000, 20, 300, "BB");
assert.throws(() => maxEvaluateOffer([a, incompatible], criteria, 0.025), /restri/i); assertions++;
equal(maxSearchStrategies([a, incompatible], { credito: 85000 }, 0.025).offers.some((o) => o.qtdCotas > 1), false, "Não misturar administradoras.");
equal(maxSearchStrategies([a, { ...b, status: "reservada" }], { credito: 110000 }, 0.025).offers.some((o) => o.codigos.includes("2")), false, "Reservadas excluídas.");
equal(maxSearchStrategies([], { credito: 120000 }, 0.025).offers.length, 0, "Estoque externo indisponível.");
equal(maxSearchStrategies([a], {}, 0.025).offers.length, 0, "Critério incompleto não é inventado.");
const external = maxExternalRow({ id: 15420, categoria: "Veículo", valor_credito: "R$ 100.000,00", entrada: "R$ 50.000,00", parcelas: 40, valor_parcela: "R$ 1.000,00", administradora: "HS", reserva: "Reservado" });
equal(external.status, "reservada");
moneyNear(external.entradaBase, 45000);
const noFeeClaim = maxCommercialText(combo);
truthy(!/comiss[aã]o/i.test(noFeeClaim), "Não expor comissão ao cliente.");
truthy(!/sem taxa de transfer[eê]ncia/i.test(noFeeClaim), "Não prometer isenção sem confirmação.");
truthy(noFeeClaim.includes("26 ×") && noFeeClaim.includes("6 ×"), "Texto comercial com parcelas reais.");
const requested = maxEvaluateOffer(
 [sample(101, 113900, 33005, 24, 4471.9975)],
 { preco: 117000, recursos: 40000, avaliacao: 113000 }, 0.025
);
moneyNear(requested.entrada, 38700);
moneyNear(requested.complementoCompra, 3100);
moneyNear(requested.deficit, 1800);
moneyNear(requested.recursosRestantes, -1800);
console.log("[max2] OK — " + assertions + " afirmações: individual, 2/3/4/5/6/8/12/20/205 cotas, faixas, comissão, recurso, avaliação, indisponibilidade, agrupamento, WhatsApp e cenário de R$ 1.800.");
