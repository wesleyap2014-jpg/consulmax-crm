import fs from "node:fs";

const socialFile = "api/marketing/_social.ts";
let source = fs.readFileSync(socialFile, "utf8");
const from = `      "pages_show_list",\n      "pages_read_engagement",\n      "pages_manage_posts",`;
const to = `      "pages_show_list",\n      "pages_read_engagement",\n      "instagram_basic",\n      "pages_manage_posts",`;

if (!source.includes(to)) {
  if (!source.includes(from)) throw new Error("[patch-marketing-radar-pulse-v1] âncora de escopos Meta não encontrada");
  source = source.replace(from, to);
  fs.writeFileSync(socialFile, source);
  console.log("[patch-marketing-radar-pulse-v1] instagram_basic adicionado ao Facebook OAuth");
} else {
  console.log("[patch-marketing-radar-pulse-v1] escopo já aplicado");
}
