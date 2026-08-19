import fs from "node:fs";

const path = "src/pages/Marketing.tsx";
let text = fs.readFileSync(path, "utf8");

const importLine = 'import MarketingNewsletterPanel from "./MarketingNewsletterPanel";';
const creativeImport = 'import MarketingCreativeLibraryV2 from "./MarketingCreativeLibraryV2";';
if (!text.includes(creativeImport)) {
  if (!text.includes(importLine)) throw new Error("[creative-library-v2] newsletter import anchor not found");
  text = text.replace(importLine, `${importLine}\n${creativeImport}`);
}

const startMarker = '        <TabsContent value="criativos" className="mt-5 space-y-5">';
const start = text.indexOf(startMarker);
if (start < 0) throw new Error("[creative-library-v2] creative tab start not found");
const endMarker = '\n        </TabsContent>';
const end = text.indexOf(endMarker, start);
if (end < 0) throw new Error("[creative-library-v2] creative tab end not found");

const replacement = `        <TabsContent value="criativos" className="mt-5">
          <MarketingCreativeLibraryV2
            canManage={canManage}
            campaigns={campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
            userId={userId}
            onChanged={() => void loadAll()}
          />
        </TabsContent>`;

text = text.slice(0, start) + replacement + text.slice(end + endMarker.length);

fs.writeFileSync(path, text, "utf8");
console.log("Creative library v2 patch applied");

const v3Path = "scripts/patch-marketing-creative-edit-v3.mjs";
let v3Runtime = fs.readFileSync(v3Path, "utf8");
v3Runtime = v3Runtime.replaceAll(
  'return setError(`Selecione pelo menos ${config.min} arquivos para ${config.label}.`);',
  'return setError("Selecione pelo menos " + config.min + " arquivos para " + config.label + ".");',
);
v3Runtime = v3Runtime.replace(
  'const path = `library/${new Date().getFullYear()}/${batch}/${String(index + 1).padStart(2, "0")}-${name}`;',
  'const path = "library/" + new Date().getFullYear() + "/" + batch + "/" + String(index + 1).padStart(2, "0") + "-" + name;',
);

const noteStart = v3Runtime.indexOf('if (!text.includes("Arquivos atuais")) {');
const noteEnd = v3Runtime.indexOf('\nconst oldFooter', noteStart);
if (noteStart < 0 || noteEnd < 0) throw new Error("[creative-library-v2] current files runtime block not found");
const safeNoteBlock = [
  'if (!text.includes("Arquivos atuais")) {',
  '  replaceOnce(',
  '    selectedFilesBlock,',
  '    selectedFilesBlock + \'\\n              {editing && selectedFiles.length === 0 && (assetsByCreative[editing.id] || []).length > 0 && <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800"><strong>Arquivos atuais:</strong> {(assetsByCreative[editing.id] || []).map((asset, index) => asset.file_name || ("Arquivo " + (index + 1))).join(" • ")}<br /><span className="text-blue-600">Se não selecionar novos arquivos, os atuais serão mantidos.</span></div>}\',',
  '    "current files note",',
  '  );',
  '}',
].join("\n");
v3Runtime = v3Runtime.slice(0, noteStart) + safeNoteBlock + v3Runtime.slice(noteEnd);

const runtimePath = "scripts/.patch-marketing-creative-edit-v3-runtime.mjs";
fs.writeFileSync(runtimePath, v3Runtime, "utf8");
await import(`./.patch-marketing-creative-edit-v3-runtime.mjs?build=${Date.now()}`);
fs.rmSync(runtimePath, { force: true });
