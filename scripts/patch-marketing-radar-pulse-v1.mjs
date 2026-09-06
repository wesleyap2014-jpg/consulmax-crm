import fs from "node:fs";

const socialFile = "api/marketing/_social.ts";
let source = fs.readFileSync(socialFile, "utf8");
const from = `      "pages_show_list",\n      "pages_read_engagement",\n      "pages_manage_posts",\n      "pages_manage_engagement",`;
const to = `      "pages_show_list",\n      "pages_read_engagement",\n      "instagram_basic",\n      "instagram_content_publish",\n      "instagram_manage_comments",\n      "instagram_manage_insights",\n      "pages_manage_metadata",\n      "pages_manage_posts",\n      "pages_manage_engagement",`;

if (!source.includes(to)) {
  if (!source.includes(from)) {
    const previous = `      "pages_show_list",\n      "pages_read_engagement",\n      "instagram_basic",\n      "pages_manage_posts",\n      "pages_manage_engagement",`;
    if (!source.includes(previous)) throw new Error("[patch-marketing-radar-pulse-v1] âncora de escopos Meta não encontrada");
    source = source.replace(previous, to);
  } else {
    source = source.replace(from, to);
  }
  fs.writeFileSync(socialFile, source);
  console.log("[patch-marketing-radar-pulse-v1] escopos Meta da Central atualizados");
} else {
  console.log("[patch-marketing-radar-pulse-v1] escopos Meta já aplicados");
}

const radarFile = "api/marketing/radar-run.ts";
let radar = fs.readFileSync(radarFile, "utf8");
const radarFrom = "engagementRates.filter((value) => value > 0)";
const radarTo = "engagementRates.filter((value: number) => value > 0)";
if (!radar.includes(radarTo)) {
  if (!radar.includes(radarFrom)) throw new Error("[patch-marketing-radar-pulse-v1] âncora de tipagem do Radar não encontrada");
  radar = radar.replace(radarFrom, radarTo);
  fs.writeFileSync(radarFile, radar);
  console.log("[patch-marketing-radar-pulse-v1] tipagem do Radar corrigida");
} else {
  console.log("[patch-marketing-radar-pulse-v1] tipagem do Radar já corrigida");
}
