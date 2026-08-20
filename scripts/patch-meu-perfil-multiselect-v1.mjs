import fs from "node:fs";

const path = "src/pages/MeuPerfilCascata.tsx";
let src = fs.readFileSync(path, "utf8");
let changed = false;

function replaceRegex(regex, replacement, label) {
  if (!regex.test(src)) {
    console.log(`[meu-perfil-multiselect-v1] ${label}: trecho não encontrado`);
    return;
  }
  src = src.replace(regex, replacement);
  changed = true;
  console.log(`[meu-perfil-multiselect-v1] ${label}: aplicado`);
}

if (!src.includes("selectedIds: string[]")) {
  replaceRegex(
    /function CascadeToolbar\([\s\S]*?\n}\n\nfunction PerfilPreposto/,
`function CascadeToolbar({
  currentProfile,
  visibleUsers,
  selectedIds,
  onToggle,
  onSelectAll,
  loading,
}: {
  currentProfile: UserProfile;
  visibleUsers: VisibleUser[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  loading: boolean;
}) {
  if (currentProfile.role !== "admin" || visibleUsers.length <= 1) return null;

  const selectedUsers = visibleUsers.filter((u) => selectedIds.includes(u.id));
  const allSelected = visibleUsers.length > 0 && selectedUsers.length === visibleUsers.length;
  const selectedLabel = allSelected
    ? \`Todos os usuários (\${visibleUsers.length})\`
    : selectedUsers.length === 1
      ? (selectedUsers[0].id === currentProfile.id ? "Meu perfil" : selectedUsers[0].nome)
      : \`\${selectedUsers.length} usuários selecionados\`;

  return (
    <Card className="mb-4 border-[#A11C27]/15 bg-white/95 shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#A11C27]/10 text-[#A11C27]">
            <UsersRound className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Perfis da minha cascata</div>
            <div className="text-xs text-slate-500">Selecione um, vários ou todos os usuários para consolidar os indicadores.</div>
          </div>
        </div>

        <div className="relative min-w-0 md:w-[420px]">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Visualizando</label>
          <details className="group relative">
            <summary className="flex h-10 cursor-pointer list-none items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition hover:border-[#A11C27]/30 focus:border-[#A11C27]/50 focus:ring-2 focus:ring-[#A11C27]/10">
              <span className="truncate">{selectedLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-40 mt-2 max-h-[360px] w-full min-w-[320px] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border-b border-slate-100 px-3 py-2.5 font-extrabold text-slate-900 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  disabled={loading}
                  className="h-4 w-4 accent-[#A11C27]"
                />
                <span>Selecionar todos</span>
                <span className="ml-auto text-xs font-semibold text-slate-400">{visibleUsers.length}</span>
              </label>
              <div className="mt-1 space-y-0.5">
                {visibleUsers.map((u) => {
                  const checked = selectedIds.includes(u.id);
                  return (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(u.id)}
                        disabled={loading}
                        className="h-4 w-4 accent-[#A11C27]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">{u.id === currentProfile.id ? \`Meu perfil — \${u.nome}\` : u.nome}</span>
                        <span className="block truncate text-[11px] text-slate-500">{u.unit_name || "Sem unidade"}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>
          <div className="mt-1 truncate text-[11px] text-slate-500">
            {selectedUsers.length > 1
              ? \`Indicadores consolidados de \${selectedUsers.length} usuários.\`
              : selectedUsers[0]?.id === currentProfile.id
                ? "Você está vendo o seu próprio perfil."
                : selectedUsers[0]
                  ? \`Perfil de \${selectedUsers[0].nome}.\`
                  : "Selecione ao menos um usuário."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PerfilPreposto`,
    "toolbar com seleção múltipla",
  );
}

if (!src.includes("function PerfilAgregado(")) {
  const aggregateComponent = `
function PerfilAgregado({ users }: { users: VisibleUser[] }) {
  const [aggregate, setAggregate] = useState<{
    sales: SaleRow[];
    opportunities: OpportunityRow[];
    leadCountMonth: number;
    goals: Array<GoalRow & { vendedor_id?: string | null }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userKey = users.map((u) => u.id).sort().join("|");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authIds = users.map((u) => u.auth_user_id).filter(Boolean);
      const profileIds = users.map((u) => u.id).filter(Boolean);
      if (!authIds.length || !profileIds.length) throw new Error("Nenhum usuário válido selecionado.");

      const now = new Date();
      const monthStart = startOfMonth(now);
      const nextMonth = addMonths(monthStart, 1);
      const chartStart = addMonths(monthStart, -11);
      const goalYears = Array.from(new Set([chartStart.getFullYear(), now.getFullYear()]));

      const [salesRes, oppRes, leadsRes, goalsRes] = await Promise.all([
        supabase
          .from("vendas")
          .select("data_venda,valor_venda,administradora,segmento")
          .in("vendedor_id", authIds)
          .gte("data_venda", ymd(chartStart))
          .lt("data_venda", ymd(nextMonth))
          .order("data_venda", { ascending: true }),
        supabase
          .from("opportunities")
          .select("id,estagio,stage,score,qualification_score,segmento,created_at,updated_at,qualified_at,won_at,lost_at,next_follow_up_at")
          .in("vendedor_id", authIds)
          .limit(10000),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("owner_id", authIds)
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", nextMonth.toISOString()),
        supabase
          .from("metas_vendedores")
          .select("vendedor_id,ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
          .in("vendedor_id", profileIds)
          .in("ano", goalYears),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (oppRes.error) throw oppRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (goalsRes.error) throw goalsRes.error;

      setAggregate({
        sales: (salesRes.data || []) as SaleRow[],
        opportunities: (oppRes.data || []) as OpportunityRow[],
        leadCountMonth: leadsRes.count || 0,
        goals: (goalsRes.data || []) as Array<GoalRow & { vendedor_id?: string | null }>,
      });
    } catch (e: any) {
      console.error("[PerfilAgregado]", e);
      setError(e?.message || "Falha ao consolidar os perfis selecionados.");
    } finally {
      setLoading(false);
    }
  }, [userKey]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    if (!aggregate) return null;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const nextMonth = addMonths(monthStart, 1);
    const monthStartYMD = ymd(monthStart);
    const nextMonthYMD = ymd(nextMonth);

    const salesMonth = aggregate.sales.filter((s) => s.data_venda >= monthStartYMD && s.data_venda < nextMonthYMD);
    const salesMonthTotal = salesMonth.reduce((sum, s) => sum + Number(s.valor_venda || 0), 0);
    const salesMonthCount = salesMonth.length;
    const ticket = salesMonthCount ? salesMonthTotal / salesMonthCount : 0;

    const wonMonth = aggregate.opportunities.filter((o) => {
      const d = onlyDate(o.won_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const lostMonth = aggregate.opportunities.filter((o) => {
      const d = onlyDate(o.lost_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const conversion = wonMonth + lostMonth ? (wonMonth / (wonMonth + lostMonth)) * 100 : 0;

    const open = aggregate.opportunities.filter(isOpen);
    const overdue = open.filter((o) => o.next_follow_up_at && new Date(o.next_follow_up_at).getTime() <= now.getTime());
    const highPotential = overdue.filter((o) => Number(o.score || 0) >= 70 || Number(o.qualification_score || 0) >= 18);

    const createdMonth = aggregate.opportunities.filter((o) => {
      const d = onlyDate(o.created_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const qualifiedMonth = aggregate.opportunities.filter((o) => {
      const d = onlyDate(o.qualified_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const proposalMonth = aggregate.opportunities.filter((o) => {
      const d = onlyDate(o.updated_at);
      return isProposal(o) && Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const staleProposals = open.filter((o) => isProposal(o) && Date.now() - new Date(o.updated_at).getTime() > 7 * 86400000).length;

    const goalKey = \`m\${String(now.getMonth() + 1).padStart(2, "0")}\`;
    const salesGoal = aggregate.goals
      .filter((g) => Number(g.ano) === now.getFullYear())
      .reduce((sum, g) => sum + Number(g[goalKey] || 0), 0);

    const chart = Array.from({ length: 12 }, (_, idx) => {
      const date = addMonths(startOfMonth(now), idx - 11);
      const start = ymd(date);
      const end = ymd(addMonths(date, 1));
      const sales = aggregate.sales
        .filter((s) => s.data_venda >= start && s.data_venda < end)
        .reduce((sum, s) => sum + Number(s.valor_venda || 0), 0);
      const key = \`m\${String(date.getMonth() + 1).padStart(2, "0")}\`;
      const meta = aggregate.goals
        .filter((g) => Number(g.ano) === date.getFullYear())
        .reduce((sum, g) => sum + Number(g[key] || 0), 0);
      return {
        mes: \`\${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "")}/\${String(date.getFullYear()).slice(-2)}\`,
        vendas: sales,
        meta,
      };
    });

    return {
      salesMonthTotal,
      salesMonthCount,
      salesGoal,
      ticket,
      conversion,
      openCount: open.length,
      overdueFollowups: overdue.length,
      highPotentialFollowups: highPotential.length,
      prospections: aggregate.leadCountMonth + createdMonth,
      qualifiedMonth,
      proposalMonth,
      staleProposals,
      qualificationRate: createdMonth ? (qualifiedMonth / createdMonth) * 100 : 0,
      chart,
    };
  }, [aggregate]);

  if (loading) {
    return (
      <div className="grid min-h-[45vh] place-items-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><RefreshCcw className="h-4 w-4 animate-spin" /> Consolidando indicadores…</div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <Card className="mx-auto mt-8 max-w-xl border-red-200 bg-white/90">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-600" />
          <div className="font-bold text-slate-900">Não foi possível consolidar os perfis</div>
          <div className="text-sm text-slate-500">{error || "Dados indisponíveis."}</div>
          <Button onClick={load}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  const previewUsers = users.slice(0, 8);
  const remaining = Math.max(0, users.length - previewUsers.length);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-10">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm">
        <div className="h-20 bg-[linear-gradient(110deg,#1E293F_0%,#1E293F_48%,#A11C27_100%)]" />
        <div className="flex flex-col gap-3 px-5 pb-5 pt-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-slate-950">Visão consolidada</h1>
            <Badge className="bg-[#A11C27] hover:bg-[#A11C27]">{users.length} usuários</Badge>
          </div>
          <div className="text-sm text-slate-500">Os valores abaixo consolidam apenas os usuários marcados no seletor.</div>
          <div className="flex flex-wrap gap-1.5">
            {previewUsers.map((user) => <Badge key={user.id} variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">{user.nome}</Badge>)}
            {remaining ? <Badge variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">+{remaining}</Badge> : null}
          </div>
        </div>
      </section>

      <Card className="bg-white/95">
        <CardHeader className="pb-2"><SectionTitle icon={BarChart3}>Desempenho consolidado</SectionTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Realizado no mês" value={formatBRL(metrics.salesMonthTotal)} helper={\`\${metrics.salesMonthCount} venda(s)\`} />
            <Kpi label="Meta mensal" value={formatBRL(metrics.salesGoal)} helper={metrics.salesGoal ? \`\${pct(metrics.salesMonthTotal, metrics.salesGoal).toFixed(0)}% atingido\` : "Meta não definida"} />
            <Kpi label="Conversão" value={\`\${metrics.conversion.toFixed(1)}%\`} helper="ganhos x encerrados" />
            <Kpi label="Ticket médio" value={formatBRL(metrics.ticket)} />
            <Kpi label="Oportunidades" value={metrics.openCount} helper="abertas" />
            <Kpi label="Follow-ups" value={metrics.overdueFollowups} helper="pendentes" />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Kpi label="Prospecções" value={metrics.prospections} helper="novos leads + oportunidades" />
            <Kpi label="Qualificações" value={metrics.qualifiedMonth} helper="concluídas no mês" />
            <Kpi label="Propostas" value={metrics.proposalMonth} helper="em proposta/negociação" />
          </div>
          <div className="mt-5 h-[280px] rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-extrabold text-slate-700">Evolução mensal consolidada</span><span className="text-[11px] text-slate-500">Últimos 12 meses</span></div>
            <ResponsiveContainer width="100%" height="90%">
              <ComposedChart data={metrics.chart} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => \`R$\${Math.round(v / 1000)}k\`} />
                <Tooltip formatter={(value: number) => formatBRL(Number(value))} />
                <Bar dataKey="vendas" fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Line dataKey="meta" type="monotone" stroke="#1E293F" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-[#A11C27]/20 bg-white/95">
        <CardHeader className="pb-2"><SectionTitle icon={Sparkles}>IA / Max — consolidado</SectionTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><div className="flex gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div><div className="text-sm font-extrabold text-slate-900">Follow-ups de alto potencial</div><div className="mt-1 text-xs text-slate-600">{metrics.highPotentialFollowups} pendente(s) com score alto.</div></div></div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div><div className="text-sm font-extrabold text-slate-900">Qualificação comercial</div><div className="mt-1 text-xs text-slate-600">{metrics.qualificationRate.toFixed(0)}% das oportunidades criadas no mês foram qualificadas.</div></div></div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><div className="text-sm font-extrabold text-slate-900">Propostas aguardando avanço</div><div className="mt-1 text-xs text-slate-600">{metrics.staleProposals} sem atualização há mais de 7 dias.</div></div></div></div>
        </CardContent>
      </Card>
    </div>
  );
}

`;

  if (!src.includes("export default function MeuPerfilCascata()")) {
    throw new Error("[meu-perfil-multiselect-v1] export MeuPerfilCascata não encontrado");
  }
  src = src.replace("export default function MeuPerfilCascata()", `${aggregateComponent}export default function MeuPerfilCascata()`);
  changed = true;
  console.log("[meu-perfil-multiselect-v1] visão consolidada: aplicada");
}

if (src.includes('const [selectedId, setSelectedId] = useState<string>("");')) {
  src = src.replace('const [selectedId, setSelectedId] = useState<string>("");', 'const [selectedIds, setSelectedIds] = useState<string[]>([]);');
  changed = true;
  console.log("[meu-perfil-multiselect-v1] estado de seleção múltipla: aplicado");
}

if (src.includes("setSelectedId(current.id);")) {
  src = src.split("setSelectedId(current.id);").join("setSelectedIds([current.id]);");
  changed = true;
  console.log("[meu-perfil-multiselect-v1] seleção inicial: aplicada");
}

if (src.includes("setSelectedId((previous) => (previous && finalRows.some((u) => u.id === previous) ? previous : current.id));")) {
  src = src.replace(
    "setSelectedId((previous) => (previous && finalRows.some((u) => u.id === previous) ? previous : current.id));",
    "setSelectedIds((previous) => { const valid = previous.filter((id) => finalRows.some((u) => u.id === id)); return valid.length ? valid : [current.id]; });",
  );
  changed = true;
  console.log("[meu-perfil-multiselect-v1] preserva seleção válida: aplicado");
}

const oldFooter = `  const effectiveSelectedId = selectedId || currentProfile.id;
  const isOwnProfile = effectiveSelectedId === currentProfile.id;

  return (
    <div>
      <CascadeToolbar
        currentProfile={currentProfile}
        visibleUsers={visibleUsers}
        selectedId={effectiveSelectedId}
        onSelect={setSelectedId}
        loading={loadingCascade}
      />
      {isOwnProfile ? <MeuPerfil /> : <PerfilPreposto key={effectiveSelectedId} profileId={effectiveSelectedId} />}
    </div>
  );
}`;

const newFooter = `  const effectiveSelectedIds = selectedIds.length ? selectedIds : [currentProfile.id];
  const selectedUsers = visibleUsers.filter((u) => effectiveSelectedIds.includes(u.id));
  const effectiveUsers = selectedUsers.length ? selectedUsers : visibleUsers.filter((u) => u.id === currentProfile.id);
  const singleSelectedId = effectiveUsers.length === 1 ? effectiveUsers[0].id : null;
  const isOwnProfile = singleSelectedId === currentProfile.id;

  const toggleSelectedUser = (id: string) => {
    setSelectedIds((previous) => {
      if (previous.includes(id)) return previous.length > 1 ? previous.filter((item) => item !== id) : previous;
      return [...previous, id];
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((previous) => {
      const allSelected = visibleUsers.length > 0 && visibleUsers.every((user) => previous.includes(user.id));
      return allSelected ? [currentProfile.id] : visibleUsers.map((user) => user.id);
    });
  };

  return (
    <div>
      <CascadeToolbar
        currentProfile={currentProfile}
        visibleUsers={visibleUsers}
        selectedIds={effectiveUsers.map((u) => u.id)}
        onToggle={toggleSelectedUser}
        onSelectAll={toggleSelectAll}
        loading={loadingCascade}
      />
      {effectiveUsers.length > 1 ? (
        <PerfilAgregado key={effectiveUsers.map((u) => u.id).sort().join("|")} users={effectiveUsers} />
      ) : isOwnProfile ? (
        <MeuPerfil />
      ) : singleSelectedId ? (
        <PerfilPreposto key={singleSelectedId} profileId={singleSelectedId} />
      ) : null}
    </div>
  );
}`;

if (src.includes(oldFooter)) {
  src = src.replace(oldFooter, newFooter);
  changed = true;
  console.log("[meu-perfil-multiselect-v1] renderização consolidada: aplicada");
} else if (!src.includes("toggleSelectedUser")) {
  throw new Error("[meu-perfil-multiselect-v1] rodapé do componente não encontrado");
}

if (changed) fs.writeFileSync(path, src);
console.log(`[meu-perfil-multiselect-v1] ${changed ? "concluído com alterações" : "já estava aplicado"}`);
