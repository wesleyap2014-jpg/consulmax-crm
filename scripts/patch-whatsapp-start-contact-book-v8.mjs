import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

const rep = (from, to) => { if (s.includes(from)) s = s.replace(from, to); };
const before = (needle, block, flag) => { if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle); };

rep(
  '  const [startTicketMessage, setStartTicketMessage] = useState("");',
  `  const [startTicketMessage, setStartTicketMessage] = useState("");
  const [contactBookSearch, setContactBookSearch] = useState("");
  const [contactBookResults, setContactBookResults] = useState<any[]>([]);
  const [selectedContactBookId, setSelectedContactBookId] = useState<string | null>(null);
  const [searchingContactBook, setSearchingContactBook] = useState(false);`
);

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
`,
  'searchContactBook(contactBookSearch)'
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

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-start-contact-book-v8] ok');
