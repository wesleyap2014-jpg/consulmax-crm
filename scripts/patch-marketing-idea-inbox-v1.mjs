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
      const firstLine = text.split(/\\n+/)[0].trim();
      const title = firstLine.length <= 96 ? firstLine : firstLine.slice(0, 93).trimEnd() + "...";
      const { error: insertError } = await supabase.from("marketing_content_ideas").insert({
        title: title || null,
        raw_input: text,
        source_type: "manual",
        source_metadata: { capture_mode: "quick", idea_bucket: "own" },
        created_by: userId,
      });
      if (insertError) throw insertError;
      setNotice("Ideia guardada. Você pode desenvolver quando quiser.");
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

const tabStart = `          <TabsContent value="ideias" className="space-y-4">`;
const nextTab = `          <TabsContent value="conteudos" className="space-y-4">`;
const startIndex = page.indexOf(tabStart);
const nextIndex = page.indexOf(nextTab, startIndex + tabStart.length);
if (startIndex < 0 || nextIndex < 0) throw new Error("[idea-inbox] bloco da aba Ideias não encontrado");

const newTab = `          <TabsContent value="ideias" className="space-y-4">
            <MarketingIdeaInbox
              ideas={ideas}
              saving={saving}
              onQuickCapture={createQuickIdea}
              onTransform={transformIdea}
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
  console.log("[idea-inbox] blocos de ideias e captura rápida aplicados");
} else {
  console.log("[idea-inbox] já aplicado");
}
