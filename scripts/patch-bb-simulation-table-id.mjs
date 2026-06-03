import fs from "node:fs";

const file = "src/pages/simuladores/BBConsorciosSimulator.tsx";

if (!fs.existsSync(file)) {
  console.log("patch bb: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

src = src.replace("table_id: selectedGroup.id,", "table_id: null,\n      sim_bb_group_id: selectedGroup.id,");

if (!src.includes("sim_bb_group_id: selectedGroup.id")) {
  const needle = "const payload: any = {\n      lead_id: leadId || null,";
  const replacement = "const payload: any = {\n      table_id: null,\n      sim_bb_group_id: selectedGroup.id,\n      lead_id: leadId || null,";
  if (src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

const inserts = [
  ["      parcela_termo: result.parcelaBase,", "      parcela_termo: result.parcelaBase,\n      parcela_ate_1_ou_2: result.parcelaAntes,"],
  ["      lance_proprio_valor: result.lanceProprioValor,", "      lance_proprio_valor: result.lanceProprioValor,\n      lance_percebido_pct: result.lancePct,"],
  ["      parcela_escolhida: result.parcelaApos,", "      parcela_limitante: result.parcelaApos,\n      parcela_escolhida: result.parcelaApos,"],
  ["      lance_base: \"credito\",", "      lance_base: \"credito\",\n      ofert_base: \"credito\",\n      embut_base: \"credito\","],
  ["      fr_tax_pct: result.fundoReserva,", "      fr_tax_pct: result.fundoReserva,\n      lance_ofertado_parcelas: 0,\n      lance_embutido_parcelas: 0,\n      antecip_parcelas: 0,"],
];

for (const [needle, replacement] of inserts) {
  const marker = replacement.split("\n")[1]?.trim();
  if (marker && !src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

if (src.includes("sim_bb_group_id: selectedGroup.id")) changed = true;

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb: applied");
} else {
  console.log("patch bb: no changes");
}
