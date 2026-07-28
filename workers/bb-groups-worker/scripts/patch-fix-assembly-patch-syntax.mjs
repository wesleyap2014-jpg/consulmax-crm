import fs from "node:fs";

const file = "scripts/patch-bb-assembly-result-worker.mjs";

if (!fs.existsSync(file)) {
  console.log("patch fix assembly syntax: file not found");
  process.exit(0);
}

let source = fs.readFileSync(file, "utf8");

const broken = '            message: `Grupo ${grupo}: nenhum resultado de assembleia disponível. Consulta concluída com sucesso.`,';
const fixed = '            message: \\`Grupo \\${grupo}: nenhum resultado de assembleia disponível. Consulta concluída com sucesso.\\`,';

if (source.includes(fixed)) {
  console.log("patch fix assembly syntax: already applied");
  process.exit(0);
}

if (!source.includes(broken)) {
  console.log("patch fix assembly syntax: target not found");
  process.exit(0);
}

source = source.replace(broken, fixed);
fs.writeFileSync(file, source);
console.log("patch fix assembly syntax: applied");
