import fs from "node:fs";

const radarFile = "api/marketing/radar-run.ts";
let radar = fs.readFileSync(radarFile, "utf8");
let radarChanged = false;

const importFrom = `import { decryptSecret, fetchJson, requireAdmin } from "./_social";`;
const importTo = `${importFrom}\nimport { generateRadarIdeas } from "./_radar-ideas";`;
if (!radar.includes(importTo)) {
  if (!radar.includes(importFrom)) throw new Error("[radar-auto-ideas] âncora de import não encontrada");
  radar = radar.replace(importFrom, importTo);
  radarChanged = true;
}

const pulseFrom = `    const pulses = successfulProviders.length ? await rebuildPulse(successfulProviders, startedAt) : [];\n\n    return json(res, 200, {`;
const pulseTo = `    const pulses = successfulProviders.length ? await rebuildPulse(successfulProviders, startedAt) : [];\n    let ideaResult: any = { created: 0 };\n    if (pulses.length) {\n      try {\n        ideaResult = await generateRadarIdeas({ generatedAt: startedAt, providers: successfulProviders });\n      } catch (ideaError) {\n        console.warn("[radar-run] não foi possível gerar ideias automáticas nesta execução.", ideaError);\n      }\n    }\n\n    return json(res, 200, {`;
if (!radar.includes(pulseTo)) {
  if (!radar.includes(pulseFrom)) throw new Error("[radar-auto-ideas] âncora de execução do Pulso não encontrada");
  radar = radar.replace(pulseFrom, pulseTo);
  radarChanged = true;
}

const responseFrom = `      observations: observationCount,\n      pulses: pulses.length,\n      results,`;
const responseTo = `      observations: observationCount,\n      pulses: pulses.length,\n      ideas_created: Number(ideaResult?.created || 0),\n      idea_generation_reason: ideaResult?.reason || null,\n      results,`;
if (!radar.includes(responseTo)) {
  if (!radar.includes(responseFrom)) throw new Error("[radar-auto-ideas] âncora do retorno do Radar não encontrada");
  radar = radar.replace(responseFrom, responseTo);
  radarChanged = true;
}

if (radarChanged) {
  fs.writeFileSync(radarFile, radar);
  console.log("[radar-auto-ideas] geração automática integrada ao Radar");
} else {
  console.log("[radar-auto-ideas] backend já aplicado");
}

const pageFile = "src/pages/MarketingContentCenter.tsx";
let page = fs.readFileSync(pageFile, "utf8");
let pageChanged = false;

const ideaTypeFrom = `type Idea = {\n  id: string;\n  title: string | null;\n  raw_input: string;\n  source_type: string;\n  status: string;\n  created_at: string;\n};`;
const ideaTypeTo = `type Idea = {\n  id: string;\n  title: string | null;\n  raw_input: string;\n  source_type: string;\n  source_url?: string | null;\n  source_metadata?: Record<string, any> | null;\n  status: string;\n  created_at: string;\n};`;
if (!page.includes(ideaTypeTo)) {
  if (!page.includes(ideaTypeFrom)) throw new Error("[radar-auto-ideas] tipo Idea não encontrado");
  page = page.replace(ideaTypeFrom, ideaTypeTo);
  pageChanged = true;
}

const ideasHeaderFrom = `<div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#1E293F]">Caixa de Ideias</h2><p className="text-sm text-slate-500">Pensamentos, áudios, reuniões, comentários, Radar e referências entram aqui antes de virar pauta.</p></div><Button onClick={() => setModal("idea")}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>`;
const ideasHeaderTo = `<div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#1E293F]">Caixa de Ideias</h2><p className="text-sm text-slate-500">O Pulso trabalha nos bastidores: quando detecta um sinal editorial relevante, o Max cria a ideia automaticamente e traz as referências que originaram o insight.</p></div><Button onClick={() => setModal("idea")}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>`;
if (!page.includes(ideasHeaderTo)) {
  if (!page.includes(ideasHeaderFrom)) throw new Error("[radar-auto-ideas] cabeçalho de Ideias não encontrado");
  page = page.replace(ideasHeaderFrom, ideasHeaderTo);
  pageChanged = true;
}

const ideaCardFrom = `{ideas.map((idea) => (\n                <Card key={idea.id} className="border-[#B5A573]/20"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#1E293F]">{idea.title || "Ideia sem título"}</p><p className="mt-2 line-clamp-4 text-sm text-slate-600">{idea.raw_input}</p></div><Status value={idea.status} /></div><div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-400">{idea.source_type} · {fmtDate(idea.created_at)}</span>{idea.status !== "converted" ? <Button size="sm" disabled={saving} onClick={() => transformIdea(idea)} className="bg-[#A11C27] hover:bg-[#8b1822]"><Sparkles className="mr-1.5 h-4 w-4" />Transformar com Max</Button> : null}</div></CardContent></Card>\n              ))}`;

const ideaCardTo = `{ideas.map((idea) => {\n                const radarMeta = idea.source_type === "radar" ? (idea.source_metadata || {}) : null;\n                const references = radarMeta && Array.isArray(radarMeta.references) ? radarMeta.references : [];\n                const timingDays = radarMeta ? Number(radarMeta.timing_days || 0) : 0;\n                const priority = radarMeta ? String(radarMeta.priority || "nova") : "";\n                return (\n                  <Card key={idea.id} className={\`border-[#B5A573]/20 \${radarMeta && priority === "agora" ? "ring-1 ring-[#A11C27]/20" : ""}\`}>\n                    <CardContent className="p-5">\n                      <div className="flex items-start justify-between gap-3">\n                        <div className="min-w-0 flex-1">\n                          {radarMeta ? <div className="mb-2 flex flex-wrap items-center gap-2"><span className={\`rounded-full px-2.5 py-1 text-[11px] font-semibold \${priority === "agora" ? "bg-[#A11C27]/10 text-[#A11C27]" : "bg-[#E0CE8C]/20 text-[#1E293F]"}\`}>{priority === "agora" ? "🔥 Agora" : "✨ Nova do Radar"}</span>{radarMeta.consulmax_score ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">Score Consulmax {Math.round(Number(radarMeta.consulmax_score))}</span> : null}{timingDays ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">Produzir em até {timingDays} dias</span> : null}</div> : null}\n                          <p className="font-semibold text-[#1E293F]">{idea.title || "Ideia sem título"}</p>\n                          {radarMeta?.why_now ? <div className="mt-2 rounded-xl bg-[#E0CE8C]/12 px-3 py-2 text-sm text-[#1E293F]"><strong>Por que agora:</strong> {String(radarMeta.why_now)}</div> : null}\n                          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{idea.raw_input}</p>\n                          {radarMeta ? <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">{radarMeta.recommended_format ? <span>Formato: <strong className="text-[#1E293F]">{String(radarMeta.recommended_format)}</strong></span> : null}{radarMeta.recommended_hook ? <span>• Gancho: <strong className="text-[#1E293F]">{String(radarMeta.recommended_hook).replaceAll("_", " ")}</strong></span> : null}{radarMeta.stage ? <span>• Pulso: <strong className="text-[#1E293F]">{String(radarMeta.stage)}</strong></span> : null}</div> : null}\n                          {references.length ? <div className="mt-4 rounded-xl border border-[#B5A573]/20 bg-slate-50/70 p-3"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Referências do Radar</p><div className="mt-2 flex flex-wrap gap-2">{references.map((ref: any, index: number) => ref?.url ? <a key={\`\${idea.id}-ref-\${index}\`} href={String(ref.url)} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-[#B5A573]/25 bg-white px-2.5 py-1.5 text-xs font-medium text-[#A11C27] hover:bg-[#E0CE8C]/10"><LinkIcon className="mr-1.5 h-3.5 w-3.5" />{String(ref.profile || ref.handle || \`Referência \${index + 1}\`)}</a> : null)}</div><p className="mt-2 text-[11px] text-slate-400">Referência de sinal, formato e abordagem — nunca para copiar criação, texto ou roteiro.</p></div> : null}\n                        </div>\n                        <Status value={idea.status} />\n                      </div>\n                      <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{idea.source_type === "radar" ? "Pulso do Radar" : idea.source_type} · {fmtDate(idea.created_at)}</span>{idea.status !== "converted" ? <Button size="sm" disabled={saving} onClick={() => transformIdea(idea)} className="bg-[#A11C27] hover:bg-[#8b1822]"><Sparkles className="mr-1.5 h-4 w-4" />Transformar com Max</Button> : null}</div>\n                    </CardContent>\n                  </Card>\n                );\n              })}`;
if (!page.includes(ideaCardTo)) {
  if (!page.includes(ideaCardFrom)) throw new Error("[radar-auto-ideas] card de ideias não encontrado");
  page = page.replace(ideaCardFrom, ideaCardTo);
  pageChanged = true;
}

const pulseCopyFrom = `<div><h2 className="text-xl font-semibold text-[#1E293F]">Pulso do Algoritmo</h2><p className="text-sm text-slate-500">Inferência baseada em performance observada. Score e confiança só aparecem quando há evidência suficiente.</p></div>`;
const pulseCopyTo = `<div><h2 className="text-xl font-semibold text-[#1E293F]">Pulso do Algoritmo</h2><p className="text-sm text-slate-500">Inferência baseada em performance observada. Quando surge um sinal editorial relevante, o Max transforma o Pulso em ideia automaticamente e envia para a Caixa de Ideias com as referências de origem.</p></div>`;
if (!page.includes(pulseCopyTo)) {
  if (!page.includes(pulseCopyFrom)) throw new Error("[radar-auto-ideas] copy do Pulso não encontrada");
  page = page.replace(pulseCopyFrom, pulseCopyTo);
  pageChanged = true;
}

if (pageChanged) {
  fs.writeFileSync(pageFile, page);
  console.log("[radar-auto-ideas] Caixa de Ideias enriquecida com Pulso e referências");
} else {
  console.log("[radar-auto-ideas] frontend já aplicado");
}
