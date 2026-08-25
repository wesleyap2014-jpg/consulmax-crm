import fs from "node:fs";

function replaceExact(src, before, after, label) {
  if (src.includes(after)) { console.log(`[agenda-v2] ${label}: já aplicado`); return src; }
  if (!src.includes(before)) { console.log(`[agenda-v2] ${label}: trecho não encontrado`); return src; }
  console.log(`[agenda-v2] ${label}: aplicado`);
  return src.replace(before, after);
}

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const initial = src;

src = replaceExact(src,
`  hierarchy_level?: string | null;
};`,
`  hierarchy_level?: string | null;
  email?: string | null;
};`,
"email no perfil interno");

src = replaceExact(src,
`type OpportunityLite = { id: string; codigo?: string | null; estagio?: string | null; segmento?: string | null; valor_credito?: number | null };
type AgendaEvent = {`,
`type OpportunityLite = { id: string; codigo?: string | null; estagio?: string | null; segmento?: string | null; valor_credito?: number | null };
type AgendaGuest = { id: string; guest_type: "internal" | "external"; user_auth_id?: string | null; name?: string | null; email: string; rsvp_status: "pending" | "accepted" | "declined"; email_sent_at?: string | null; email_error?: string | null };
type ExternalGuestDraft = { name: string; email: string };
type AgendaEvent = {`,
"tipos de convidados");

src = replaceExact(src,
`  opportunity?: OpportunityLite | null;
};`,
`  opportunity?: OpportunityLite | null;
  guests?: AgendaGuest[] | null;
};`,
"convidados no evento");

src = replaceExact(src,
`  duration: number;
  relationKind: "none" | "cliente" | "lead";`,
`  duration: number;
  endHour: string;
  endMinute: string;
  addVideo: boolean;
  internalGuestIds: string[];
  externalGuests: ExternalGuestDraft[];
  relationKind: "none" | "cliente" | "lead";`,
"campos do novo compromisso");

src = replaceExact(src,
`  owner:users!agenda_eventos_user_id_fkey(id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level),
  opportunity:opportunities!agenda_eventos_opportunity_id_fkey(id,codigo,estagio,segmento,valor_credito)`,
`  owner:users!agenda_eventos_user_id_fkey(id,auth_user_id,nome,email,role,user_role,unit_id,hierarchy_level),
  opportunity:opportunities!agenda_eventos_opportunity_id_fkey(id,codigo,estagio,segmento,valor_credito),
  guests:agenda_event_guests!agenda_event_guests_event_id_fkey(id,guest_type,user_auth_id,name,email,rsvp_status,email_sent_at,email_error)`,
"select de convidados");

src = replaceExact(src,
`async function invokeLiveKitRoom(ev: AgendaEvent) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch("/api/livekit-room", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: \`Bearer \${token}\` } : {}) }, body: JSON.stringify({ agenda_evento_id: ev.id, role: "host", participant_name: "Consultor Consulmax" }) });`,
`async function invokeLiveKitRoom(ev: AgendaEvent, prepareOnly = false) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch("/api/livekit-room", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: \`Bearer \${token}\` } : {}) }, body: JSON.stringify({ agenda_evento_id: ev.id, role: "host", participant_name: "Consultor Consulmax", prepare_only: prepareOnly }) });`,
"preparo de videoconferência");

src = replaceExact(src,
`  const [view, setView] = useState<ViewMode>("week");`,
`  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "month";
    const saved = window.localStorage.getItem("agenda:preferred-view");
    return saved === "day" || saved === "week" || saved === "month" ? saved : "month";
  });`,
"visão padrão e preferência");

src = replaceExact(src,
`  const [createDraft, setCreateDraft] = useState<CreateDraft>({ title: "", type: "reuniao", date: toDateKey(new Date()), hour: "09", minute: "00", duration: 60, relationKind: "none", relationId: "", personSearch: "", ownerId: "", link: "", description: "" });`,
`  const [createDraft, setCreateDraft] = useState<CreateDraft>({ title: "", type: "reuniao", date: toDateKey(new Date()), hour: "09", minute: "00", duration: 60, endHour: "10", endMinute: "00", addVideo: false, internalGuestIds: [], externalGuests: [], relationKind: "none", relationId: "", personSearch: "", ownerId: "", link: "", description: "" });`,
"estado do novo compromisso");

src = src.replaceAll('select("id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level")', 'select("id,auth_user_id,nome,email,role,user_role,unit_id,hierarchy_level")');

src = replaceExact(src,
`  function goToday() { setAnchor(toDateKey(new Date())); }
  function openCreate(date = anchor, hour = "09", minute = "00") {
    setCreateDraft({ title: "", type: "reuniao", date, hour, minute, duration: 60, relationKind: "none", relationId: "", personSearch: "", ownerId: me?.auth_user_id || "", link: "", description: "" }); setCreateOpen(true);
  }`,
`  function goToday() { setAnchor(toDateKey(new Date())); }
  function setPreferredView(next: ViewMode) {
    setView(next);
    try { window.localStorage.setItem("agenda:preferred-view", next); } catch {}
  }
  function openCreate(date = anchor, hour = "09", minute = "00") {
    const startHour = Number(hour); const startMinute = Number(minute);
    const endDate = new Date(2020, 0, 1, startHour, startMinute + 60, 0, 0);
    setCreateDraft({ title: "", type: "reuniao", date, hour, minute, duration: 60, endHour: pad(endDate.getHours()), endMinute: pad(endDate.getMinutes()), addVideo: false, internalGuestIds: [], externalGuests: [], relationKind: "none", relationId: "", personSearch: "", ownerId: me?.auth_user_id || "", link: "", description: "" }); setCreateOpen(true);
  }`,
"preferência e abertura de criação");

const createEventRegex = /  async function createEvent\(\) \{[\s\S]*?\n  \}\n\n  async function saveReschedule/;
const createEventReplacement = `  async function createEvent() {
    if (!createDraft.title.trim()) return alert("Informe o título do compromisso.");
    const start = localDateTime(createDraft.date, createDraft.hour, createDraft.minute);
    const end = localDateTime(createDraft.date, createDraft.endHour, createDraft.endMinute);
    if (end.getTime() <= start.getTime()) return alert("O horário de término deve ser posterior ao horário de início.");
    const payload: any = { tipo: createDraft.type, titulo: createDraft.title.trim(), inicio_at: start.toISOString(), fim_at: end.toISOString(), origem: "manual", user_id: createDraft.ownerId || me?.auth_user_id, cliente_id: null, lead_id: null, videocall_url: createDraft.link.trim() || null, meeting_link: createDraft.link.trim() || null, descricao: createDraft.description.trim() || null };
    if (createDraft.relationKind === "cliente" && createDraft.relationId) payload.cliente_id = createDraft.relationId;
    if (createDraft.relationKind === "lead" && createDraft.relationId) payload.lead_id = createDraft.relationId;

    setLoading(true);
    try {
      const { data: createdRaw, error } = await supabase.from("agenda_eventos").insert(payload).select(EVENT_SELECT).single();
      if (error || !createdRaw) return alert("Não foi possível criar o compromisso: " + (error?.message || "evento não retornado"));
      let created = createdRaw as unknown as AgendaEvent;

      if (createDraft.addVideo) {
        try {
          const roomData = await invokeLiveKitRoom(created, true);
          created = { ...created, videocall_url: roomData?.clientUrl || created.videocall_url, video_room_id: roomData?.room?.id || created.video_room_id, video_status: roomData?.room?.status || "created" };
        } catch (e: any) {
          alert("O compromisso foi criado, mas não foi possível preparar a videoconferência: " + (e?.message || "erro desconhecido"));
        }
      }

      const internalGuests = createDraft.internalGuestIds
        .map((id) => team.find((u) => u.auth_user_id === id))
        .filter((u): u is UserProfile => Boolean(u?.email))
        .map((u) => ({ event_id: created.id, guest_type: "internal", user_auth_id: u.auth_user_id, name: u.nome || null, email: String(u.email).trim().toLowerCase() }));
      const externalGuests = createDraft.externalGuests
        .filter((g) => g.email.trim() && g.email.includes("@"))
        .map((g) => ({ event_id: created.id, guest_type: "external", user_auth_id: null, name: g.name.trim() || null, email: g.email.trim().toLowerCase() }));
      const allGuests = [...internalGuests, ...externalGuests].filter((g, index, rows) => rows.findIndex((x) => x.email === g.email) === index);

      if (allGuests.length) {
        const { error: guestError } = await supabase.from("agenda_event_guests").insert(allGuests);
        if (guestError) alert("Compromisso criado, mas houve erro ao salvar convidados: " + guestError.message);
        else {
          const { error: inviteError } = await supabase.functions.invoke("send-agenda-invitations", { body: { event_id: created.id } });
          if (inviteError) alert("Compromisso criado e convidados salvos, mas o envio dos convites falhou: " + inviteError.message);
        }
      }

      setCreateOpen(false);
      await loadData();
    } finally { setLoading(false); }
  }

  async function saveReschedule`;
if (!src.includes('supabase.functions.invoke("send-agenda-invitations"')) {
  if (createEventRegex.test(src)) { src = src.replace(createEventRegex, createEventReplacement); console.log("[agenda-v2] criação com vídeo e convidados: aplicado"); }
  else console.log("[agenda-v2] criação com vídeo e convidados: trecho não encontrado");
}

src = replaceExact(src,
`          <button className={view === "day" ? "active" : ""} onClick={() => { setView("day"); if (!anchor) goToday(); }}>Hoje</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Semana</button>
          <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Mês</button>`,
`          <button className={view === "day" ? "active" : ""} onClick={() => { setPreferredView("day"); if (!anchor) goToday(); }}>Hoje</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setPreferredView("week")}>Semana</button>
          <button className={view === "month" ? "active" : ""} onClick={() => setPreferredView("month")}>Mês</button>`,
"alternância persistente");

src = replaceExact(src,
`          {view === "week" && <WeekView days={weekDays} events={filteredEvents} onOpen={openDetails} onCreate={(date, hour) => openCreate(date, pad(hour), "00")} />}
          {view === "day" && <DayView date={anchor} late={dayLate} upcoming={dayUpcoming} completed={dayCompleted} onOpen={openDetails} onCreate={() => openCreate(anchor)} />}
          {view === "month" && <MonthView days={monthDays} anchor={anchor} events={filteredEvents} birthdays={birthdays} onPickDay={chooseDay} onOpen={openDetails} />}`, 
`          {view === "week" && <WeekView days={weekDays} events={filteredEvents} onOpen={openDetails} onCreate={(date, hour, minute) => openCreate(date, pad(hour), pad(minute))} />}
          {view === "day" && <DayView date={anchor} late={dayLate} upcoming={dayUpcoming} completed={dayCompleted} onOpen={openDetails} onCreate={() => openCreate(anchor)} />}
          {view === "month" && <MonthView days={monthDays} anchor={anchor} events={filteredEvents} birthdays={birthdays} onPickDay={chooseDay} onOpen={openDetails} onCreate={(date) => openCreate(date)} />}`, 
"criação pela grade");

const weekRegex = /function WeekView\([\s\S]*?\n}\n\nfunction DayView/;
const weekReplacement = `function WeekView({ days, events, onOpen, onCreate }: { days: Date[]; events: AgendaEvent[]; onOpen: (e: AgendaEvent) => void; onCreate: (date: string, hour: number, minute: number) => void }) {
  return <section className="cx-week-card"><div className="cx-week-head"><div className="cx-week-corner" />{days.map((d) => { const key = toDateKey(d); return <div key={key} className={\`cx-week-day-head \${key === toDateKey(new Date()) ? "today" : ""}\`}><span>{d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span><strong>{d.getDate()}</strong><div className="cx-all-day">{events.filter((e) => e.tipo === "assembleia" && eventDateKey(e) === key).slice(0, 2).map((e) => <button key={e.id} onClick={(click) => { click.stopPropagation(); onOpen(e); }}>{e.titulo || "Assembleia"}</button>)}</div></div>; })}</div><div className="cx-week-scroll"><div className="cx-week-body" style={{ height: WEEK_HEIGHT }}><div className="cx-time-col">{HOURS.map((h) => <span key={h} style={{ top: (h - WEEK_START_HOUR) * 60 * PX_PER_MINUTE - 8 }}>{pad(h)}:00</span>)}</div>{days.map((d) => { const key = toDateKey(d); const timed = events.filter((e) => e.tipo !== "assembleia" && eventDateKey(e) === key); return <div key={key} className={\`cx-day-col \${key === toDateKey(new Date()) ? "today" : ""}\`} onClick={(click) => { if ((click.target as HTMLElement).closest(".cx-event-block")) return; const rect = click.currentTarget.getBoundingClientRect(); const rawMinute = Math.max(0, Math.min((click.clientY - rect.top) / PX_PER_MINUTE, WEEK_HEIGHT - 1)); const totalMinutes = Math.floor(rawMinute / 5) * 5; const hour = Math.min(WEEK_END_HOUR - 1, WEEK_START_HOUR + Math.floor(totalMinutes / 60)); const minute = totalMinutes % 60; onCreate(key, hour, minute); }}>{HOURS.map((h) => <i key={h} style={{ top: (h - WEEK_START_HOUR) * 60 * PX_PER_MINUTE }} />)}{timed.map((ev, idx) => { const start = new Date(ev.inicio_at); const mins = (start.getHours() - WEEK_START_HOUR) * 60 + start.getMinutes(); const top = Math.max(0, Math.min(WEEK_HEIGHT - 34, mins * PX_PER_MINUTE)); const height = Math.max(34, Math.min(durationMinutes(ev) * PX_PER_MINUTE, WEEK_HEIGHT - top)); return <button key={ev.id} className={\`cx-event-block \${statusClass(ev)}\`} style={{ top, height, borderLeftColor: typeAccent(ev.tipo), marginLeft: (idx % 3) * 3 }} onClick={(click) => { click.stopPropagation(); onOpen(ev); }} title={\`\${fmtTime(ev.inicio_at)} • \${ev.titulo || TYPE_LABEL[ev.tipo]} • \${eventPerson(ev)}\`}><span>{fmtTime(ev.inicio_at)}</span><strong>{ev.titulo || TYPE_LABEL[ev.tipo]}</strong><small>{eventPerson(ev)}{ev.opportunity?.codigo ? \` • \${ev.opportunity.codigo}\` : ""}</small></button>; })}</div>; })}</div></div></section>;
}

function DayView`;
if (!src.includes('onCreate: (date: string, hour: number, minute: number)')) {
  if (weekRegex.test(src)) { src = src.replace(weekRegex, weekReplacement); console.log("[agenda-v2] clique livre na semana: aplicado"); }
  else console.log("[agenda-v2] clique livre na semana: trecho não encontrado");
}

const monthRegex = /function MonthView\([\s\S]*?\n}\n\nfunction Drawer/;
const monthReplacement = `function MonthView({ days, anchor, events, birthdays, onPickDay, onOpen, onCreate }: { days: Date[]; anchor: string; events: AgendaEvent[]; birthdays: AgendaEvent[]; onPickDay: (d: string) => void; onOpen: (e: AgendaEvent) => void; onCreate: (d: string) => void }) {
  const month = parseDateKey(anchor).getMonth(); return <section className="cx-month-card"><div className="cx-month-week">{DAY_NAMES.map((d) => <span key={d}>{d}</span>)}</div><div className="cx-month-grid">{days.map((d) => { const key = toDateKey(d); const rows = events.filter((e) => eventDateKey(e) === key).slice(0, 3); const total = events.filter((e) => eventDateKey(e) === key).length; const b = birthdays.filter((e) => eventDateKey(e) === key).length; return <div key={key} className={\`cx-month-day \${d.getMonth() !== month ? "outside" : ""} \${key === toDateKey(new Date()) ? "today" : ""}\`} onClick={() => onCreate(key)} title="Clique no espaço livre para criar um compromisso"><button className="cx-month-number" onClick={(click) => { click.stopPropagation(); onCreate(key); }}>{d.getDate()}</button>{b > 0 && <button className="cx-month-birthday" onClick={(click) => { click.stopPropagation(); onPickDay(key); }}><Cake size={12} /> {b}</button>}<div className="cx-month-events">{rows.map((ev) => <button key={ev.id} onClick={(click) => { click.stopPropagation(); onOpen(ev); }} style={{ borderLeftColor: typeAccent(ev.tipo) }}><span>{fmtTime(ev.inicio_at)}</span>{ev.titulo || TYPE_LABEL[ev.tipo]}</button>)}{total > 3 && <button className="cx-more" onClick={(click) => { click.stopPropagation(); onPickDay(key); }}>+ {total - 3} mais</button>}</div></div>; })}</div></section>;
}

function Drawer`;
if (!src.includes('title="Clique no espaço livre para criar um compromisso"')) {
  if (monthRegex.test(src)) { src = src.replace(monthRegex, monthReplacement); console.log("[agenda-v2] clique livre no mês: aplicado"); }
  else console.log("[agenda-v2] clique livre no mês: trecho não encontrado");
}

src = replaceExact(src,
`</div><div className="cx-action-grid">`,
`</div>{ev.guests?.length ? <section className="cx-drawer-section"><div className="cx-section-title"><h3>Convidados</h3><span>{ev.guests.length} convidado(s)</span></div><div style={{ display: "grid", gap: 7 }}>{ev.guests.map((g) => <div key={g.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 10px", border: "1px solid #e5e7eb", borderRadius: 10 }}><div style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: 11, color: C.navy, overflow: "hidden", textOverflow: "ellipsis" }}>{g.name || g.email}</strong><small style={{ color: C.muted }}>{g.email} • {g.guest_type === "internal" ? "Interno" : "Externo"}</small></div><span className={\`cx-status \${g.rsvp_status === "accepted" ? "scheduled" : g.rsvp_status === "declined" ? "late" : "done"}\`}>{g.rsvp_status === "accepted" ? "Confirmado" : g.rsvp_status === "declined" ? "Não irá" : "Aguardando"}</span></div>)}</div></section> : null}<div className="cx-action-grid">`,
"convidados nos detalhes");

const createDrawerRegex = /function CreateDrawer\([\s\S]*?\n}\n\nconst AGENDA_CSS/;
const createDrawerReplacement = `function CreateDrawer({ draft, setDraft, team, canManageTeam, relationRows, loading, onClose, onSave }: { draft: CreateDraft; setDraft: React.Dispatch<React.SetStateAction<CreateDraft>>; team: UserProfile[]; canManageTeam: boolean; relationRows: PersonLite[]; loading: boolean; onClose: () => void; onSave: () => void }) {
  const internalCandidates = team.filter((u) => u.email && u.auth_user_id !== draft.ownerId);
  const addExternal = () => setDraft((d) => ({ ...d, externalGuests: [...d.externalGuests, { name: "", email: "" }] }));
  return <Drawer onClose={onClose}><div className="cx-drawer-head"><div><span className="cx-eyebrow">Agenda</span><h2>Novo compromisso</h2></div><button className="cx-icon-btn" onClick={onClose}><X size={18} /></button></div><div className="cx-form"><label className="full">Título<input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Ex.: Reunião de planejamento" autoFocus /></label><label>Tipo<select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as CreateDraft["type"] }))}><option value="reuniao">Reunião</option><option value="contato">Contato / Follow-up</option><option value="visita">Visita</option><option value="outro">Outro</option></select></label><label>Data<input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label><label>Início<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}><select value={draft.hour} onChange={(e) => setDraft((d) => ({ ...d, hour: e.target.value }))}>{HOUR_OPTIONS.map((h) => <option key={h}>{h}</option>)}</select><select value={draft.minute} onChange={(e) => setDraft((d) => ({ ...d, minute: e.target.value }))}>{MINUTE_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></div></label><label>Término<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}><select value={draft.endHour} onChange={(e) => setDraft((d) => ({ ...d, endHour: e.target.value }))}>{HOUR_OPTIONS.map((h) => <option key={h}>{h}</option>)}</select><select value={draft.endMinute} onChange={(e) => setDraft((d) => ({ ...d, endMinute: e.target.value }))}>{MINUTE_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></div></label>{canManageTeam && <label>Responsável<select value={draft.ownerId} onChange={(e) => setDraft((d) => ({ ...d, ownerId: e.target.value }))}>{team.map((u) => <option key={u.auth_user_id} value={u.auth_user_id}>{u.nome || "Usuário"}</option>)}</select></label>}<label>Vincular a<select value={draft.relationKind} onChange={(e) => setDraft((d) => ({ ...d, relationKind: e.target.value as any, relationId: "", personSearch: "" }))}><option value="none">Sem vínculo</option><option value="cliente">Cliente</option><option value="lead">Lead / Oportunidade</option></select></label>{draft.relationKind !== "none" && <><label className="full">Buscar pessoa<input value={draft.personSearch} onChange={(e) => setDraft((d) => ({ ...d, personSearch: e.target.value }))} placeholder="Nome ou telefone…" /></label><label className="full">{draft.relationKind === "cliente" ? "Cliente" : "Lead"}<select value={draft.relationId} onChange={(e) => setDraft((d) => ({ ...d, relationId: e.target.value }))}><option value="">Selecione…</option>{relationRows.map((p) => <option key={p.id} value={p.id}>{p.nome || "Sem nome"}{p.telefone ? \` • \${p.telefone}\` : ""}</option>)}</select></label></>}<label className="full" style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", padding: 10, borderRadius: 10, cursor: "pointer" }}><input type="checkbox" checked={draft.addVideo} onChange={(e) => setDraft((d) => ({ ...d, addVideo: e.target.checked }))} style={{ width: 16, height: 16 }} /><span><strong style={{ color: C.navy }}>Adicionar videoconferência Consulmax</strong><small style={{ display: "block", color: C.muted, fontWeight: 500 }}>A sala será criada automaticamente e o link seguirá no convite.</small></span></label><label className="full">Link externo opcional<input value={draft.link} onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} placeholder="Google Meet, Teams ou outro link, se preferir" /></label><div className="full" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><strong style={{ color: C.navy, fontSize: 12 }}>Convidados internos</strong><small style={{ color: C.muted }}>Usa o e-mail cadastrado no CRM</small></div><div style={{ display: "grid", gap: 5, maxHeight: 150, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>{internalCandidates.map((u) => <label key={u.auth_user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 5, cursor: "pointer" }}><input type="checkbox" checked={draft.internalGuestIds.includes(u.auth_user_id)} onChange={(e) => setDraft((d) => ({ ...d, internalGuestIds: e.target.checked ? [...d.internalGuestIds, u.auth_user_id] : d.internalGuestIds.filter((id) => id !== u.auth_user_id) }))} style={{ width: 15, height: 15 }} /><span style={{ fontSize: 11 }}><strong style={{ color: C.navy }}>{u.nome || "Usuário"}</strong><small style={{ display: "block", color: C.muted }}>{u.email}</small></span></label>)}{!internalCandidates.length && <small style={{ color: C.muted }}>Nenhum usuário interno com e-mail disponível.</small>}</div></div><div className="full" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><strong style={{ color: C.navy, fontSize: 12 }}>Convidados externos</strong><button type="button" className="cx-secondary" onClick={addExternal}><Plus size={14} /> Adicionar</button></div><div style={{ display: "grid", gap: 7 }}>{draft.externalGuests.map((g, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr auto", gap: 6 }}><input value={g.name} onChange={(e) => setDraft((d) => ({ ...d, externalGuests: d.externalGuests.map((row, i) => i === index ? { ...row, name: e.target.value } : row) }))} placeholder="Nome" /><input type="email" value={g.email} onChange={(e) => setDraft((d) => ({ ...d, externalGuests: d.externalGuests.map((row, i) => i === index ? { ...row, email: e.target.value } : row) }))} placeholder="email@exemplo.com" /><button type="button" className="cx-icon-btn small" onClick={() => setDraft((d) => ({ ...d, externalGuests: d.externalGuests.filter((_, i) => i !== index) }))}><X size={14} /></button></div>)}</div></div><label className="full">Observações<textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Objetivo da reunião ou contexto do atendimento…" /></label></div><div className="cx-drawer-footer"><button className="cx-secondary" onClick={onClose}>Cancelar</button><button className="cx-primary" onClick={onSave} disabled={loading}>{loading ? "Criando…" : "Criar compromisso"}</button></div></Drawer>;
}

const AGENDA_CSS`;
if (!src.includes('Adicionar videoconferência Consulmax')) {
  if (createDrawerRegex.test(src)) { src = src.replace(createDrawerRegex, createDrawerReplacement); console.log("[agenda-v2] formulário de compromisso: aplicado"); }
  else console.log("[agenda-v2] formulário de compromisso: trecho não encontrado");
}

if (src !== initial) fs.writeFileSync(path, src);
console.log(`[agenda-v2] AgendaExecutive: ${src !== initial ? "atualizado" : "sem alterações"}`);

const livekitPath = "api/livekit-room.ts";
let livekit = fs.readFileSync(livekitPath, "utf8");
const livekitInitial = livekit;
livekit = replaceExact(livekit,
`    const participantName = String(
      body?.participant_name || (role === 'host' ? 'Consultor Consulmax' : 'Cliente')
    ).trim()`,
`    const participantName = String(
      body?.participant_name || (role === 'host' ? 'Consultor Consulmax' : 'Cliente')
    ).trim()
    const prepareOnly = Boolean(body?.prepare_only)`,
"livekit prepare_only");
livekit = replaceExact(livekit,
`    const nextStatus = role === 'host' ? 'host_joined' : 'client_joined'`,
`    if (prepareOnly) {
      return json(res, 200, {
        ok: true,
        room,
        clientUrl: room.public_client_url,
        reusable: true,
        prepared: true,
      })
    }

    const nextStatus = role === 'host' ? 'host_joined' : 'client_joined'`,
"livekit retorno sem entrar");
if (livekit !== livekitInitial) fs.writeFileSync(livekitPath, livekit);
console.log(`[agenda-v2] livekit-room: ${livekit !== livekitInitial ? "atualizado" : "sem alterações"}`);
