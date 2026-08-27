import fs from "node:fs";

function patchFile(file, changes) {
  let src = fs.readFileSync(file, "utf8");
  let changed = false;

  for (const change of changes) {
    if (src.includes(change.to)) continue;
    if (!src.includes(change.from)) {
      console.log(`[central-conteudo] ${file} · ${change.label}: âncora não encontrada`);
      continue;
    }
    src = src.replace(change.from, change.to);
    changed = true;
    console.log(`[central-conteudo] ${file} · ${change.label}: aplicado`);
  }

  if (changed) fs.writeFileSync(file, src);
}

patchFile("src/router.tsx", [
  {
    label: "lazy page",
    from: 'const Marketing = React.lazy(() => import("./pages/Marketing"));\n',
    to: 'const Marketing = React.lazy(() => import("./pages/Marketing"));\nconst MarketingContentCenter = React.lazy(() => import("./pages/MarketingContentCenter"));\n',
  },
  {
    label: "rota",
    from: '          { path: "marketing", element: withSuspense(<Marketing />) },\n',
    to: '          { path: "marketing", element: withSuspense(<Marketing />) },\n          { path: "marketing/conteudo", element: withSuspense(<MarketingContentCenter />) },\n',
  },
]);

patchFile("src/components/layout/Sidebar.tsx", [
  {
    label: "menu",
    from: '          { to: "/marketing", label: "Central de Marketing", icon: Megaphone, end: true },\n',
    to: '          { to: "/marketing", label: "Central de Marketing", icon: Megaphone, end: true },\n          { to: "/marketing/conteudo", label: "Central de Conteúdo", icon: Layers, end: true },\n',
  },
]);

console.log("[central-conteudo] patch concluído");
