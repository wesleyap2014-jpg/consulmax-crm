import fs from "node:fs";

function patch(file, transforms) {
  let src = fs.readFileSync(file, "utf8");
  const before = src;
  for (const transform of transforms) src = transform(src);
  if (src !== before) fs.writeFileSync(file, src);
  console.log(`[crm-access-agenda-v1] ${file}: ${src !== before ? "aplicado" : "sem alterações"}`);
}

patch("src/access/AccessContext.tsx", [
  (src) => {
    const oldBlock = `  useEffect(() => {\n    refresh();\n    const handler = () => refresh();\n    window.addEventListener("crm:access-updated", handler);\n    return () => window.removeEventListener("crm:access-updated", handler);\n  }, [refresh]);`;
    const newBlock = `  useEffect(() => {\n    let cancelled = false;\n\n    (async () => {\n      const { error: accessError } = await supabase.rpc("touch_crm_access");\n      if (accessError) console.warn("[AccessProvider] não foi possível registrar acesso ao CRM", accessError);\n      if (!cancelled) await refresh();\n    })();\n\n    const handler = () => refresh();\n    window.addEventListener("crm:access-updated", handler);\n    return () => {\n      cancelled = true;\n      window.removeEventListener("crm:access-updated", handler);\n    };\n  }, [refresh]);`;
    return src.includes(oldBlock) ? src.replace(oldBlock, newBlock) : src;
  },
]);

patch("src/pages/MeuPerfil.tsx", [
  (src) => src.includes("  last_crm_access_at?: string | null;") ? src : src.replace("  created_at?: string | null;\n};", "  created_at?: string | null;\n  last_crm_access_at?: string | null;\n};"),
  (src) => src.replace("cidade,uf,created_at\")", "cidade,uf,created_at,last_crm_access_at\")"),
  (src) => src.replace("lastSignInAt: authUser.last_sign_in_at || null,", "lastSignInAt: profile.last_crm_access_at || authUser.last_sign_in_at || null,"),
  (src) => src.replaceAll("Último login", "Último acesso ao CRM"),
]);

patch("src/pages/MeuPerfilCascata.tsx", [
  (src) => src.includes("  last_crm_access_at?: string | null;") ? src : src.replace("  created_at?: string | null;\n};", "  created_at?: string | null;\n  last_crm_access_at?: string | null;\n};"),
  (src) => src.replace("cidade,uf,created_at\")", "cidade,uf,created_at,last_crm_access_at\")"),
  (src) => src.replace(
    '<div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Clock3 className="h-4 w-4" /> Última atividade registrada</div>\n              <div className="mt-1 text-xs text-slate-500">{formatDateBR(data.audit[0]?.at, true)}</div>',
    '<div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Clock3 className="h-4 w-4" /> Último acesso ao CRM</div>\n              <div className="mt-1 text-xs text-slate-500">{formatDateBR(profile.last_crm_access_at, true)}</div>',
  ),
]);

patch("src/pages/AgendaLiveKit.tsx", [
  (src) => src.replace('const ids = users.map((u) => u.id).filter(Boolean);', 'const ids = users.map((u) => u.auth_user_id).filter(Boolean);'),
  (src) => src.replace('user_id: me?.id || null, cliente_id: null, lead_id: null', 'user_id: me?.auth_user_id || null, cliente_id: null, lead_id: null'),
  (src) => src.replaceAll('<option key={u.id} value={u.id}>', '<option key={u.id} value={u.auth_user_id}>'),
]);
