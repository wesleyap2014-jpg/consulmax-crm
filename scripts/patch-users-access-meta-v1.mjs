import fs from "node:fs";

const file = "src/pages/Usuarios.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.log(`[users-access-meta] ${label}: âncora não encontrada`);
    return;
  }
  src = src.replace(from, to);
  changed = true;
  console.log(`[users-access-meta] ${label}: aplicado`);
}

replaceOnce(
  '  const [totalRows, setTotalRows] = useState(0);\n\n  async function loadUsers() {',
  `  const [totalRows, setTotalRows] = useState(0);\n  const [accessMeta, setAccessMeta] = useState<Record<string, { profileName: string | null; categoryName: string | null }>>({});\n\n  async function loadAccessMeta(userIds: string[]) {\n    if (!userIds.length) {\n      setAccessMeta({});\n      return;\n    }\n    try {\n      const { data: assignments, error } = await supabase\n        .from("user_access_assignments")\n        .select("user_id,access_profile_id,partner_category_id")\n        .in("user_id", userIds);\n      if (error) throw error;\n\n      const profileIds = Array.from(new Set((assignments || []).map((row: any) => row.access_profile_id).filter(Boolean)));\n      const categoryIds = Array.from(new Set((assignments || []).map((row: any) => row.partner_category_id).filter(Boolean)));\n      const [profilesRes, categoriesRes] = await Promise.all([\n        profileIds.length\n          ? supabase.from("access_profiles").select("id,name").in("id", profileIds)\n          : Promise.resolve({ data: [], error: null }),\n        categoryIds.length\n          ? supabase.from("partner_categories").select("id,name").in("id", categoryIds)\n          : Promise.resolve({ data: [], error: null }),\n      ]);\n      const profileNames = new Map(((profilesRes as any).data || []).map((row: any) => [row.id, row.name]));\n      const categoryNames = new Map(((categoriesRes as any).data || []).map((row: any) => [row.id, row.name]));\n      const next: Record<string, { profileName: string | null; categoryName: string | null }> = {};\n      for (const userId of userIds) next[userId] = { profileName: null, categoryName: null };\n      for (const row of assignments || []) {\n        next[(row as any).user_id] = {\n          profileName: (row as any).access_profile_id ? (profileNames.get((row as any).access_profile_id) as string | undefined) || null : null,\n          categoryName: (row as any).partner_category_id ? (categoryNames.get((row as any).partner_category_id) as string | undefined) || null : null,\n        };\n      }\n      setAccessMeta(next);\n    } catch (e) {\n      console.warn("[Usuarios] não foi possível carregar perfil/categoria", e);\n      setAccessMeta({});\n    }\n  }\n\n  async function loadUsers() {`,
  "estado e carregamento de perfil/categoria",
);

replaceOnce(
  '      setUsers(sorted);\n      setTotalRows(count || 0);\n',
  '      setUsers(sorted);\n      setTotalRows(count || 0);\n      await loadAccessMeta(sorted.map((row: any) => row.id));\n',
  "enriquecimento da listagem",
);

replaceOnce(
  `          <td style={td}>\n            <span style={roleBadge(u.role)}>{String(u.role || "").toUpperCase()}</span>\n          </td>\n          <td style={td}>\n            {unit ? (`,
  `          <td style={td}>\n            <span style={roleBadge(u.role)}>{String(u.role || "").toUpperCase()}</span>\n          </td>\n          <td style={td}>\n            <div style={{ fontWeight: 850 }}>{accessMeta[u.id]?.profileName || "Legado atual"}</div>\n            <div style={miniText}>Perfil de acesso</div>\n          </td>\n          <td style={td}>\n            {accessMeta[u.id]?.categoryName ? (\n              <span style={{ ...roleBadge("vendedor"), background: "#F3E8FF", color: "#6B21A8" }}>\n                {accessMeta[u.id]?.categoryName}\n              </span>\n            ) : (\n              <span style={miniText}>Não se aplica</span>\n            )}\n          </td>\n          <td style={td}>\n            {unit ? (`,
  "colunas no corpo",
);

replaceOnce(
  '          colSpan={9}\n          rows={renderUserRows(activeUsers)}',
  '          colSpan={11}\n          rows={renderUserRows(activeUsers)}',
  "colspan ativos",
);
replaceOnce(
  '              colSpan={9}\n              rows={renderUserRows(inactiveUsers, true)}',
  '              colSpan={11}\n              rows={renderUserRows(inactiveUsers, true)}',
  "colspan inativos",
);

replaceOnce(
  `            <th style={th}>Perfil</th>\n            <th style={th}>Unidade</th>`,
  `            <th style={th}>Papel</th>\n            <th style={th}>Perfil de Acesso</th>\n            <th style={th}>Categoria</th>\n            <th style={th}>Unidade</th>`,
  "cabeçalhos",
);

replaceOnce(
  '<p style={subtitle}>Cadastre usuários, vincule unidades e defina a hierarquia de acesso.</p>',
  '<p style={subtitle}>Cadastre usuários, vincule unidades, defina a cascata, o Perfil de Acesso e a Categoria do Parceiro.</p>',
  "subtítulo",
);

if (changed) fs.writeFileSync(file, src);
console.log(`[users-access-meta] ${changed ? "concluído com alterações" : "já aplicado"}`);
