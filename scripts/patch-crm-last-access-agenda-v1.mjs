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

patch("src/pages/AgendaExecutive.tsx", [
  (src) => src.replace(
    'const bStart = new Date(); bStart.setHours(0, 0, 0, 0); const bEnd = addDays(bStart, 90); bEnd.setHours(23, 59, 59, 999);\n      let birthQ = supabase.from("agenda_eventos").select(EVENT_SELECT).eq("tipo", "aniversario").gte("inicio_at", bStart.toISOString()).lte("inicio_at", bEnd.toISOString()).order("inicio_at", { ascending: true }).limit(200);',
    'const bStartKey = toDateKey(new Date()); const bEndKey = toDateKey(addDays(new Date(), 90));\n      let birthQ = supabase.from("agenda_eventos").select(EVENT_SELECT).eq("tipo", "aniversario").gte("inicio_at", `${bStartKey}T00:00:00.000Z`).lte("inicio_at", `${bEndKey}T23:59:59.999Z`).order("inicio_at", { ascending: true }).limit(200);',
  ),
  (src) => src.replace(
    '<button className="cx-action-btn strong" onClick={props.onVideo} disabled={props.videoLoading}><Video size={17} /> {props.videoLoading ? "Preparando…" : "Entrar na reunião"}</button>',
    '{ev.tipo === "reuniao" && <button className="cx-action-btn strong" onClick={props.onVideo} disabled={props.videoLoading}><Video size={17} /> {props.videoLoading ? "Preparando…" : "Entrar na reunião"}</button>}',
  ),
  (src) => src.includes("async function copyAttendanceLink(ev: AgendaEvent)") ? src : src.replace(
    '\nexport default function AgendaExecutive() {',
    `\nasync function copyAttendanceLink(ev: AgendaEvent) {\n  try {\n    const { data: authData, error: authError } = await supabase.auth.getUser();\n    if (authError || !authData.user) throw new Error("Usuário não autenticado.");\n    const { data: existing, error: selectError } = await supabase\n      .from("agenda_attendance_links")\n      .select("token")\n      .eq("event_id", ev.id)\n      .maybeSingle();\n    if (selectError) throw selectError;\n    let token = existing?.token || null;\n    if (!token) {\n      const { data: created, error: insertError } = await supabase\n        .from("agenda_attendance_links")\n        .insert({ event_id: ev.id, created_by: authData.user.id, is_active: true })\n        .select("token")\n        .single();\n      if (insertError) throw insertError;\n      token = created?.token || null;\n    }\n    if (!token) throw new Error("Não foi possível gerar o link.");\n    const url = window.location.origin + "/presenca/" + token;\n    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);\n    else window.prompt("Copie o link de presença:", url);\n    alert("Link de presença copiado.");\n  } catch (e) {\n    const error = e instanceof Error ? e.message : "erro desconhecido";\n    alert("Não foi possível gerar o link de presença: " + error);\n  }\n}\n\nexport default function AgendaExecutive() {`,
  ),
  (src) => src.includes('>Link de presença</button>') ? src : src.replace(
    '{ev.opportunity_id && <button className="cx-action-btn" onClick={() => props.onOpportunity(ev)}><ExternalLink size={17} /> Abrir oportunidade</button>}',
    '{ev.opportunity_id && <button className="cx-action-btn" onClick={() => props.onOpportunity(ev)}><ExternalLink size={17} /> Abrir oportunidade</button>}{ev.tipo === "reuniao" && <button className="cx-action-btn" onClick={() => copyAttendanceLink(ev)}><Users size={17} /> Link de presença</button>}',
  ),
]);
