import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const helperSource = fs.readFileSync(new URL("src/lib/portfolioMetrics.ts", root), "utf8");
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const metrics = await import(`data:text/javascript;base64,${Buffer.from(transpile(helperSource)).toString("base64")}`);
const { portfolioDateInputToISO, portfolioDay, portfolioDateInRange, portfolioMovementTotals, portfolioMonthlySeries } = metrics;

const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
const sale = {
  codigo: "01", status: "encarteirada", vendedor_id: "seller-a", valor_venda: 100000,
  encarteirada_em: "2026-08-15T16:00:00Z", cancelada_em: portfolioDateInputToISO("2026-09-30"),
  created_at: "2026-10-02T20:36:00Z",
};

assert.equal(sale.cancelada_em, "2026-09-30T04:00:00.000Z");
assert.equal(portfolioDay(sale.cancelada_em), "2026-09-30");
assert.equal(portfolioDateInputToISO("2026-02-30"), null);
assert.equal(portfolioDay("not-a-date"), null);

const series = portfolioMonthlySeries([sale], months);
assert.equal(series[7].liquido, 100000, "A venda deve permanecer em agosto");
assert.equal(series[8].cancelado, 100000, "O cancelamento informado em 30/09 deve entrar em setembro");
assert.equal(series[9].liquido, 0, "O lançamento em outubro não pode deslocar a competência");
assert.equal(series.reduce((sum, row) => sum + row.liquido, 0), 0, "O anual deve descontar apenas uma vez");

const sameMonth = portfolioMonthlySeries([{ ...sale, encarteirada_em: "2026-09-01T04:00:00Z" }], months);
assert.equal(sameMonth[8].liquido, 0, "Venda e cancelamento no mesmo mês devem se anular");
assert.deepEqual(portfolioMovementTotals([sale], "2026-09-01", "2026-09-30"), { vendido: 0, cancelado: 100000, liquido: -100000 });
assert.deepEqual(portfolioMovementTotals([sale], "2026-10-01", "2026-10-31"), { vendido: 0, cancelado: 0, liquido: 0 });
assert.equal(portfolioDateInRange("2026-10-01T03:59:59.999Z", "2026-09-01", "2026-09-30"), true, "Último instante de setembro em Rondônia deve ser incluído");
assert.equal(portfolioDateInRange("2026-10-01T04:00:00.000Z", "2026-09-01", "2026-09-30"), false);

const crossYear = portfolioMonthlySeries([{ ...sale, encarteirada_em: "2025-12-15T16:00:00Z", cancelada_em: "2026-01-01T04:00:00Z" }], months);
assert.equal(crossYear[0].liquido, -100000, "Cancelamento de venda de ano anterior deve impactar o ano correto");
const reactivated = portfolioMonthlySeries([{ ...sale, codigo: "00", cancelada_em: null }], months);
assert.equal(reactivated[7].liquido, 100000);
assert.equal(reactivated[8].cancelado, 0, "A reativação que limpa a data não pode manter débito de cancelamento");

// Executa o carregador real da Carteira, incluindo o filtro da consulta e o escopo do vendedor.
const page = fs.readFileSync(new URL("src/pages/Carteira.tsx", root), "utf8");
const start = page.indexOf("  const loadMetrics = ");
const end = start >= 0 ? page.indexOf("  const loadMetaForForm = ", start) : -1;

if (start >= 0 && end > start) {
  const queryLog = [];
  let actual;
  const supabase = {
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(field, value) { filters.push((row) => row[field] === value); return query; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        or(expression) {
          if (table !== "vendas") return query;
          queryLog.push(expression);
          const ranges = [...expression.matchAll(/and\((\w+)\.gte\.([^,]+),(\w+)\.lt\.([^\)]+)\)/g)];
          assert.equal(ranges.length, 2, "A consulta deve incluir vendas OU cancelamentos do ano");
          filters.push((row) => ranges.some(([, field, lower, upperField, upper]) => row[field] && new Date(row[field]) >= new Date(lower) && new Date(row[upperField]) < new Date(upper)));
          return query;
        },
        then(resolve, reject) {
          const rows = table === "vendas" ? [sale, { ...sale, vendedor_id: "seller-b", valor_venda: 700000 }] : [];
          return Promise.resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = vm.createContext({
    supabase, ...metrics, getAuthByUserId: () => "seller-a", setMetaMensal() {},
    setRealizadoMensal(value) { actual = Array.from(value); },
  });
  vm.runInContext(transpile(page.slice(start, end) + "\nglobalThis.calculate = loadMetrics;"), context);
  await context.calculate("", 2026);
  assert.equal(actual[7], 800000);
  assert.equal(actual[8], -800000);
  assert.equal(actual[9], 0);
  assert.equal(actual.reduce((sum, value) => sum + value, 0), 0);
  await context.calculate("seller-a", 2026);
  assert.equal(actual[7], 100000, "O filtro de vendedor deve preservar o escopo");
  assert.equal(actual[8], -100000);
  assert.match(queryLog[0], /2027-01-01T04:00:00/);
} else {
  console.log("Carteira: integração loadMetrics legada não está presente; validações do helper de competência executadas.");
}

console.log("Carteira: cancelamento retroativo, desconto único, virada de ano e fuso validados.");
