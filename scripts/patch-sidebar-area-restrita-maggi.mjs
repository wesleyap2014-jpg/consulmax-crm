import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/layout/Sidebar.tsx");
let source = fs.readFileSync(filePath, "utf8");
let changed = false;

if (!source.includes("  Bot,\n")) {
  const anchor = "  BarChart3,\n";
  if (!source.includes(anchor)) throw new Error("Importação BarChart3 não encontrada no Sidebar.");
  source = source.replace(anchor, `${anchor}  Bot,\n`);
  changed = true;
}

if (!source.includes('"/robos"')) {
  const anchor = 'if (isAnyPathActive(pathname, ["/relatorios", "/usuarios", "/parametros", "/clientes", "/processos", "/rh"])) {';
  const replacement = 'if (isAnyPathActive(pathname, ["/relatorios", "/usuarios", "/parametros", "/robos", "/clientes", "/processos", "/rh"])) {';
  if (!source.includes(anchor)) throw new Error("Grupo Administrativo não encontrado no Sidebar.");
  source = source.replace(anchor, replacement);
  changed = true;
}

if (!source.includes('to: "/robos/area-restrita-maggi"')) {
  const anchor = '          { to: "/parametros", label: "Parâmetros", icon: SlidersHorizontal, end: true },\n';
  const item = '          { to: "/robos/area-restrita-maggi", label: "Robô Área Restrita", icon: Bot, onlyForWesley: true, end: true },\n';
  if (!source.includes(anchor)) throw new Error("Item Parâmetros não encontrado no Sidebar.");
  source = source.replace(anchor, `${anchor}${item}`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source);
  console.log("Sidebar atualizado com a Área Restrita Maggi.");
} else {
  console.log("Sidebar da Área Restrita Maggi já estava atualizado.");
}
