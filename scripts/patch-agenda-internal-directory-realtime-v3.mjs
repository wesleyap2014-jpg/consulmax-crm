import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

function replaceExact(from, to, label) {
  if (src.includes(to)) {
    console.log(`[agenda-v3] ${label}: já aplicado`);
    return;
  }
  if (!src.includes(from)) {
    console.log(`[agenda-v3] ${label}: trecho não encontrado`);
    return;
  }
  src = src.replace(from, to);
  console.log(`[agenda-v3] ${label}: aplicado`);
}

replaceExact(
  `type ExternalGuestDraft = { name: string; email: string };\ntype AgendaEvent = {`,
  `type ExternalGuestDraft = { name: string; email: string };\ntype InviteUser = { auth_user_id: string; nome: string | null; email: string | null };\ntype AgendaEvent = {`,
  "tipo do diretório interno",
);

replaceExact(
  `  const [team, setTeam] = useState<UserProfile[]>([]);\n  const [isMatrix, setIsMatrix] = useState(false);`,
  `  const [team, setTeam] = useState<UserProfile[]>([]);\n  const [inviteUsers, setInviteUsers] = useState<InviteUser[]>([]);\n  const [isMatrix, setIsMatrix] = useState(false);`,
  "estado do diretório interno",
);

replaceExact(
  `      const { data: teamRows } = await q;\n      setMe(profile as UserProfile); setIsMatrix(matrix); setCanManageTeam(matrix || branch); setTeam((teamRows || [profile]) as UserProfile[]);`,
  `      const { data: teamRows } = await q;\n      const { data: inviteRows, error: inviteError } = await supabase.rpc("agenda_internal_invite_directory");\n      if (inviteError) console.warn("[agenda] diretório interno indisponível", inviteError);\n      setInviteUsers((inviteRows || []) as InviteUser[]);\n      setMe(profile as UserProfile); setIsMatrix(matrix); setCanManageTeam(matrix || branch); setTeam((teamRows || [profile]) as UserProfile[]);`,
  "carregamento do diretório interno",
);

replaceExact(
  `      const internalGuests = createDraft.internalGuestIds\n        .map((id) => team.find((u) => u.auth_user_id === id))\n        .filter((u): u is UserProfile => Boolean(u?.email))`,
  `      const internalGuests = createDraft.internalGuestIds\n        .map((id) => inviteUsers.find((u) => u.auth_user_id === id))\n        .filter((u): u is InviteUser => Boolean(u?.email))`,
  "mapeamento de convidados internos",
);

replaceExact(
  `      {createOpen && <CreateDrawer draft={createDraft} setDraft={setCreateDraft} team={team} canManageTeam={canManageTeam} relationRows={relationRows} loading={loading} onClose={() => setCreateOpen(false)} onSave={createEvent} />}`,
  `      {createOpen && <CreateDrawer draft={createDraft} setDraft={setCreateDraft} team={team} inviteUsers={inviteUsers} canManageTeam={canManageTeam} relationRows={relationRows} loading={loading} onClose={() => setCreateOpen(false)} onSave={createEvent} />}`,
  "diretório no formulário",
);

replaceExact(
  `function CreateDrawer({ draft, setDraft, team, canManageTeam, relationRows, loading, onClose, onSave }: { draft: CreateDraft; setDraft: React.Dispatch<React.SetStateAction<CreateDraft>>; team: UserProfile[]; canManageTeam: boolean; relationRows: PersonLite[]; loading: boolean; onClose: () => void; onSave: () => void }) {\n  const internalCandidates = team.filter((u) => u.email && u.auth_user_id !== draft.ownerId);`,
  `function CreateDrawer({ draft, setDraft, team, inviteUsers, canManageTeam, relationRows, loading, onClose, onSave }: { draft: CreateDraft; setDraft: React.Dispatch<React.SetStateAction<CreateDraft>>; team: UserProfile[]; inviteUsers: InviteUser[]; canManageTeam: boolean; relationRows: PersonLite[]; loading: boolean; onClose: () => void; onSave: () => void }) {\n  const internalCandidates = inviteUsers.filter((u) => u.email && u.auth_user_id !== draft.ownerId);`,
  "candidatos internos no formulário",
);

replaceExact(
  `  useEffect(() => {\n    const channel = supabase.channel("agenda-executive-realtime").on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, () => {\n      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);\n      refreshTimer.current = window.setTimeout(loadData, 250);\n    }).subscribe();\n    return () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); supabase.removeChannel(channel); };\n  }, [loadData]);`,
  `  useEffect(() => {\n    const scheduleRefresh = () => {\n      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);\n      refreshTimer.current = window.setTimeout(loadData, 250);\n    };\n    const channel = supabase\n      .channel("agenda-executive-realtime")\n      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, scheduleRefresh)\n      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_event_guests" }, scheduleRefresh)\n      .subscribe();\n    return () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); supabase.removeChannel(channel); };\n  }, [loadData]);`,
  "realtime de RSVP",
);

replaceExact(
  `  const todayBirthdays = useMemo(() => birthdays.filter((e) => eventDateKey(e) === toDateKey(new Date())), [birthdays]);`,
  `  useEffect(() => {\n    if (!selectedEvent) return;\n    const refreshed = events.find((ev) => ev.id === selectedEvent.id) || overdue.find((ev) => ev.id === selectedEvent.id);\n    if (refreshed) setSelectedEvent(refreshed);\n  }, [events, overdue, selectedEvent?.id]);\n\n  const todayBirthdays = useMemo(() => birthdays.filter((e) => eventDateKey(e) === toDateKey(new Date())), [birthdays]);`,
  "sincronização do drawer com RSVP",
);

if (src !== before) fs.writeFileSync(path, src);
console.log(`[agenda-v3] AgendaExecutive: ${src !== before ? "atualizado" : "sem alterações"}`);
