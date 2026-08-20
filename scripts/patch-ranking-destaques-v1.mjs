import fs from "node:fs";

const path = "src/pages/RankingVendedores.tsx";
let src = fs.readFileSync(path, "utf8");
let changed = false;

if (!src.includes('import RankingDestaques from "@/components/ranking/RankingDestaques";')) {
  const anchor = 'import { supabase } from "@/lib/supabaseClient";\n';
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${anchor}import RankingDestaques from "@/components/ranking/RankingDestaques";\n`);
    changed = true;
  }
}

if (!src.includes("<RankingDestaques year={year} month={month} />")) {
  const anchor = "      {/* Minha posição + Destaques */}";
  if (src.includes(anchor)) {
    src = src.replace(anchor, `      <RankingDestaques year={year} month={month} />\n\n      {/* Minha posição + Insights */}`);
    changed = true;
  }
}

if (src.includes("Destaques do mês")) {
  src = src.replace("Destaques do mês", "Insights do mês");
  changed = true;
}

if (changed) fs.writeFileSync(path, src);
console.log(`[ranking-destaques-v1] ${changed ? "aplicado" : "sem alterações"}`);
