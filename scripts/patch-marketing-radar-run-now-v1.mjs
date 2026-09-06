import fs from "node:fs";

const file = "src/pages/MarketingContentCenter.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(label, from, to) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.log(`[radar-run-now] ${label}: âncora não encontrada`);
    return;
  }
  src = src.replace(from, to);
  changed = true;
  console.log(`[radar-run-now] ${label}: aplicado`);
}

replaceOnce(
  "função executar agora",
  `  async function syncInstagramAccount(accountId: string) {`,
  `  async function runRadarNow() {\n    setSaving(true);\n    setError(null);\n    setNotice(null);\n    try {\n      const result = await socialApi("/api/marketing/radar-run", {}, "POST");\n      const profiles = Number(result?.profiles || 0);\n      const observations = Number(result?.observations || 0);\n      const pulses = Number(result?.pulses || 0);\n      setNotice(\`Radar atualizado agora · \${profiles} perfil(is) · \${observations} observação(ões) · \${pulses} sinal(is) no Pulso.\`);\n      await loadAll();\n      setActiveTab("radar");\n    } catch (err: any) {\n      setError(err?.message || "Erro ao executar o coletor do Radar.");\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  async function syncInstagramAccount(accountId: string) {`,
);

replaceOnce(
  "botão executar agora",
  `<div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[#1E293F]">Radar de Mercado</h2><p className="text-sm text-slate-500">Concorrentes e referências ficam cadastrados para análise de sinais públicos, nunca de dados privados.</p></div><Button onClick={() => setModal("radar")}><Plus className="mr-2 h-4 w-4" />Adicionar perfil</Button></div>`,
  `<div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#1E293F]">Radar de Mercado</h2><p className="text-sm text-slate-500">Concorrentes e referências ficam cadastrados para análise de sinais públicos, nunca de dados privados.</p></div><div className="flex items-center gap-2"><Button variant="outline" disabled={saving} onClick={runRadarNow}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}Executar agora</Button><Button onClick={() => setModal("radar")}><Plus className="mr-2 h-4 w-4" />Adicionar perfil</Button></div></div>`,
);

if (changed) fs.writeFileSync(file, src);
console.log("[radar-run-now] patch concluído");
