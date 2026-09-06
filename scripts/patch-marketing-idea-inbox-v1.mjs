import fs from "node:fs";

const pageFile = "src/pages/MarketingContentCenter.tsx";
let page = fs.readFileSync(pageFile, "utf8");
let changed = false;

const importAnchor = `import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";`;
const importLine = `import MarketingIdeaInbox from "@/components/marketing/MarketingIdeaInbox";`;
if (!page.includes(importLine)) {
  if (!page.includes(importAnchor)) throw new Error("[idea-inbox] âncora de import não encontrada");
  page = page.replace(importAnchor, `${importAnchor}\n${importLine}`);
  changed = true;
}

const quickFunction = `  async function createQuickIdea(rawInput: string) {
    const text = String(rawInput || "").trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      let result: any = null;
      let aiError: any = null;
      try {
        result = await callMax({
          action: "head",
          idea: text,
          instructions: "Organize esta captura rápida para a etapa Ideias. Seja específico e entregue uma direção editorial pronta para revisão, sem criar o roteiro final.",
        });
      } catch (err: any) {
        aiError = err;
      }

      const firstLine = text.split(/\\n+/)[0].trim();
      const fallbackTitle = firstLine.length <= 96 ? firstLine : firstLine.slice(0, 93).trimEnd() + "...";
      const structure = result ? {
        title: result.title || fallbackTitle,
        idea: result.idea || result.thesis || text,
        angle: result.angle || result.theme || null,
        audience: result.audience || null,
        objective: result.objective || null,
        recommended_format: result.recommended_format || result.recommended_targets?.[0]?.format || null,
        hook: result.hook || null,
        structure: result.structure || null,
        cta: result.cta || null,
        theme: result.theme || null,
        thesis: result.thesis || result.idea || null,
        content_pillar: result.content_pillar || null,
        head_recommendation: result.head_recommendation || null,
        recommended_targets: Array.isArray(result.recommended_targets) ? result.recommended_targets : [],
      } : null;

      const { error: insertError } = await supabase.from("marketing_content_ideas").insert({
        title: structure?.title || fallbackTitle || null,
        raw_input: text,
        source_type: "manual",
        source_metadata: {
          capture_mode: "quick",
          idea_bucket: "own",
          idea_structure: structure,
          idea_structure_status: structure ? "ready" : "pending",
          idea_structured_at: structure ? new Date().toISOString() : null,
          idea_structure_error: aiError ? String(aiError?.message || aiError).slice(0, 500) : null,
        },
        created_by: userId,
      });
      if (insertError) throw insertError;
      setNotice(structure ? "Ideia guardada e organizada pelo Max. Revise, ajuste ou envie para Conteúdo." : "Ideia guardada. O Max não conseguiu organizar agora; você pode solicitar ajustes ao abrir a ideia.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar a captura rápida.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

`;

const createIdeaAnchor = `  async function createIdea() {`;
if (!page.includes("async function createQuickIdea(rawInput: string)")) {
  if (!page.includes(createIdeaAnchor)) throw new Error("[idea-inbox] função createIdea não encontrada");
  page = page.replace(createIdeaAnchor, `${quickFunction}${createIdeaAnchor}`);
  changed = true;
}

const transformStart = page.indexOf(`  async function transformIdea(idea: Idea) {`);
const transformEnd = page.indexOf(`  async function expandContent(content: ContentItem) {`, transformStart >= 0 ? transformStart : 0);
if (transformStart >= 0 && transformEnd > transformStart && !page.slice(transformStart, transformEnd).includes("idea_structure: structure")) {
  const transformFunction = `  async function transformIdea(idea: Idea) {
    setSaving(true);
    setError(null);
    try {
      const sourceMetadata = (idea as any).source_metadata || {};
      let structure: any = sourceMetadata.idea_structure || null;
      if (!structure) {
        const result = await callMax({ action: "head", idea: idea.raw_input });
        structure = {
          title: result.title || idea.title,
          idea: result.idea || result.thesis || idea.raw_input,
          angle: result.angle || result.theme || null,
          audience: result.audience || null,
          objective: result.objective || null,
          recommended_format: result.recommended_format || result.recommended_targets?.[0]?.format || null,
          hook: result.hook || null,
          structure: result.structure || null,
          cta: result.cta || null,
          theme: result.theme || null,
          thesis: result.thesis || result.idea || null,
          content_pillar: result.content_pillar || null,
          head_recommendation: result.head_recommendation || null,
          recommended_targets: Array.isArray(result.recommended_targets) ? result.recommended_targets : [],
        };
        const { error: ideaUpdateError } = await supabase.from("marketing_content_ideas").update({
          title: structure.title || idea.title,
          source_metadata: { ...sourceMetadata, idea_structure: structure, idea_structure_status: "ready", idea_structured_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }).eq("id", idea.id);
        if (ideaUpdateError) throw ideaUpdateError;
      }

      const { data: created, error: insertError } = await supabase
        .from("marketing_content_items")
        .insert({
          title: structure.title || idea.title || "Conteúdo sem título",
          theme: structure.theme || structure.angle || null,
          thesis: structure.thesis || structure.idea || null,
          objective: structure.objective || null,
          audience: structure.audience || null,
          content_pillar: structure.content_pillar || structure.angle || null,
          cta: structure.cta || null,
          head_recommendation: structure.head_recommendation || null,
          ai_context: {
            recommended_targets: Array.isArray(structure.recommended_targets) ? structure.recommended_targets : [],
            idea_structure: structure,
            source_idea_original: idea.raw_input,
          },
          source_type: idea.source_type,
          source_idea_id: idea.id,
          source_metadata: { idea_structure: structure, source_idea_metadata: sourceMetadata },
          status: "ideia",
          created_by: userId,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      const { error: updateError } = await supabase
        .from("marketing_content_ideas")
        .update({ status: "converted", converted_content_id: created.id, updated_at: new Date().toISOString() })
        .eq("id", idea.id);
      if (updateError) throw updateError;
      setNotice("Ideia aprovada e enviada para Conteúdo. A estrutura revisada pelo Max foi preservada.");
      setActiveTab("conteudos");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao desenvolver a ideia.");
    } finally {
      setSaving(false);
    }
  }

`;
  page = page.slice(0, transformStart) + transformFunction + page.slice(transformEnd);
  changed = true;
  console.log("[idea-inbox] transformação preserva estrutura revisada do Max");
}

const tabStart = `          <TabsContent value="ideias" className="space-y-4">`;
const nextTab = `          <TabsContent value="conteudos" className="space-y-4">`;
const startIndex = page.indexOf(tabStart);
const nextIndex = page.indexOf(nextTab, startIndex + tabStart.length);
if (startIndex < 0 || nextIndex < 0) throw new Error("[idea-inbox] bloco da aba Ideias não encontrado");

const newTab = `          <TabsContent value="ideias" className="space-y-4">
            <MarketingIdeaInbox
              ideas={ideas as any}
              saving={saving}
              onQuickCapture={createQuickIdea}
              onTransform={transformIdea as any}
              onRefresh={loadAll}
            />
          </TabsContent>

`;

const currentBlock = page.slice(startIndex, nextIndex);
if (currentBlock !== newTab) {
  page = page.slice(0, startIndex) + newTab + page.slice(nextIndex);
  changed = true;
}

const topButtonFrom = `<Button onClick={() => setModal("idea")} className="bg-[#A11C27] hover:bg-[#8b1822]"><Lightbulb className="mr-2 h-4 w-4" />Nova ideia</Button>`;
const topButtonTo = `<Button onClick={() => setActiveTab("ideias")} className="bg-[#A11C27] hover:bg-[#8b1822]"><Lightbulb className="mr-2 h-4 w-4" />Caixa de ideias</Button>`;
if (!page.includes(topButtonTo) && page.includes(topButtonFrom)) {
  page = page.replace(topButtonFrom, topButtonTo);
  changed = true;
}

if (changed) {
  fs.writeFileSync(pageFile, page);
  console.log("[idea-inbox] captura inteligente, revisão e avanço para Conteúdo aplicados");
} else {
  console.log("[idea-inbox] já aplicado");
}
