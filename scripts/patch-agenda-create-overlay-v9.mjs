import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

const createDrawerRegex = /function CreateDrawer\([\s\S]*?\n}\n\nconst AGENDA_CSS/;
const match = src.match(createDrawerRegex);

if (match && !match[0].includes("<EventOverlay")) {
  let block = match[0];
  block = block.replace("return <Drawer onClose={onClose}>", "return <EventOverlay onClose={onClose}>");
  block = block.replace(/<\/Drawer>;\n}\n\nconst AGENDA_CSS$/, "</EventOverlay>;\n}\n\nconst AGENDA_CSS");
  src = src.replace(match[0], block);
  console.log("[agenda-v9] novo compromisso migrado para overlay");
} else if (match?.[0].includes("<EventOverlay")) {
  console.log("[agenda-v9] overlay de novo compromisso já aplicado");
} else {
  console.log("[agenda-v9] CreateDrawer não encontrado");
}

// O overlay já existe desde o patch v8. Aqui refinamos apenas o formulário,
// mantendo o cabeçalho e as ações acessíveis em formulários longos.
if (!src.includes("/* agenda-create-overlay-v9 */")) {
  const cssAnchor = `.cx-event-overlay-scroll .cx-drawer-section { margin-top: 16px; }`;
  const cssExtra = `${cssAnchor}\n      /* agenda-create-overlay-v9 */\n      .cx-event-overlay-scroll .cx-form { align-items: start; }\n      .cx-event-overlay-scroll .cx-drawer-footer { position: sticky; bottom: -28px; z-index: 4; margin: 20px -26px -28px; padding: 16px 26px 18px; background: rgba(255,255,255,.97); backdrop-filter: blur(10px); border-top: 1px solid #eef0f3; }`;
  if (src.includes(cssAnchor)) {
    src = src.replace(cssAnchor, cssExtra);
    const mobileAnchor = `.cx-event-overlay-scroll .cx-drawer-head { top: -18px; margin: -18px -16px 16px; padding: 18px 16px 14px; }`;
    if (src.includes(mobileAnchor)) {
      src = src.replace(mobileAnchor, `${mobileAnchor}\n        .cx-event-overlay-scroll .cx-drawer-footer { bottom: -28px; margin: 18px -16px -28px; padding: 14px 16px calc(16px + env(safe-area-inset-bottom)); }`);
    }
    console.log("[agenda-v9] refinamentos do formulário no overlay aplicados");
  }
}

if (src !== before) fs.writeFileSync(path, src);
console.log(`[agenda-v9] AgendaExecutive: ${src !== before ? "atualizado" : "sem alterações"}`);
