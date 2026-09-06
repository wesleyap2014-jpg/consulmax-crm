import fs from "node:fs";

const file = "src/pages/MarketingContentCenter.tsx";
let src = fs.readFileSync(file, "utf8");
const from = 'const ideias = ideas.filter((item) => item.status !== "converted").length;';
const to = 'const ideias = ideas.filter((item) => !["converted", "rejected"].includes(String(item.status || ""))).length;';
if (src.includes(from)) {
  src = src.replace(from, to);
  fs.writeFileSync(file, src, "utf8");
  console.log("[rejected-ideas] reprovadas removidas do contador da esteira");
} else {
  console.log("[rejected-ideas] contador já ajustado ou âncora não encontrada");
}
