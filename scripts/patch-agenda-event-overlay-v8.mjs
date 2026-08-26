import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

const drawerRegex = /function EventDrawer\([\s\S]*?\n}\n\nfunction Detail/;
const match = src.match(drawerRegex);

if (match && !match[0].includes("<EventOverlay")) {
  let drawer = match[0];
  drawer = drawer.replace("return <Drawer onClose={props.onClose}>", "return <EventOverlay onClose={props.onClose}>");
  drawer = drawer.replace(/<\/Drawer>;\n}\n\nfunction Detail$/, "</EventOverlay>;\n}\n\nfunction Detail");
  src = src.replace(match[0], drawer);
  console.log("[agenda-v8] detalhes do compromisso migrados para overlay");
} else if (match?.[0].includes("<EventOverlay")) {
  console.log("[agenda-v8] overlay já aplicado");
} else {
  console.log("[agenda-v8] EventDrawer não encontrado");
}

if (!src.includes("function EventOverlay(")) {
  const marker = "function Detail";
  const component = `function EventOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {\n  useEffect(() => {\n    const previous = document.body.style.overflow;\n    document.body.style.overflow = \"hidden\";\n    const onKey = (event: KeyboardEvent) => { if (event.key === \"Escape\") onClose(); };\n    window.addEventListener(\"keydown\", onKey);\n    return () => { document.body.style.overflow = previous; window.removeEventListener(\"keydown\", onKey); };\n  }, [onClose]);\n\n  return <>\n    <style>{\`\n      .cx-event-overlay-backdrop { position: fixed; inset: 0; z-index: 1200; background: rgba(15,23,42,.58); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 24px; animation: cxOverlayFade .16s ease-out; }\n      .cx-event-overlay-panel { width: min(1040px, calc(100vw - 48px)); max-height: min(900px, calc(100dvh - 48px)); background: #fff; border: 1px solid rgba(181,165,115,.35); border-radius: 22px; box-shadow: 0 28px 80px rgba(15,23,42,.30); overflow: hidden; animation: cxOverlayRise .18s ease-out; }\n      .cx-event-overlay-scroll { max-height: min(900px, calc(100dvh - 48px)); overflow: auto; overscroll-behavior: contain; padding: 24px 26px 28px; }\n      .cx-event-overlay-scroll .cx-drawer-head { position: sticky; top: -24px; z-index: 3; margin: -24px -26px 18px; padding: 22px 26px 16px; background: rgba(255,255,255,.96); backdrop-filter: blur(10px); border-bottom: 1px solid #eef0f3; }\n      .cx-event-overlay-scroll .cx-detail-card { border-radius: 16px; }\n      .cx-event-overlay-scroll .cx-drawer-section { margin-top: 16px; }\n      @keyframes cxOverlayFade { from { opacity: 0; } to { opacity: 1; } }\n      @keyframes cxOverlayRise { from { opacity: 0; transform: translateY(10px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }\n      @media (max-width: 720px) {\n        .cx-event-overlay-backdrop { padding: 0; place-items: stretch; }\n        .cx-event-overlay-panel { width: 100%; max-height: 100dvh; height: 100dvh; border: 0; border-radius: 0; }\n        .cx-event-overlay-scroll { max-height: 100dvh; height: 100dvh; padding: 18px 16px 28px; }\n        .cx-event-overlay-scroll .cx-drawer-head { top: -18px; margin: -18px -16px 16px; padding: 18px 16px 14px; }\n      }\n    \`}</style>\n    <div className=\"cx-event-overlay-backdrop\" role=\"dialog\" aria-modal=\"true\" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>\n      <div className=\"cx-event-overlay-panel\" onMouseDown={(event) => event.stopPropagation()}>\n        <div className=\"cx-event-overlay-scroll\">{children}</div>\n      </div>\n    </div>\n  </>;\n}\n\n`;
  if (src.includes(marker)) {
    src = src.replace(marker, `${component}${marker}`);
    console.log("[agenda-v8] componente EventOverlay adicionado");
  }
}

if (src !== before) fs.writeFileSync(path, src);
console.log(`[agenda-v8] AgendaExecutive: ${src !== before ? "atualizado" : "sem alterações"}`);
