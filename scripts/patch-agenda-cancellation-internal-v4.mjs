import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

function replaceExact(from, to, label) {
  if (src.includes(to)) {
    console.log(`[agenda-v4] ${label}: já aplicado`);
    return;
  }
  if (!src.includes(from)) {
    console.log(`[agenda-v4] ${label}: trecho não encontrado`);
    return;
  }
  src = src.replace(from, to);
  console.log(`[agenda-v4] ${label}: aplicado`);
}

replaceExact(
  `  guests?: AgendaGuest[] | null;\n};`,
  `  guests?: AgendaGuest[] | null;\n  cancelled_at?: string | null;\n  cancelled_by?: string | null;\n  cancellation_reason?: string | null;\n};`,
  "campos de cancelamento no tipo",
);

replaceExact(
  `  id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,meeting_link,descricao,video_room_id,video_status,origem,relacao_id,completed_at,completion_notes,opportunity_id,`,
  `  id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,meeting_link,descricao,video_room_id,video_status,origem,relacao_id,completed_at,completion_notes,opportunity_id,cancelled_at,cancelled_by,cancellation_reason,`,
  "campos de cancelamento no select",
);

replaceExact(
  `function isCompleted(ev: AgendaEvent) { return Boolean(ev.completed_at); }\nfunction isLate(ev: AgendaEvent) { return !isCompleted(ev) && ev.tipo !== "aniversario" && new Date(ev.inicio_at).getTime() < Date.now(); }`,
  `function isCancelled(ev: AgendaEvent) { return Boolean(ev.cancelled_at); }\nfunction isCompleted(ev: AgendaEvent) { return Boolean(ev.completed_at); }\nfunction isLate(ev: AgendaEvent) { return !isCancelled(ev) && !isCompleted(ev) && ev.tipo !== "aniversario" && new Date(ev.inicio_at).getTime() < Date.now(); }`,
  "status cancelado",
);

replaceExact(
  `function eventStatus(ev: AgendaEvent) { if (isCompleted(ev)) return "Concluído"; if (isLate(ev)) return "Atrasado"; if (eventDateKey(ev) === toDateKey(new Date())) return "Hoje"; return "Programado"; }\nfunction statusClass(ev: AgendaEvent) { if (isCompleted(ev)) return "done"; if (isLate(ev)) return "late"; return "scheduled"; }`,
  `function eventStatus(ev: AgendaEvent) { if (isCancelled(ev)) return "Cancelado"; if (isCompleted(ev)) return "Concluído"; if (isLate(ev)) return "Atrasado"; if (eventDateKey(ev) === toDateKey(new Date())) return "Hoje"; return "Programado"; }\nfunction statusClass(ev: AgendaEvent) { if (isCancelled(ev)) return "done"; if (isCompleted(ev)) return "done"; if (isLate(ev)) return "late"; return "scheduled"; }`,
  "rótulo de cancelamento",
);

replaceExact(
  `  const [inviteUsers, setInviteUsers] = useState<InviteUser[]>([]);\n  const [isMatrix, setIsMatrix] = useState(false);`,
  `  const [inviteUsers, setInviteUsers] = useState<InviteUser[]>([]);\n  const [invitedEventIds, setInvitedEventIds] = useState<string[]>([]);\n  const [isMatrix, setIsMatrix] = useState(false);`,
  "estado dos eventos recebidos",
);

const applyScopeRegex = /  const applyScope = useCallback\(\(query: any\) => \{[\s\S]*?\n  \}, \[filterUser, isMatrix, team, me\?\.auth_user_id\]\);/;
if (!src.includes("refreshInvitedEventIds")) {
  const replacement = `  const refreshInvitedEventIds = useCallback(async () => {
    if (!me?.auth_user_id) { setInvitedEventIds([]); return; }
    const { data, error } = await supabase
      .from("agenda_event_guests")
      .select("event_id")
      .eq("guest_type", "internal")
      .eq("user_auth_id", me.auth_user_id);
    if (error) { console.warn("[agenda] convites internos indisponíveis", error); return; }
    setInvitedEventIds([...new Set((data || []).map((row: any) => String(row.event_id || "")).filter(Boolean))]);
  }, [me?.auth_user_id]);

  useEffect(() => { void refreshInvitedEventIds(); }, [refreshInvitedEventIds]);

  const applyScope = useCallback((query: any) => {
    if (filterUser) return query.eq("user_id", filterUser);
    if (isMatrix) return query;
    const ownerIds = team.map((u) => u.auth_user_id).filter(Boolean);
    if (ownerIds.length && invitedEventIds.length) {
      return query.or(\`user_id.in.(\${ownerIds.join(",")}),id.in.(\${invitedEventIds.join(",")})\`);
    }
    if (ownerIds.length) return query.in("user_id", ownerIds);
    if (invitedEventIds.length) return query.in("id", invitedEventIds);
    return query.eq("user_id", me?.auth_user_id || "00000000-0000-0000-0000-000000000000");
  }, [filterUser, isMatrix, team, me?.auth_user_id, invitedEventIds]);`;
  if (applyScopeRegex.test(src)) {
    src = src.replace(applyScopeRegex, replacement);
    console.log("[agenda-v4] visibilidade de convites internos: aplicado");
  } else console.log("[agenda-v4] visibilidade de convites internos: trecho não encontrado");
}

const realtimeRegex = /  useEffect\(\(\) => \{\n    const scheduleRefresh = \(\) => \{[\s\S]*?\n  \}, \[loadData\]\);/;
if (src.includes('table: "agenda_event_guests"') && !src.includes("refreshInvitedEventIds(); scheduleRefresh();")) {
  const realtimeReplacement = `  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(loadData, 250);
    };
    const channel = supabase
      .channel("agenda-executive-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_event_guests" }, () => { void refreshInvitedEventIds(); scheduleRefresh(); })
      .subscribe();
    return () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); supabase.removeChannel(channel); };
  }, [loadData, refreshInvitedEventIds]);`;
  if (realtimeRegex.test(src)) {
    src = src.replace(realtimeRegex, realtimeReplacement);
    console.log("[agenda-v4] realtime de convites recebidos: aplicado");
  } else console.log("[agenda-v4] realtime de convites recebidos: trecho não encontrado");
}

replaceExact(
  `  const dayUpcoming = visibleDayEvents.filter((e) => !isCompleted(e) && (!isTodayAnchor || new Date(e.inicio_at).getTime() >= Date.now()));`,
  `  const dayUpcoming = visibleDayEvents.filter((e) => !isCancelled(e) && !isCompleted(e) && (!isTodayAnchor || new Date(e.inicio_at).getTime() >= Date.now()));`,
  "cancelados fora dos próximos",
);

const deleteRegex = /  async function deleteEvent\(\) \{[\s\S]*?\n  \}\n  async function enterVideo/;
if (!src.includes("async function cancelEvent()")) {
  const actionsReplacement = `  async function sendCancellationNotice(eventId: string, reason: string) {
    const { data, error } = await supabase.functions.invoke("send-agenda-cancellation", { body: { event_id: eventId, reason } });
    if (error) return { ok: false, message: error.message };
    if (Number(data?.failed || 0) > 0) return { ok: false, message: \`Falha ao avisar \${data.failed} convidado(s).\` };
    return { ok: true, sent: Number(data?.sent || 0) };
  }

  async function cancelEvent() {
    if (!selectedEvent || selectedEvent.origem !== "manual" || isCancelled(selectedEvent)) return;
    if (!confirm("Cancelar este compromisso? Os convidados serão avisados por e-mail e o calendário deles receberá o cancelamento.")) return;
    const reasonInput = window.prompt("Motivo do cancelamento (opcional):", "");
    if (reasonInput === null) return;
    const reason = reasonInput.trim();
    setLoading(true);
    try {
      const notice = await sendCancellationNotice(selectedEvent.id, reason);
      if (!notice.ok) return alert("Não foi possível cancelar porque os convidados não foram avisados: " + notice.message);
      const now = new Date().toISOString();
      const { error } = await supabase.from("agenda_eventos").update({ cancelled_at: now, cancelled_by: me?.auth_user_id || null, cancellation_reason: reason || null, updated_at: now }).eq("id", selectedEvent.id);
      if (error) return alert("Os convidados foram avisados, mas não foi possível marcar o compromisso como cancelado: " + error.message);
      setSelectedEvent({ ...selectedEvent, cancelled_at: now, cancelled_by: me?.auth_user_id || null, cancellation_reason: reason || null });
      await loadData();
    } finally { setLoading(false); }
  }

  async function deleteEvent() {
    if (!selectedEvent || selectedEvent.origem !== "manual") return;
    if (!confirm("Excluir este compromisso? Se houver convidados, eles receberão o aviso de cancelamento antes da exclusão.")) return;
    setLoading(true);
    try {
      if (!isCancelled(selectedEvent)) {
        const notice = await sendCancellationNotice(selectedEvent.id, "O compromisso foi excluído da agenda pelo responsável.");
        if (!notice.ok) return alert("A exclusão foi interrompida porque os convidados não foram avisados: " + notice.message);
      }
      const { error } = await supabase.from("agenda_eventos").delete().eq("id", selectedEvent.id);
      if (error) return alert(error.message);
      setSelectedEvent(null);
      await loadData();
    } finally { setLoading(false); }
  }
  async function enterVideo`;
  if (deleteRegex.test(src)) {
    src = src.replace(deleteRegex, actionsReplacement);
    console.log("[agenda-v4] cancelar/excluir com aviso: aplicado");
  } else console.log("[agenda-v4] cancelar/excluir com aviso: trecho não encontrado");
}

replaceExact(
  `onOpportunity={openOpportunity} onDelete={deleteEvent} />}`,
  `onOpportunity={openOpportunity} canEdit={Boolean(selectedEvent && (selectedEvent.user_id === me?.auth_user_id || normalizeText(me?.role || me?.user_role) === "admin"))} onCancel={cancelEvent} onDelete={deleteEvent} />}`,
  "permissões no drawer",
);

const drawerRegex = /function EventDrawer\([\s\S]*?\n}\n\nfunction Detail/;
if (!src.includes("Você foi convidado para este compromisso")) {
  const drawerReplacement = `function EventDrawer(props: { ev: AgendaEvent; completionNote: string; setCompletionNote: (v: string) => void; historyNote: string; setHistoryNote: (v: string) => void; rescheduling: boolean; setRescheduling: (v: boolean) => void; rescheduleDraft: RescheduleDraft; setRescheduleDraft: (v: RescheduleDraft) => void; videoLoading: boolean; canEdit: boolean; onClose: () => void; onComplete: () => void; onReopen: () => void; onSaveReschedule: () => void; onSaveNote: () => void; onVideo: () => void; onOpportunity: (e: AgendaEvent) => void; onCancel: () => void; onDelete: () => void }) {
  const { ev } = props; const wa = whatsappHref(eventPhone(ev)); const phone = onlyDigits(eventPhone(ev)); const completed = isCompleted(ev); const cancelled = isCancelled(ev);
  return <Drawer onClose={props.onClose}><div className="cx-drawer-head"><div><span className="cx-eyebrow">Detalhes do compromisso</span><h2>{ev.titulo || TYPE_LABEL[ev.tipo]}</h2></div><button className="cx-icon-btn" onClick={props.onClose}><X size={18} /></button></div><div className="cx-event-meta"><span className={\`cx-status \${statusClass(ev)}\`}>{eventStatus(ev)}</span><span className="cx-type-chip" style={{ borderColor: typeAccent(ev.tipo), color: typeAccent(ev.tipo) }}>{TYPE_LABEL[ev.tipo]}</span>{!props.canEdit && <span className="cx-type-chip" style={{ borderColor: C.gold, color: C.gold }}>Convidado</span>}{ev.opportunity?.codigo && <button className="cx-op-chip" onClick={() => props.onOpportunity(ev)}>{ev.opportunity.codigo}</button>}</div>{!props.canEdit && <div style={{ margin: "0 0 12px", padding: "10px 12px", border: "1px solid #E0CE8C", background: "#FFFDF5", borderRadius: 11, color: C.navy, fontSize: 12, fontWeight: 700 }}>Você foi convidado para este compromisso. Ele aparece na sua Agenda, mas continua sob responsabilidade de {ev.owner?.nome || "outro usuário"}.</div>}<div className="cx-detail-card"><Detail icon={<Clock size={16} />} label="Quando" value={\`\${fmtDateTime(ev.inicio_at)} até \${fmtTime(ev.fim_at)}\`} /><Detail icon={<Users size={16} />} label="Cliente / Lead" value={eventPerson(ev)} /><Detail icon={<Users size={16} />} label="Responsável" value={ev.owner?.nome || "—"} />{ev.opportunity && <Detail icon={<FileText size={16} />} label="Oportunidade" value={\`\${ev.opportunity.codigo || "Oportunidade"} • \${ev.opportunity.segmento || "—"} • \${money(ev.opportunity.valor_credito)}\`} />}{ev.descricao && <Detail icon={<FileText size={16} />} label="Descrição" value={ev.descricao} />}{cancelled && ev.cancellation_reason && <Detail icon={<FileText size={16} />} label="Motivo do cancelamento" value={ev.cancellation_reason} />}</div>{ev.guests?.length ? <section className="cx-drawer-section"><div className="cx-section-title"><h3>Convidados</h3><span>{ev.guests.length} convidado(s)</span></div><div style={{ display: "grid", gap: 7 }}>{ev.guests.map((g) => <div key={g.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 10px", border: "1px solid #e5e7eb", borderRadius: 10 }}><div style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: 11, color: C.navy, overflow: "hidden", textOverflow: "ellipsis" }}>{g.name || g.email}</strong><small style={{ color: C.muted }}>{g.email} • {g.guest_type === "internal" ? "Interno" : "Externo"}</small></div><span className={\`cx-status \${g.rsvp_status === "accepted" ? "scheduled" : g.rsvp_status === "declined" ? "late" : "done"}\`}>{g.rsvp_status === "accepted" ? "Confirmado" : g.rsvp_status === "declined" ? "Não irá" : "Aguardando"}</span></div>)}</div></section> : null}<div className="cx-action-grid">{wa && <a className="cx-action-btn" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={17} /> WhatsApp</a>}{phone && <a className="cx-action-btn" href={\`tel:\${phone}\`}><Phone size={17} /> Ligar</a>}{ev.opportunity_id && <button className="cx-action-btn" onClick={() => props.onOpportunity(ev)}><ExternalLink size={17} /> Abrir oportunidade</button>}{!cancelled && <button className="cx-action-btn strong" onClick={props.onVideo} disabled={props.videoLoading}><Video size={17} /> {props.videoLoading ? "Preparando…" : "Entrar na reunião"}</button>}{!cancelled && (ev.meeting_link || ev.videocall_url) && <a className="cx-action-btn" href={ev.meeting_link || ev.videocall_url || "#"} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Abrir link</a>}{!cancelled && <button className="cx-action-btn" onClick={() => downloadICS(ev)}><Download size={17} /> Adicionar calendário</button>}</div>{props.canEdit && !cancelled && <><section className="cx-drawer-section"><div className="cx-section-title"><h3>Conclusão</h3>{completed && <span>Concluído em {fmtDateTime(ev.completed_at)}</span>}</div><textarea value={props.completionNote} onChange={(e) => props.setCompletionNote(e.target.value)} placeholder="Resumo do atendimento, resultado ou próximo passo…" />{completed ? <button className="cx-secondary full" onClick={props.onReopen}><RotateCcw size={16} /> Reabrir compromisso</button> : <button className="cx-primary full" onClick={props.onComplete}><CheckCircle2 size={16} /> Marcar como concluído</button>}</section><section className="cx-drawer-section"><div className="cx-section-title"><h3>Reagendar</h3><button className="cx-link-btn" onClick={() => props.setRescheduling(!props.rescheduling)}>{props.rescheduling ? "Cancelar" : "Alterar data e hora"}</button></div>{props.rescheduling && <TimeControls value={props.rescheduleDraft} onChange={props.setRescheduleDraft} onSave={props.onSaveReschedule} />}</section>{(ev.cliente_id || ev.lead_id) && <section className="cx-drawer-section"><div className="cx-section-title"><h3>Histórico</h3><span>Registrar no cliente/lead</span></div><textarea value={props.historyNote} onChange={(e) => props.setHistoryNote(e.target.value)} placeholder="Digite uma anotação…" /><button className="cx-secondary full" onClick={props.onSaveNote}>Registrar anotação</button></section>}<button className="cx-secondary full" onClick={props.onCancel}>Cancelar compromisso e avisar convidados</button></>}{props.canEdit && ev.origem === "manual" && <button className="cx-danger-link" onClick={props.onDelete}><Trash2 size={15} /> Excluir compromisso</button>}</Drawer>;
}

function Detail`;
  if (drawerRegex.test(src)) {
    src = src.replace(drawerRegex, drawerReplacement);
    console.log("[agenda-v4] drawer de cancelamento/convidado: aplicado");
  } else console.log("[agenda-v4] drawer de cancelamento/convidado: trecho não encontrado");
}

if (src !== before) fs.writeFileSync(path, src);
console.log(`[agenda-v4] AgendaExecutive: ${src !== before ? "atualizado" : "sem alterações"}`);
