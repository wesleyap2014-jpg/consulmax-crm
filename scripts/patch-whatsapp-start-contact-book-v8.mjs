import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

const rep = (from, to) => { if (s.includes(from)) s = s.replace(from, to); };
const before = (needle, block, flag) => { if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle); };

// Estados: inserir uma única vez, junto do bloco de Iniciar conversa.
if (!s.includes('const [contactBookSearch, setContactBookSearch]')) {
  rep(
    '  const [startTicketMessage, setStartTicketMessage] = useState("");',
    `  const [startTicketMessage, setStartTicketMessage] = useState("");
  const [contactBookSearch, setContactBookSearch] = useState("");
  const [contactBookResults, setContactBookResults] = useState<any[]>([]);
  const [selectedContactBookId, setSelectedContactBookId] = useState<string | null>(null);
  const [searchingContactBook, setSearchingContactBook] = useState(false);`
  );
}

if (!s.includes('const [campaignOpen, setCampaignOpen]')) {
  rep(
    '  const [searchingContactBook, setSearchingContactBook] = useState(false);',
    `  const [searchingContactBook, setSearchingContactBook] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignScheduledAt, setCampaignScheduledAt] = useState("");`
  );
}

before(
  '  async function startConversationFromCrm() {',
  `  async function searchContactBook(term: string) {
    const q = term.trim();
    if (!q || q.length < 2) {
      setContactBookResults([]);
      return;
    }
    setSearchingContactBook(true);
    const digits = onlyDigits(q);
    const filters = [
      'nome.ilike.%' + q + '%',
      'telefone.ilike.%' + q + '%',
    ];
    if (digits) {
      filters.push('telefone_digits.ilike.%' + digits + '%');
      filters.push('telefone.ilike.%' + digits + '%');
    }
    const { data, error } = await supabase
      .from("whatsapp_contact_book")
      .select("id,nome,telefone,email,origem,observacoes,tags,lead_id,cliente_id,opportunity_id")
      .or(filters.join(","))
      .order("nome", { ascending: true })
      .limit(12);
    if (error) {
      console.warn("Erro ao buscar agenda WhatsApp:", error);
      setContactBookResults([]);
    } else {
      setContactBookResults(data || []);
    }
    setSearchingContactBook(false);
  }

  function selectContactBook(contact: any) {
    setSelectedContactBookId(contact.id || null);
    setStartTicketName(contact.nome || "");
    setStartTicketPhone(contact.telefone || "");
    setContactBookSearch(contact.nome || contact.telefone || "");
    setContactBookResults([]);
  }

  function clearStartContactSelection() {
    setSelectedContactBookId(null);
    setContactBookSearch("");
    setContactBookResults([]);
    setStartTicketName("");
    setStartTicketPhone("");
  }

  async function loadCampaigns() {
    setLoadingCampaigns(true);
    const { data, error } = await supabase
      .from("whatsapp_campaigns")
      .select("id,name,status,campaign_type,audience_source,message_body,scheduled_at,started_at,finished_at,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("Erro ao carregar campanhas WhatsApp:", error);
      setCampaigns([]);
    } else {
      setCampaigns(data || []);
    }
    setLoadingCampaigns(false);
  }

  function campaignStatusLabel(status?: string | null) {
    const value = String(status || "draft").toLowerCase();
    const map: Record<string, string> = {
      draft: "Rascunho",
      scheduled: "Agendada",
      running: "Enviando",
      finished: "Finalizada",
      paused: "Pausada",
      cancelled: "Cancelada",
    };
    return map[value] || value;
  }

  async function createCampaignDraft() {
    const name = campaignName.trim();
    const body = campaignMessage.trim();
    if (!name) return alert("Informe o nome da campanha.");
    if (!body) return alert("Escreva a mensagem da campanha.");
    setSavingCampaign(true);
    const status = campaignScheduledAt ? "scheduled" : "draft";
    const { error } = await supabase.from("whatsapp_campaigns").insert({
      name,
      campaign_type: "free_text",
      status,
      audience_source: "contact_book",
      message_body: body,
      scheduled_at: campaignScheduledAt ? new Date(campaignScheduledAt).toISOString() : null,
      created_by: authUserId,
      updated_at: new Date().toISOString(),
    });
    setSavingCampaign(false);
    if (error) {
      console.error("Erro ao criar campanha:", error);
      return alert("Não foi possível salvar a campanha. Verifique RLS/permissões da tabela whatsapp_campaigns.");
    }
    setCampaignName("");
    setCampaignMessage("");
    setCampaignScheduledAt("");
    await loadCampaigns();
    alert(status === "scheduled" ? "Campanha agendada. O disparo será ligado na próxima etapa." : "Campanha salva como rascunho.");
  }
`,
  'async function searchContactBook'
);

before(
  '  const activeIsMine = !!active?.assigned_to && active.assigned_to === authUserId;',
  `  useEffect(() => {
    if (!startTicketOpen) return;
    const handle = window.setTimeout(() => searchContactBook(contactBookSearch), 250);
    return () => window.clearTimeout(handle);
  }, [contactBookSearch, startTicketOpen]);

  useEffect(() => {
    if (campaignOpen) loadCampaigns();
  }, [campaignOpen]);
`,
  'loadCampaigns();\n  }, [campaignOpen]'
);

before(
  '    const { data: conv, error: convError } = await supabase.from("whatsapp_conversations").insert({',
  `    await supabase.from("whatsapp_contact_book").upsert({
      id: selectedContactBookId || undefined,
      nome: name,
      telefone: phone,
      origem: "manual",
      updated_at: now,
      created_by: authUserId,
    }, { onConflict: "telefone_digits" });
`,
  'whatsapp_contact_book").upsert'
);

rep(
  '    setStartTicketName("");\n    setStartTicketPhone("");\n    setStartTicketMessage("");',
  '    setStartTicketName("");\n    setStartTicketPhone("");\n    setStartTicketMessage("");\n    setSelectedContactBookId(null);\n    setContactBookSearch("");\n    setContactBookResults([]);'
);

rep(
  '<p className="text-sm text-slate-500">Selecione a fila e informe o contato. Se o contato não existir, ele será criado automaticamente.</p>',
  '<p className="text-sm text-slate-500">Busque um contato já salvo ou preencha nome e telefone para criar um novo.</p>'
);

rep(
  '            <div className="grid gap-3 md:grid-cols-3">\n              <select value={boardQueue || selectedBoardQueue?.key || ""} onChange={(e) => setBoardQueue(e.target.value)} className="rounded-xl border px-3 py-3 text-sm">\n                {effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}\n              </select>\n              <input value={startTicketName} onChange={(e) => setStartTicketName(e.target.value)} placeholder="Nome do cliente" className="rounded-xl border px-3 py-3 text-sm" />\n              <input value={startTicketPhone} onChange={(e) => setStartTicketPhone(e.target.value)} placeholder="Telefone com DDD" className="rounded-xl border px-3 py-3 text-sm" />\n            </div>',
  `            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_240px]">
                <div className="relative">
                  <input value={contactBookSearch} onChange={(e) => { setContactBookSearch(e.target.value); setSelectedContactBookId(null); }} placeholder="Pesquisar contato por nome ou telefone..." className="w-full rounded-xl border px-3 py-3 text-sm" />
                  {(contactBookResults.length > 0 || searchingContactBook) && (
                    <div className="absolute left-0 right-0 top-[52px] z-[70] max-h-72 overflow-auto rounded-2xl border bg-white p-2 shadow-2xl">
                      {searchingContactBook && <div className="px-3 py-2 text-xs text-slate-400">Buscando...</div>}
                      {contactBookResults.map((contact) => (
                        <button key={contact.id} type="button" onClick={() => selectContactBook(contact)} className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50">
                          <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{contact.nome || "Sem nome"}</span><span className="block text-xs text-slate-500">{formatPhoneBR(contact.telefone)} {contact.origem ? "• " + contact.origem : ""}</span></span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Selecionar</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <select value={boardQueue || selectedBoardQueue?.key || ""} onChange={(e) => setBoardQueue(e.target.value)} className="rounded-xl border px-3 py-3 text-sm">
                  {effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
                </select>
              </div>
              {selectedContactBookId && <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><span>Contato selecionado da agenda.</span><button type="button" onClick={clearStartContactSelection} className="font-bold underline">Trocar</button></div>}
              <div className="grid gap-3 md:grid-cols-2">
                <input value={startTicketName} onChange={(e) => setStartTicketName(e.target.value)} placeholder="Nome do cliente" className="rounded-xl border px-3 py-3 text-sm" />
                <input value={startTicketPhone} onChange={(e) => setStartTicketPhone(e.target.value)} placeholder="Telefone com DDD" className="rounded-xl border px-3 py-3 text-sm" />
              </div>
            </div>`
);

// Botão de campanhas no topo.
if (!s.includes('onClick={() => setCampaignOpen(true)}')) {
  s = s.replace(
    '<Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>',
    '<Button variant="outline" onClick={() => setCampaignOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">Campanhas</Button><Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>'
  );
}

// Overlay de campanhas.
before(
  '      <Card className="mb-4 overflow-hidden border-0 shadow-sm">',
  `      {campaignOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Central WhatsApp</p>
                <h2 className="text-2xl font-black" style={{ color: C.navy }}>Campanhas WhatsApp</h2>
                <p className="text-sm text-slate-500">Crie rascunhos e agendamentos com opt-out obrigatório. O disparo automático será ativado na próxima etapa.</p>
              </div>
              <Button variant="ghost" onClick={() => setCampaignOpen(false)} className="text-xl">×</Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
              <div className="space-y-3 rounded-3xl bg-slate-50 p-4">
                <label className="text-sm font-bold text-slate-700">Nome da campanha</label>
                <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ex.: Reativação de leads" className="w-full rounded-xl border px-3 py-3 text-sm" />
                <label className="text-sm font-bold text-slate-700">Data e hora de envio</label>
                <input type="datetime-local" value={campaignScheduledAt} onChange={(e) => setCampaignScheduledAt(e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm" />
                <label className="text-sm font-bold text-slate-700">Mensagem</label>
                <textarea value={campaignMessage} onChange={(e) => setCampaignMessage(e.target.value)} placeholder="Use {{nome}} ou {{primeiro_nome}}. Ex.: Olá {{primeiro_nome}}, tudo bem?" className="min-h-[160px] w-full rounded-xl border px-3 py-3 text-sm" />
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                  O CRM incluirá controle de descadastro. Recomendo terminar campanhas com: Para não receber mais mensagens, responda SAIR.
                </div>
                <Button onClick={createCampaignDraft} disabled={savingCampaign} className="w-full text-white" style={{ background: C.red }}>{savingCampaign ? "Salvando..." : "Salvar campanha"}</Button>
              </div>
              <div className="rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Campanhas recentes</p>
                    <p className="text-xs text-slate-500">Base: agenda WhatsApp, excluindo contatos descadastrados.</p>
                  </div>
                  <Button variant="outline" onClick={loadCampaigns} disabled={loadingCampaigns}>Atualizar</Button>
                </div>
                <div className="max-h-[520px] space-y-2 overflow-auto">
                  {loadingCampaigns && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Carregando campanhas...</div>}
                  {!loadingCampaigns && campaigns.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma campanha criada ainda.</div>}
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="rounded-2xl border bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">{campaign.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{campaign.message_body || "Sem mensagem"}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{campaignStatusLabel(campaign.status)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        <span>Tipo: {campaign.campaign_type || "free_text"}</span>
                        <span>• Público: {campaign.audience_source || "contact_book"}</span>
                        {campaign.scheduled_at && <span>• Agendada: {fmtTime(campaign.scheduled_at)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
`,
  'Campanhas WhatsApp'
);

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-start-contact-book-v8] ok');
