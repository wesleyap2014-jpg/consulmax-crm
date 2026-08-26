import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

function log(label, ok = true) {
  console.log(`[agenda-v10] ${label}: ${ok ? "aplicado" : "trecho não encontrado"}`);
}

// 1) Remove o campo de link externo da criação. A videoconferência Consulmax continua intacta.
const externalLinkFields = [
  `<label className="full">Link externo opcional<input value={draft.link} onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} placeholder="Google Meet, Teams ou outro link, se preferir" /></label>`,
  `<label className="full">Link de reunião (opcional)<input value={draft.link} onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} placeholder="Google Meet, Teams ou outro link" /></label>`,
];
let removedLink = false;
for (const field of externalLinkFields) {
  if (src.includes(field)) {
    src = src.split(field).join("");
    removedLink = true;
  }
}
console.log(`[agenda-v10] campo de link externo: ${removedLink ? "removido" : "já ausente"}`);

// 2) Compacta o seletor de usuários internos: três por padrão, com expansão sob demanda.
if (!src.includes('const [internalExpanded, setInternalExpanded] = useState(false);')) {
  const anchor = `  const [internalSearch, setInternalSearch] = useState("");\n`;
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${anchor}  const [internalExpanded, setInternalExpanded] = useState(false);\n`);
    log("estado de expansão dos convidados internos");
  } else log("estado de expansão dos convidados internos", false);
}

if (!src.includes("const matchingInternalCandidates =")) {
  const oldLine = `  const visibleInternalCandidates = internalCandidates.filter((u) => !internalSearchKey || normalizeText(\`${"${u.nome || \"\"} ${u.email || \"\"}"}\`).includes(internalSearchKey));\n`;
  const replacement = `  const matchingInternalCandidates = internalCandidates\n    .filter((u) => !internalSearchKey || normalizeText(String(u.nome || "") + " " + String(u.email || "")).includes(internalSearchKey))\n    .sort((a, b) => Number(draft.internalGuestIds.includes(b.auth_user_id)) - Number(draft.internalGuestIds.includes(a.auth_user_id)) || String(a.nome || a.email || "").localeCompare(String(b.nome || b.email || ""), "pt-BR"));\n  const visibleInternalCandidates = internalExpanded ? matchingInternalCandidates : matchingInternalCandidates.slice(0, 3);\n`;
  if (src.includes(oldLine)) {
    src = src.replace(oldLine, replacement);
    log("limite inicial de três usuários internos");
  } else {
    const regex = /  const visibleInternalCandidates = internalCandidates\.filter\(\(u\) => !internalSearchKey \|\| normalizeText\([\s\S]*?\);\n/;
    if (regex.test(src)) {
      src = src.replace(regex, replacement);
      log("limite inicial de três usuários internos");
    } else log("limite inicial de três usuários internos", false);
  }
}

const internalStartMarker = `<div className="full" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}><div><strong style={{ display: "block", color: C.navy, fontSize: 12 }}>Convidados internos</strong>`;
const externalMarker = `<div className="full" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><strong style={{ color: C.navy, fontSize: 12 }}>Convidados externos</strong>`;
if (!src.includes("Ver todos os usuários")) {
  const start = src.indexOf(internalStartMarker);
  const end = start >= 0 ? src.indexOf(externalMarker, start) : -1;
  if (start >= 0 && end >= 0) {
    const compactPicker = `<div className="full" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}><div><strong style={{ display: "block", color: C.navy, fontSize: 12 }}>Convidados internos</strong><small style={{ color: C.muted }}>Usuários do CRM receberão o convite no e-mail cadastrado.</small></div><span style={{ flexShrink: 0, border: "1px solid #E0CE8C", background: "#FFFDF6", color: C.navy, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800 }}>{selectedInternalCount} de {internalCandidates.length} selecionado(s)</span></div><div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 7, marginBottom: 9 }}><div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} /><input value={internalSearch} onChange={(e) => setInternalSearch(e.target.value)} placeholder="Buscar por nome ou e-mail…" style={{ width: "100%", paddingLeft: 31 }} /></div><button type="button" className="cx-secondary" onClick={selectAllInternal} disabled={allInternalSelected || !internalCandidates.length} style={{ whiteSpace: "nowrap" }}>{allInternalSelected ? "Todos selecionados" : "Selecionar todos"}</button><button type="button" className="cx-secondary" onClick={clearInternal} disabled={!selectedInternalCount} style={{ whiteSpace: "nowrap" }}>Limpar</button></div><div style={{ display: "grid", gap: 0, maxHeight: internalExpanded ? 240 : "none", overflowY: internalExpanded ? "auto" : "visible", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>{visibleInternalCandidates.map((u, index) => { const checked = draft.internalGuestIds.includes(u.auth_user_id); return <label key={u.auth_user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", cursor: "pointer", borderBottom: index < visibleInternalCandidates.length - 1 ? "1px solid #eef0f3" : "0", background: checked ? "#FFFDF6" : "transparent" }}><input type="checkbox" checked={checked} onChange={(e) => setDraft((d) => ({ ...d, internalGuestIds: e.target.checked ? [...new Set([...d.internalGuestIds, u.auth_user_id])] : d.internalGuestIds.filter((id) => id !== u.auth_user_id) }))} style={{ width: 16, height: 16, flexShrink: 0 }} /><span style={{ minWidth: 0, fontSize: 11 }}><strong style={{ display: "block", color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nome || "Usuário"}</strong><small style={{ display: "block", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</small></span></label>; })}{!visibleInternalCandidates.length && <div style={{ padding: "16px 4px", textAlign: "center" }}><strong style={{ display: "block", color: C.navy, fontSize: 11 }}>{internalCandidates.length ? "Nenhum usuário encontrado" : "Nenhum usuário interno disponível"}</strong><small style={{ color: C.muted }}>{internalCandidates.length ? "Tente buscar por outro nome ou e-mail." : "Os usuários precisam ter e-mail cadastrado no CRM."}</small></div>}</div>{matchingInternalCandidates.length > 3 && <button type="button" className="cx-link-btn" onClick={() => setInternalExpanded((value) => !value)} style={{ marginTop: 8 }}>{internalExpanded ? "Mostrar somente os 3 primeiros" : "Ver todos os usuários (" + matchingInternalCandidates.length + ")"}</button>}</div>`;
    src = src.slice(0, start) + compactPicker + src.slice(end);
    log("seletor interno compacto");
  } else log("seletor interno compacto", false);
}

// 3) Entrega o diretório interno ao detalhe do compromisso e permite atualizar a lista após novos convites.
if (!src.includes("inviteUsers={inviteUsers} onGuestsChanged={loadData}")) {
  const callAnchor = `<EventDrawer ev={selectedEvent}`;
  if (src.includes(callAnchor)) {
    src = src.replace(callAnchor, `<EventDrawer ev={selectedEvent} inviteUsers={inviteUsers} onGuestsChanged={loadData}`);
    log("diretório interno enviado ao overlay do evento");
  } else log("diretório interno enviado ao overlay do evento", false);
}

if (!src.includes("ev: AgendaEvent; inviteUsers: InviteUser[]; onGuestsChanged:")) {
  const signature = `function EventDrawer(props: { ev: AgendaEvent;`;
  if (src.includes(signature)) {
    src = src.replace(signature, `function EventDrawer(props: { ev: AgendaEvent; inviteUsers: InviteUser[]; onGuestsChanged: () => Promise<void> | void;`);
    log("props de gestão de convidados");
  } else log("props de gestão de convidados", false);
}

const drawerStart = src.indexOf("function EventDrawer(props:");
if (drawerStart >= 0 && !src.slice(drawerStart, drawerStart + 2500).includes("guestListExpanded")) {
  const stateLineStart = src.indexOf("  const { ev } = props;", drawerStart);
  const stateLineEnd = stateLineStart >= 0 ? src.indexOf("\n", stateLineStart) : -1;
  if (stateLineStart >= 0 && stateLineEnd >= 0) {
    const extra = `\n  const [guestListExpanded, setGuestListExpanded] = useState(false);\n  const [guestManagerOpen, setGuestManagerOpen] = useState(false);\n  const guestRows = guestListExpanded ? (ev.guests || []) : (ev.guests || []).slice(0, 3);`;
    src = src.slice(0, stateLineEnd) + extra + src.slice(stateLineEnd);
    log("estado da lista e gestão de convidados");
  } else log("estado da lista e gestão de convidados", false);
}

if (!src.includes("Adicionar convidados ao compromisso")) {
  const guestStartMarker = `{ev.guests?.length ? <section className="cx-drawer-section"><div className="cx-section-title"><h3>Convidados</h3>`;
  const guestStart = src.indexOf(guestStartMarker, drawerStart >= 0 ? drawerStart : 0);
  const actionStart = guestStart >= 0 ? src.indexOf(`<div className="cx-action-grid">`, guestStart) : -1;
  if (guestStart >= 0 && actionStart >= 0) {
    const guestSection = `{(Boolean(ev.guests?.length) || props.canEdit) ? <section className="cx-drawer-section"><div className="cx-section-title" style={{ alignItems: "center" }}><div><h3>Convidados</h3><span>{ev.guests?.length || 0} convidado(s)</span></div>{props.canEdit && !cancelled && <button type="button" className="cx-link-btn" onClick={() => setGuestManagerOpen((value) => !value)}><Plus size={14} /> {guestManagerOpen ? "Fechar" : "Adicionar convidados"}</button>}</div>{Boolean(ev.guests?.length) ? <><div style={{ display: "grid", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>{guestRows.map((g, index) => <div key={g.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: index < guestRows.length - 1 ? "1px solid #eef0f3" : "0" }}><div style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: 11, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name || g.email}</strong><small style={{ display: "block", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.email} • {g.guest_type === "internal" ? "Interno" : "Externo"}</small></div><span className={"cx-status " + (g.rsvp_status === "accepted" ? "scheduled" : g.rsvp_status === "declined" ? "late" : "done")}>{g.rsvp_status === "accepted" ? "Confirmado" : g.rsvp_status === "declined" ? "Não irá" : "Aguardando"}</span></div>)}</div>{(ev.guests?.length || 0) > 3 && <button type="button" className="cx-link-btn" onClick={() => setGuestListExpanded((value) => !value)} style={{ marginTop: 8 }}>{guestListExpanded ? "Mostrar somente os 3 primeiros" : "Ver todos os convidados (" + (ev.guests?.length || 0) + ")"}</button>}</> : <small style={{ display: "block", padding: "8px 0", color: C.muted }}>Nenhum convidado adicionado.</small>}{guestManagerOpen && props.canEdit && !cancelled && <EventGuestManager ev={ev} inviteUsers={props.inviteUsers} onDone={props.onGuestsChanged} onClose={() => setGuestManagerOpen(false)} />}</section> : null}`;
    src = src.slice(0, guestStart) + guestSection + src.slice(actionStart);
    log("lista compacta e inclusão pós-criação");
  } else log("lista compacta e inclusão pós-criação", false);
}

// 4) Componente de inclusão pós-criação. Insere apenas novos convidados e pede envio somente para os novos IDs.
if (!src.includes("function EventGuestManager(")) {
  const marker = `function Detail(`;
  const component = `function EventGuestManager({ ev, inviteUsers, onDone, onClose }: { ev: AgendaEvent; inviteUsers: InviteUser[]; onDone: () => Promise<void> | void; onClose: () => void }) {\n  const existingEmails = useMemo(() => new Set((ev.guests || []).map((g) => String(g.email || "").trim().toLowerCase()).filter(Boolean)), [ev.guests]);\n  const existingInternalIds = useMemo(() => new Set((ev.guests || []).map((g) => g.user_auth_id || "").filter(Boolean)), [ev.guests]);\n  const candidates = inviteUsers.filter((u) => u.email && u.auth_user_id !== ev.user_id && !existingInternalIds.has(u.auth_user_id) && !existingEmails.has(String(u.email || "").trim().toLowerCase()));\n  const [search, setSearch] = useState("");\n  const [expanded, setExpanded] = useState(false);\n  const [selectedIds, setSelectedIds] = useState<string[]>([]);\n  const [externalGuests, setExternalGuests] = useState<ExternalGuestDraft[]>([]);\n  const [saving, setSaving] = useState(false);\n  const searchKey = normalizeText(search);\n  const matching = candidates.filter((u) => !searchKey || normalizeText(String(u.nome || "") + " " + String(u.email || "")).includes(searchKey)).sort((a, b) => Number(selectedIds.includes(b.auth_user_id)) - Number(selectedIds.includes(a.auth_user_id)) || String(a.nome || a.email || "").localeCompare(String(b.nome || b.email || ""), "pt-BR"));\n  const visible = expanded ? matching : matching.slice(0, 3);\n  const allIds = candidates.map((u) => u.auth_user_id);\n  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));\n  const validExternalCount = externalGuests.filter((g) => g.email.trim() && g.email.includes("@")).length;\n\n  async function saveGuests() {\n    const internalRows = selectedIds.map((id) => candidates.find((u) => u.auth_user_id === id)).filter((u): u is InviteUser => Boolean(u?.email)).map((u) => ({ event_id: ev.id, guest_type: "internal", user_auth_id: u.auth_user_id, name: u.nome || null, email: String(u.email).trim().toLowerCase() }));\n    const externalRows = externalGuests.filter((g) => g.email.trim() && g.email.includes("@")).map((g) => ({ event_id: ev.id, guest_type: "external", user_auth_id: null, name: g.name.trim() || null, email: g.email.trim().toLowerCase() }));\n    const unique = new Map<string, any>();\n    [...internalRows, ...externalRows].forEach((row) => { if (row.email && !existingEmails.has(row.email) && !unique.has(row.email)) unique.set(row.email, row); });\n    const rows = [...unique.values()];\n    if (!rows.length) return alert("Selecione ou informe pelo menos um novo convidado.");\n    setSaving(true);\n    try {\n      const { data: inserted, error } = await supabase.from("agenda_event_guests").insert(rows).select("id,email");\n      if (error) return alert("Não foi possível adicionar os convidados: " + error.message);\n      const guestIds = (inserted || []).map((row: any) => String(row.id || "")).filter(Boolean);\n      if (!guestIds.length) return alert("Os convidados não retornaram após a inclusão. Atualize a Agenda e tente novamente.");\n      const { data: inviteData, error: inviteError } = await supabase.functions.invoke("send-agenda-invitations", { body: { event_id: ev.id, guest_ids: guestIds } });\n      await Promise.resolve(onDone());\n      if (inviteError || Number(inviteData?.failed || 0) > 0) {\n        alert("Os convidados foram adicionados ao evento, mas houve falha ao enviar " + String(inviteData?.failed || guestIds.length) + " convite(s). Eles permanecem na lista para acompanhamento.");\n      } else {\n        alert(String(guestIds.length) + " convidado(s) adicionado(s) e convite(s) enviado(s).");\n      }\n      onClose();\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  return <div style={{ marginTop: 12, padding: 12, border: "1px solid #E0CE8C", borderRadius: 14, background: "#FFFDF7", display: "grid", gap: 12 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}><div><strong style={{ display: "block", color: C.navy, fontSize: 12 }}>Adicionar convidados ao compromisso</strong><small style={{ color: C.muted }}>Somente os novos convidados receberão o convite por e-mail e calendário.</small></div><button type="button" className="cx-icon-btn small" onClick={onClose}><X size={14} /></button></div><div style={{ display: "grid", gap: 7 }}><div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 7 }}><div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar usuário interno…" style={{ width: "100%", boxSizing: "border-box", padding: "9px 9px 9px 31px", border: "1px solid #e5e7eb", borderRadius: 9 }} /></div><button type="button" className="cx-secondary" onClick={() => setSelectedIds(allIds)} disabled={allSelected || !allIds.length}>{allSelected ? "Todos selecionados" : "Selecionar todos"}</button><button type="button" className="cx-secondary" onClick={() => setSelectedIds([])} disabled={!selectedIds.length}>Limpar</button></div><div style={{ display: "grid", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", maxHeight: expanded ? 240 : "none", overflowY: expanded ? "auto" : "visible" }}>{visible.map((u, index) => { const checked = selectedIds.includes(u.auth_user_id); return <label key={u.auth_user_id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 2px", cursor: "pointer", borderBottom: index < visible.length - 1 ? "1px solid #eef0f3" : "0", background: checked ? "#fff9e9" : "transparent" }}><input type="checkbox" checked={checked} onChange={(e) => setSelectedIds((ids) => e.target.checked ? [...new Set([...ids, u.auth_user_id])] : ids.filter((id) => id !== u.auth_user_id))} style={{ width: 16, height: 16 }} /><span style={{ minWidth: 0 }}><strong style={{ display: "block", color: C.navy, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nome || "Usuário"}</strong><small style={{ display: "block", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</small></span></label>; })}{!visible.length && <small style={{ padding: "12px 2px", color: C.muted }}>{candidates.length ? "Nenhum usuário encontrado." : "Todos os usuários internos disponíveis já estão neste evento."}</small>}</div>{matching.length > 3 && <button type="button" className="cx-link-btn" onClick={() => setExpanded((value) => !value)}>{expanded ? "Mostrar somente os 3 primeiros" : "Ver todos os usuários (" + matching.length + ")"}</button>}</div><div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: externalGuests.length ? 8 : 0 }}><div><strong style={{ display: "block", color: C.navy, fontSize: 11 }}>Convidados externos</strong><small style={{ color: C.muted }}>Informe nome e e-mail quando a pessoa não for usuária do CRM.</small></div><button type="button" className="cx-secondary" onClick={() => setExternalGuests((rows) => [...rows, { name: "", email: "" }])}><Plus size={14} /> Adicionar externo</button></div>{externalGuests.length > 0 && <div style={{ display: "grid", gap: 7 }}>{externalGuests.map((g, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr auto", gap: 6 }}><input value={g.name} onChange={(e) => setExternalGuests((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="Nome" style={{ width: "100%", boxSizing: "border-box", padding: 9, border: "1px solid #e5e7eb", borderRadius: 9 }} /><input type="email" value={g.email} onChange={(e) => setExternalGuests((rows) => rows.map((row, i) => i === index ? { ...row, email: e.target.value } : row))} placeholder="email@exemplo.com" style={{ width: "100%", boxSizing: "border-box", padding: 9, border: "1px solid #e5e7eb", borderRadius: 9 }} /><button type="button" className="cx-icon-btn small" onClick={() => setExternalGuests((rows) => rows.filter((_, i) => i !== index))}><X size={14} /></button></div>)}</div>}</div><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" className="cx-secondary" onClick={onClose}>Cancelar</button><button type="button" className="cx-primary" onClick={saveGuests} disabled={saving || (!selectedIds.length && !validExternalCount)}>{saving ? "Adicionando…" : "Adicionar e enviar convites"}</button></div></div>;\n}\n\n`;
  if (src.includes(marker)) {
    src = src.replace(marker, component + marker);
    log("componente de inclusão de convidados");
  } else log("componente de inclusão de convidados", false);
}

if (src !== before) fs.writeFileSync(path, src);
console.log(`[agenda-v10] AgendaExecutive: ${src !== before ? "atualizado" : "sem alterações"}`);
