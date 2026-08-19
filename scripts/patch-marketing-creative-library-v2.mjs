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

await import("./patch-marketing-creative-edit-v3.mjs");
