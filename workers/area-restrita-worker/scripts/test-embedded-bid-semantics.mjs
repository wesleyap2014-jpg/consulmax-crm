import fs from "node:fs";
import assert from "node:assert/strict";

const ai = fs.readFileSync("src/group-document-ai.mjs", "utf8");
const intelligence = fs.readFileSync("src/price-table-intelligence.mjs", "utf8");

assert.match(ai, /valor disponível com abatimento de X%/i);
assert.match(ai, /utilização de até X% do valor do crédito para amortização do lance/i);
assert.match(ai, /campo exatamente "maxLanceEmbutidoPct"/i);
assert.match(ai, /const deterministicEmbedded =/);
assert.match(ai, /result\.lanceEmbutidoBase = "valor_categoria"/);
assert.match(ai, /function evidenceAliases\(field\)/);

assert.match(intelligence, /uso_credito_para_amortizacao_lance/);
assert.match(intelligence, /valor_disponivel_com_abatimento/);
assert.match(intelligence, /abatimento_credito_contextual/);
assert.match(intelligence, /ONDE\\s\+A\\s\+BASE/);

console.log("Interpretação semântica do lance embutido validada.");