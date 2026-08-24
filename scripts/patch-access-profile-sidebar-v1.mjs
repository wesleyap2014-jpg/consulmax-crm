import fs from "node:fs";

const file = "src/components/layout/Sidebar.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.log(`[access-profile-sidebar] ${label}: âncora não encontrada`);
    return;
  }
  src = src.replace(from, to);
  changed = true;
  console.log(`[access-profile-sidebar] ${label}: aplicado`);
}

replaceOnce(
  'import { supabase } from "@/lib/supabaseClient";\n',
  'import { supabase } from "@/lib/supabaseClient";\nimport { useAccess } from "@/access/AccessContext";\nimport { guideKeyForPath } from "@/access/permissionCatalog";\n',
  "imports de acesso",
);

replaceOnce(
  '  const { hasUnread: hasWhatsappUnread, unreadCount: whatsappUnreadCount } =\n    useWhatsAppUnread();\n',
  '  const { hasUnread: hasWhatsappUnread, unreadCount: whatsappUnreadCount } =\n    useWhatsAppUnread();\n  const { canViewGuide } = useAccess();\n',
  "contexto de acesso",
);

const navEnd = `  const widthClass = useMemo(() => {`;
const permissionHelpers = `  const canRenderItem = (item: FlatItem) => {\n    if (!itemIsVisible(item, authUserId)) return false;\n    const guideKey = guideKeyForPath(item.to);\n    return !guideKey || canViewGuide(guideKey);\n  };\n\n  const groupHasVisibleItems = (key: GroupKey) =>\n    navGroups[key].items.some((item) => canRenderItem(item));\n\n  const widthClass = useMemo(() => {`;
replaceOnce(navEnd, permissionHelpers, "helpers de visibilidade");

replaceOnce(
  '    if (!itemIsVisible(item, authUserId)) return null;\n',
  '    if (!canRenderItem(item)) return null;\n',
  "filtro por item",
);

replaceOnce(
  '  const renderSectionPill = (key: GroupKey) => {\n    const group = navGroups[key];\n',
  '  const renderSectionPill = (key: GroupKey) => {\n    const group = navGroups[key];\n    if (!groupHasVisibleItems(key)) return null;\n',
  "filtro por seção",
);

replaceOnce(
  `            {(["vendas", "marketing", "pos", "admin", "fin", "max"] as GroupKey[]).map((key) => (\n              <div key={key} className="grid gap-2">\n                {renderSectionPill(key)}\n                {openGroup === key && (\n                  <div className="ml-4 grid gap-2">\n                    {navGroups[key].items.map((item) => renderNavItem(item))}\n                  </div>\n                )}\n              </div>\n            ))}`,
  `            {(["vendas", "marketing", "pos", "admin", "fin", "max"] as GroupKey[]).map((key) =>\n              groupHasVisibleItems(key) ? (\n                <div key={key} className="grid gap-2">\n                  {renderSectionPill(key)}\n                  {openGroup === key && (\n                    <div className="ml-4 grid gap-2">\n                      {navGroups[key].items.map((item) => renderNavItem(item))}\n                    </div>\n                  )}\n                </div>\n              ) : null,\n            )}`,
  "remove seções vazias",
);

replaceOnce(
  '          to="/oportunidades"\n',
  '          to="/inicio"\n',
  "logo aponta para rota universal",
);
replaceOnce(
  '          aria-label="Ir para Oportunidades"\n',
  '          aria-label="Ir para Início"\n',
  "aria do logo",
);

if (changed) fs.writeFileSync(file, src);
console.log(`[access-profile-sidebar] ${changed ? "concluído com alterações" : "já aplicado"}`);

await import("./patch-seguros-v1.mjs");
await import("./patch-seguros-policy-issued-v2.mjs");
