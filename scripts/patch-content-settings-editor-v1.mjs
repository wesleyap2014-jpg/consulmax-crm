import fs from "node:fs";

const file = "src/pages/MarketingContentCenter.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(label, from, to) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.log(`[content-settings] ${label}: âncora não encontrada`);
    return;
  }
  src = src.replace(from, to);
  changed = true;
  console.log(`[content-settings] ${label}: aplicado`);
}

replaceOnce(
  "import do editor",
  'import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";\n',
  'import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";\nimport ContentSettingsEditor from "@/components/marketing/ContentSettingsEditor";\n',
);

replaceOnce(
  "cards de configuração",
  `<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">\n              {[{ type: "brand_kit", label: "Brand Kit", icon: Palette }, { type: "persona", label: "Personas", icon: Users }, { type: "editorial_line", label: "Linha Editorial", icon: Megaphone }, { type: "ai_rule", label: "Regras de IA", icon: Bot }].map((entry) => { const Icon = entry.icon; const count = settings.filter((item) => item.setting_type === entry.type && item.active).length; return <Card key={entry.type} className="border-[#B5A573]/20"><CardContent className="p-5"><Icon className="h-5 w-5 text-[#A11C27]" /><p className="mt-3 font-semibold text-[#1E293F]">{entry.label}</p><p className="mt-1 text-sm text-slate-500">{count} configuração(ões) ativa(s)</p></CardContent></Card>; })}\n            </div>\n            <div className="grid gap-3 md:grid-cols-2"><Card className="border-[#B5A573]/20"><CardContent className="p-5"><Workflow className="h-5 w-5 text-[#A11C27]" /><p className="mt-3 font-semibold text-[#1E293F]">Autonomia</p><p className="mt-1 text-sm text-slate-500">A arquitetura suporta Assistido → Semiautomático → Autônomo. A fase inicial permanece com aprovação humana.</p></CardContent></Card><Card className="border-[#B5A573]/20"><CardContent className="p-5"><MessageCircle className="h-5 w-5 text-[#A11C27]" /><p className="mt-3 font-semibold text-[#1E293F]">Community Manager</p><p className="mt-1 text-sm text-slate-500">Comentários e perguntas poderão alimentar ideias e pautas quando cada rede conceder as permissões correspondentes.</p></CardContent></Card></div>`,
  `<ContentSettingsEditor />`,
);

if (changed) fs.writeFileSync(file, src);
console.log(`[content-settings] ${changed ? "concluído com alterações" : "já aplicado"}`);

await import("./patch-brand-kit-assets-v1.mjs");
