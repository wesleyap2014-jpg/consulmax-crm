import assert from "node:assert/strict";
import { parsePriceTableTextIntelligent } from "../src/price-table-intelligence.mjs";

const sample = `
Grupo 2020
204 Meses - Agosto 2026
FILIAL COMERCIAL 11
VLR. DISPONÍVEL
PARCELA 204 MESES %
DESCRIÇÃO DO BEM VALOR DO CRÉDITO C/ABATIMENTO DE
IDEAL 0,4902%
20% DO CRÉDITO
CREDITO IMOBILIARIO 01 211.402,00 1.452,23 158.128,70
CREDITO IMOBILIARIO 02 243.112,00 1.670,06 181.847,78
CREDITO IMOBILIARIO 03 274.822,00 1.887,90 205.566,86
CREDITO IMOBILIARIO 04 306.532,00 2.105,73 229.285,94
CREDITO IMOBILIARIO 05 327.672,00 2.250,95 245.098,66
CREDITO IMOBILIARIO 06 359.383,00 2.468,79 268.818,48
CREDITO IMOBILIARIO 07 391.093,00 2.686,62 292.537,56
CREDITO IMOBILIARIO 08 422.803,00 2.904,45 316.256,64
TAXA DE ADMINISTRAÇÃO.: 25%
FUNDO DE RESERVA: 1%
PRAZO DO GRUPO: 220
Lance: Poderão ser utilizados até 20% (vinte por cento) do valor do crédito para pagamento do Lance (onde a base de cálculo do valor será considerado o valor do crédito acrescido de taxa de administração e fundo de reserva)
`;

const result = parsePriceTableTextIntelligent(sample, "fixture");
assert.equal(result.prazoMax, 204);
assert.equal(result.prazoGrupo, 220);
assert.equal(result.adminRates.at(-1), 0.25);
assert.equal(result.reserveRates.at(-1), 0.01);
assert.equal(result.lanceEmbutidoMaxPct, 0.2);
assert.equal(result.embeddedBidBase, "valor_categoria");
assert.equal(result.credits.length, 8);
assert.equal(result.creditMin, 211402);
assert.equal(result.creditMax, 422803);
assert.equal(result.evidence.prazoPlano.source, "cabecalho_parcela");
assert.equal(result.confidence, 1);
console.log("Parser semântico validado para a Tabela Maggi 2020.");
