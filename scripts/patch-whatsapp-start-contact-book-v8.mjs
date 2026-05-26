import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

const rep = (from, to) => { if (s.includes(from)) s = s.replace(from, to); };
const before = (needle, block, flag) => { if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle); };

if (!s.includes('const [contactBookSearch, setContactBookSearch]')) {
  rep('  const [startTicketMessage, setStartTicketMessage] = useState("");', `  const [startTicketMessage, setStartTicketMessage] = useState("");
  const [contactBookSearch, setContactBookSearch] = useState("");
  const [contactBookResults, setContactBookResults] = useState<any[]>([]);
  const [selectedContactBookId, setSelectedContactBookId] = useState<string | null>(null);
  const [searchingContactBook, setSearchingContactBook] = useState(false);`);
}

if (!s.includes('const [campaignOpen, setCampaignOpen]')) {
  rep('  const [searchingContactBook, setSearchingContactBook] = useState(false);', `  const [searchingContactBook, setSearchingContactBook] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignScheduledAt, setCampaignScheduledAt] = useState("");`);
}

if (!s.includes('const [campaignAudienceSearch, setCampaignAudienceSearch]')) {
  rep('  const [campaignScheduledAt, setCampaignScheduledAt] = useState("");', `  const [campaignScheduledAt, setCampaignScheduledAt] = useState("");
  const [campaignAudienceSearch, setCampaignAudienceSearch] = useState("");
  const [campaignAudienceResults, setCampaignAudienceResults] = useState<any[]>([]);
  const [campaignAudienceLoading, setCampaignAudienceLoading] = useState(false);
  const [selectedCampaignContacts, setSelectedCampaignContacts] = useState<any[]>([]);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignFileBase64, setCampaignFileBase64] = useState<string | null>(null);
  const [campaignFileName, setCampaignFileName] = useState<string | null>(null);
  const [campaignFileMimeType, setCampaignFileMimeType] = useState<string | null>(null);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);`);
}

before('  async function startConversationFromCrm() {', `  async function searchContactBook(term: string) {
    const q = term.trim();
    if (!q || q.length < 2) { setContactBookResults([]); return; }
    setSearchingContactBook(true);
    const digits = onlyDigits(q);
    const filters = ['nome.ilike.%' + q + '%', 'telefone.ilike.%' + q + '%'];
    if (digits) { filters.push('telefone_digits.ilike.%' + digits + '%'); filters.push('telefone.ilike.%' + digits + '%'); }
    const { data, error } = await supabase.from("whatsapp_contact_book").select("id,nome,telefone,email,origem,observacoes,tags,lead_id,cliente_id,opportunity_id").or(filters.join(",")).order("nome", { ascending: true }).limit(12);
    if (error) { console.warn("Erro ao buscar agenda WhatsApp:", error); setContactBookResults([]); } else { setContactBookResults(data || []); }
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
    setSelectedContactBookId(null); setContactBookSearch(""); setContactBookResults([]); setStartTicketName(""); setStartTicketPhone("");
  }

  function campaignPhone(contact: any) { return onlyDigits(contact?.telefone_digits || contact?.telefone || ""); }

  function clearCampaignForm() {
    setEditingCampaignId(null); setCampaignName(""); setCampaignMessage(""); setCampaignScheduledAt("");
    setSelectedCampaignContacts([]); setCampaignAudienceSearch(""); setCampaignAudienceResults([]);
    setCampaignFileBase64(null); setCampaignFileName(null); setCampaignFileMimeType(null);
  }

  function renderCampaignMessage(template: string, contact: any) {
    const first = String(contact?.nome || "").trim().split(/\\s+/)[0] || "";
    let body = String(template || "").replace(/{{\\s*nome\\s*}}/gi, contact?.nome || "").replace(/{{\\s*primeiro_nome\\s*}}/gi, first).replace(/{{\\s*telefone\\s*}}/gi, campaignPhone(contact));
    if (!/\\b(SAIR|PARAR|CANCELAR|DESCADASTRAR|STOP)\\b/i.test(body)) body += "\\n\\nPara não receber mais mensagens da Consulmax, responda SAIR.";
    return body;
  }

  async function searchCampaignAudience(term: string) {
    const q = term.trim();
    if (!q || q.length < 2) { setCampaignAudienceResults([]); return; }
    setCampaignAudienceLoading(true);
    const digits = onlyDigits(q);
    const filters = ['nome.ilike.%' + q + '%', 'telefone.ilike.%' + q + '%'];
    if (digits) { filters.push('telefone_digits.ilike.%' + digits + '%'); filters.push('telefone.ilike.%' + digits + '%'); }
    const { data, error } = await supabase.from("whatsapp_contact_book").select("id,nome,telefone,telefone_digits,email,origem,tags").or(filters.join(",")).order("nome", { ascending: true }).limit(20);
    if (error) { console.warn("Erro ao pesquisar público da campanha:", error); setCampaignAudienceResults([]); }
    else {
      const phones = (data || []).map((row: any) => campaignPhone(row)).filter(Boolean);
      const { data: optRows } = phones.length ? await supabase.from("whatsapp_opt_outs").select("telefone_digits").in("telefone_digits", phones) : { data: [] as any[] };
      const blocked = new Set((optRows || []).map((row: any) => onlyDigits(row.telefone_digits)));
      setCampaignAudienceResults((data || []).map((row: any) => ({ ...row, _optOut: blocked.has(campaignPhone(row)) })));
    }
    setCampaignAudienceLoading(false);
  }

  function toggleCampaignContact(contact: any) {
    if (contact?._optOut) return alert("Este contato está descadastrado e não pode receber campanha.");
    const phone = campaignPhone(contact);
    if (!phone) return;
    setSelectedCampaignContacts((prev) => prev.some((c) => campaignPhone(c) === phone) ? prev.filter((c) => campaignPhone(c) !== phone) : [...prev, contact]);
  }

  async function loadCampaigns() {
    setLoadingCampaigns(true);
    const { data, error } = await supabase.from("whatsapp_campaigns").select("id,name,status,campaign_type,audience_source,message_body,scheduled_at,started_at,finished_at,created_at,attachment_bucket,attachment_path,attachment_mime_type").order("created_at", { ascending: false }).limit(50);
    if (error) { console.warn("Erro ao carregar campanhas WhatsApp:", error); setCampaigns([]); } else { setCampaigns(data || []); }
    setLoadingCampaigns(false);
  }

  function campaignStatusLabel(status?: string | null) {
    const value = String(status || "draft").toLowerCase();
    const map: Record<string, string> = { draft: "Rascunho", scheduled: "Agendada", running: "Enviando", finished: "Finalizada", paused: "Pausada", cancelled: "Cancelada" };
    return map[value] || value;
  }

  async function handleCampaignFile(file?: File | null) {
    if (!file) { setCampaignFileBase64(null); setCampaignFileName(null); setCampaignFileMimeType(null); return; }
    const reader = new FileReader();
    reader.onload = () => { setCampaignFileBase64(String(reader.result || "")); setCampaignFileName(file.name); setCampaignFileMimeType(file.type || "application/octet-stream"); };
    reader.readAsDataURL(file);
  }

  async function loadCampaignRecipients(campaignId: string) {
    const { data } = await supabase.from("whatsapp_campaign_recipients").select("id,contact_book_id,telefone_digits,nome,status").eq("campaign_id", campaignId).order("created_at", { ascending: true });
    setSelectedCampaignContacts((data || []).map((r: any) => ({ id: r.contact_book_id || r.id, nome: r.nome, telefone_digits: r.telefone_digits, status: r.status })));
  }

  async function editCampaign(campaign: any) {
    setEditingCampaignId(campaign.id); setCampaignName(campaign.name || ""); setCampaignMessage(campaign.message_body || "");
    setCampaignScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : "");
    setCampaignFileName(campaign.attachment_path ? "Anexo salvo" : null); setCampaignFileBase64(null); setCampaignFileMimeType(campaign.attachment_mime_type || null);
    await loadCampaignRecipients(campaign.id);
  }

  async function createCampaignDraft() {
    const name = campaignName.trim(); const body = campaignMessage.trim();
    if (!name) return alert("Informe o nome da campanha."); if (!body) return alert("Escreva a mensagem da campanha.");
    setSavingCampaign(true);
    const status = campaignScheduledAt ? "scheduled" : "draft";
    let attachmentPath: string | null = null;
    if (campaignFileBase64 && campaignFileName) {
      const base64 = campaignFileBase64.includes(",") ? campaignFileBase64.split(",").pop() || "" : campaignFileBase64;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      attachmentPath = "campaigns/" + Date.now() + "-" + campaignFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const saved = await supabase.storage.from("whatsapp-media").upload(attachmentPath, bytes, { contentType: campaignFileMimeType || "application/octet-stream", upsert: true });
      if (saved.error) { setSavingCampaign(false); return alert("Não foi possível salvar o anexo."); }
    }
    const payload: any = { name, campaign_type: "free_text", status, audience_source: "selected_contacts", message_body: body, scheduled_at: campaignScheduledAt ? new Date(campaignScheduledAt).toISOString() : null, updated_at: new Date().toISOString() };
    if (attachmentPath) { payload.attachment_bucket = "whatsapp-media"; payload.attachment_path = attachmentPath; payload.attachment_mime_type = campaignFileMimeType; }
    let campaignId = editingCampaignId;
    if (editingCampaignId) {
      const { error } = await supabase.from("whatsapp_campaigns").update(payload).eq("id", editingCampaignId);
      if (error) { setSavingCampaign(false); console.error("Erro ao atualizar campanha:", error); return alert("Não foi possível atualizar a campanha."); }
    } else {
      const { data, error } = await supabase.from("whatsapp_campaigns").insert({ ...payload, created_by: authUserId }).select("id").single();
      if (error) { setSavingCampaign(false); console.error("Erro ao criar campanha:", error); return alert("Não foi possível salvar a campanha. Verifique RLS/permissões da tabela whatsapp_campaigns."); }
      campaignId = data?.id;
    }
    if (campaignId && selectedCampaignContacts.length > 0) {
      const rows = selectedCampaignContacts.map((c: any) => ({ campaign_id: campaignId, contact_book_id: c.id?.length === 36 ? c.id : null, telefone_digits: campaignPhone(c), nome: c.nome || null, status: "pending" })).filter((r: any) => r.telefone_digits);
      if (rows.length) await supabase.from("whatsapp_campaign_recipients").upsert(rows, { onConflict: "campaign_id,telefone_digits" });
    }
    setSavingCampaign(false); await loadCampaigns(); clearCampaignForm();
    alert(status === "scheduled" ? "Campanha salva e agendada." : "Campanha salva como rascunho.");
  }

  async function ensureCampaignConversation(contact: any) {
    const phone = campaignPhone(contact);
    const { data: waContact, error: contactError } = await supabase.from("whatsapp_contacts").upsert({ wa_id: phone, telefone: phone, nome: contact.nome || null, updated_at: new Date().toISOString() }, { onConflict: "wa_id" }).select("id,lead_id").single();
    if (contactError || !waContact?.id) throw contactError || new Error("Contato não encontrado.");
    const { data: existing } = await supabase.from("whatsapp_conversations").select("id").eq("contact_id", waContact.id).neq("queue", "finalizado").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing?.id) return existing.id;
    const { data: conv, error } = await supabase.from("whatsapp_conversations").insert({ contact_id: waContact.id, lead_id: waContact.lead_id, status: "humano", stage: "entrada", queue: "novos_contatos", last_message: "Campanha iniciada", last_message_at: new Date().toISOString(), unread_count: 0 }).select("id").single();
    if (error || !conv?.id) throw error || new Error("Conversa não criada.");
    return conv.id;
  }

  async function sendCampaignNow(campaign: any) {
    if (!confirm("Iniciar envio manual desta campanha para os contatos vinculados?")) return;
    setSendingCampaignId(campaign.id);
    const { data: recipients, error } = await supabase.from("whatsapp_campaign_recipients").select("id,contact_book_id,telefone_digits,nome,status").eq("campaign_id", campaign.id).in("status", ["pending", "failed"]);
    if (error) { setSendingCampaignId(null); return alert("Não foi possível carregar destinatários."); }
    if (!recipients || recipients.length === 0) { setSendingCampaignId(null); return alert("Esta campanha ainda não tem contatos vinculados."); }
    let sent = 0; let failed = 0;
    for (const r of recipients) {
      try {
        const phone = campaignPhone(r);
        const { data: blocked } = await supabase.from("whatsapp_opt_outs").select("id").eq("telefone_digits", phone).limit(1);
        if (blocked && blocked.length) { await supabase.from("whatsapp_campaign_recipients").update({ status: "skipped", error_message: "Descadastrado" }).eq("id", r.id); continue; }
        const conversationId = await ensureCampaignConversation(r);
        const body = renderCampaignMessage(campaign.message_body || "", r);
        const sendPayload: any = { conversation_id: conversationId, to: phone, body, user_id: authUserId };
        if (campaignFileBase64 && campaignFileMimeType) { sendPayload.file_base64 = campaignFileBase64; sendPayload.file_name = campaignFileName; sendPayload.mime_type = campaignFileMimeType; sendPayload.caption = body; }
        const response = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sendPayload) });
        if (!response.ok) throw new Error(await response.text());
        await supabase.from("whatsapp_campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", r.id);
        sent++;
      } catch (err: any) {
        await supabase.from("whatsapp_campaign_recipients").update({ status: "failed", error_message: String(err?.message || err).slice(0, 800) }).eq("id", r.id);
        failed++;
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    await supabase.from("whatsapp_campaigns").update({ status: "finished", started_at: new Date().toISOString(), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaign.id);
    setSendingCampaignId(null); await loadCampaigns(); alert("Envio concluído. Enviadas: " + sent + ". Falhas: " + failed + ".");
  }
`, 'async function searchContactBook');

before('  const activeIsMine = !!active?.assigned_to && active.assigned_to === authUserId;', `  useEffect(() => {
    if (!startTicketOpen) return;
    const handle = window.setTimeout(() => searchContactBook(contactBookSearch), 250);
    return () => window.clearTimeout(handle);
  }, [contactBookSearch, startTicketOpen]);

  useEffect(() => { if (campaignOpen) loadCampaigns(); }, [campaignOpen]);

  useEffect(() => {
    if (!campaignOpen) return;
    const handle = window.setTimeout(() => searchCampaignAudience(campaignAudienceSearch), 250);
    return () => window.clearTimeout(handle);
  }, [campaignAudienceSearch, campaignOpen]);
`, 'searchCampaignAudience(campaignAudienceSearch)');

before('    const { data: conv, error: convError } = await supabase.from("whatsapp_conversations").insert({', `    await supabase.from("whatsapp_contact_book").upsert({ id: selectedContactBookId || undefined, nome: name, telefone: phone, origem: "manual", updated_at: now, created_by: authUserId }, { onConflict: "telefone_digits" });
`, 'whatsapp_contact_book").upsert');

rep('    setStartTicketName("");\n    setStartTicketPhone("");\n    setStartTicketMessage("");', '    setStartTicketName("");\n    setStartTicketPhone("");\n    setStartTicketMessage("");\n    setSelectedContactBookId(null);\n    setContactBookSearch("");\n    setContactBookResults([]);');
rep('<p className="text-sm text-slate-500">Selecione a fila e informe o contato. Se o contato não existir, ele será criado automaticamente.</p>', '<p className="text-sm text-slate-500">Busque um contato já salvo ou preencha nome e telefone para criar um novo.</p>');

rep('            <div className="grid gap-3 md:grid-cols-3">\n              <select value={boardQueue || selectedBoardQueue?.key || ""} onChange={(e) => setBoardQueue(e.target.value)} className="rounded-xl border px-3 py-3 text-sm">\n                {effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}\n              </select>\n              <input value={startTicketName} onChange={(e) => setStartTicketName(e.target.value)} placeholder="Nome do cliente" className="rounded-xl border px-3 py-3 text-sm" />\n              <input value={startTicketPhone} onChange={(e) => setStartTicketPhone(e.target.value)} placeholder="Telefone com DDD" className="rounded-xl border px-3 py-3 text-sm" />\n            </div>', `            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_240px]">
                <div className="relative">
                  <input value={contactBookSearch} onChange={(e) => { setContactBookSearch(e.target.value); setSelectedContactBookId(null); }} placeholder="Pesquisar contato por nome ou telefone..." className="w-full rounded-xl border px-3 py-3 text-sm" />
                  {(contactBookResults.length > 0 || searchingContactBook) && <div className="absolute left-0 right-0 top-[52px] z-[70] max-h-72 overflow-auto rounded-2xl border bg-white p-2 shadow-2xl">{searchingContactBook && <div className="px-3 py-2 text-xs text-slate-400">Buscando...</div>}{contactBookResults.map((contact) => <button key={contact.id} type="button" onClick={() => selectContactBook(contact)} className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{contact.nome || "Sem nome"}</span><span className="block text-xs text-slate-500">{formatPhoneBR(contact.telefone)} {contact.origem ? "• " + contact.origem : ""}</span></span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Selecionar</span></button>)}</div>}
                </div>
                <select value={boardQueue || selectedBoardQueue?.key || ""} onChange={(e) => setBoardQueue(e.target.value)} className="rounded-xl border px-3 py-3 text-sm">{effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select>
              </div>
              {selectedContactBookId && <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><span>Contato selecionado da agenda.</span><button type="button" onClick={clearStartContactSelection} className="font-bold underline">Trocar</button></div>}
              <div className="grid gap-3 md:grid-cols-2"><input value={startTicketName} onChange={(e) => setStartTicketName(e.target.value)} placeholder="Nome do cliente" className="rounded-xl border px-3 py-3 text-sm" /><input value={startTicketPhone} onChange={(e) => setStartTicketPhone(e.target.value)} placeholder="Telefone com DDD" className="rounded-xl border px-3 py-3 text-sm" /></div>
            </div>`);

if (!s.includes('onClick={() => setCampaignOpen(true)}')) {
  s = s.replace('<Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>', '<Button variant="outline" onClick={() => setCampaignOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">Campanhas</Button><Button variant="outline" onClick={() => setStartTicketOpen((v) => !v)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">+ Iniciar conversa</Button>');
}

before('      <Card className="mb-4 overflow-hidden border-0 shadow-sm">', `      {campaignOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-7xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Central WhatsApp</p><h2 className="text-2xl font-black" style={{ color: C.navy }}>Campanhas WhatsApp</h2><p className="text-sm text-slate-500">Selecione contatos, edite campanhas, inclua anexo e dispare manualmente.</p></div><Button variant="ghost" onClick={() => setCampaignOpen(false)} className="text-xl">×</Button></div>
            <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
              <div className="space-y-3 rounded-3xl bg-slate-50 p-4">
                <label className="text-sm font-bold text-slate-700">Nome da campanha</label><input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ex.: Reativação de leads" className="w-full rounded-xl border px-3 py-3 text-sm" />
                <label className="text-sm font-bold text-slate-700">Data e hora de envio</label><input type="datetime-local" value={campaignScheduledAt} onChange={(e) => setCampaignScheduledAt(e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm" />
                <label className="text-sm font-bold text-slate-700">Mensagem</label><textarea value={campaignMessage} onChange={(e) => setCampaignMessage(e.target.value)} placeholder="Use {{nome}} ou {{primeiro_nome}}." className="min-h-[150px] w-full rounded-xl border px-3 py-3 text-sm" />
                <label className="text-sm font-bold text-slate-700">Anexo opcional</label><input type="file" onChange={(e) => handleCampaignFile(e.target.files?.[0])} className="w-full rounded-xl border bg-white px-3 py-3 text-sm" />{campaignFileName && <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600">Anexo: <b>{campaignFileName}</b></div>}
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">O CRM mantém controle de descadastro. Recomendo terminar campanhas com: Para não receber mais mensagens, responda SAIR.</div>
                <div className="rounded-2xl border bg-white p-3"><p className="text-xs font-black uppercase text-slate-400">Contatos vinculados</p><p className="text-sm font-black text-slate-800">{selectedCampaignContacts.length} selecionado(s)</p><div className="mt-2 max-h-28 space-y-1 overflow-auto">{selectedCampaignContacts.map((c) => <div key={campaignPhone(c)} className="flex items-center justify-between rounded-xl bg-slate-50 px-2 py-1 text-xs"><span className="truncate">{c.nome || campaignPhone(c)}</span><button type="button" onClick={() => toggleCampaignContact(c)} className="font-bold text-red-700">remover</button></div>)}</div></div>
                <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={clearCampaignForm}>Limpar</Button><Button onClick={createCampaignDraft} disabled={savingCampaign} className="text-white" style={{ background: C.red }}>{savingCampaign ? "Salvando..." : editingCampaignId ? "Atualizar" : "Salvar"}</Button></div>
              </div>
              <div className="rounded-3xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">Público e campanhas recentes</p><p className="text-xs text-slate-500">Pesquise, selecione contatos e vincule à campanha.</p></div><Button variant="outline" onClick={loadCampaigns} disabled={loadingCampaigns}>Atualizar</Button></div>
                <div className="mb-3 rounded-2xl bg-slate-50 p-3"><label className="text-xs font-black uppercase tracking-wide text-slate-400">Pesquisar contato</label><input value={campaignAudienceSearch} onChange={(e) => setCampaignAudienceSearch(e.target.value)} placeholder="Digite nome ou telefone..." className="mt-2 w-full rounded-xl border px-3 py-3 text-sm" /><div className="mt-3 max-h-52 space-y-2 overflow-auto">{campaignAudienceLoading && <div className="text-xs text-slate-400">Buscando contatos...</div>}{!campaignAudienceLoading && campaignAudienceSearch.trim().length >= 2 && campaignAudienceResults.length === 0 && <div className="text-xs text-slate-400">Nenhum contato encontrado.</div>}{campaignAudienceResults.map((contact) => { const selected = selectedCampaignContacts.some((c) => campaignPhone(c) === campaignPhone(contact)); return <div key={contact.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{contact.nome || "Sem nome"}</p><p className="text-xs text-slate-500">{formatPhoneBR(contact.telefone || contact.telefone_digits)} {contact.origem ? "• " + contact.origem : ""}</p></div><button type="button" disabled={contact._optOut} onClick={() => toggleCampaignContact(contact)} className={contact._optOut ? "rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-red-700" : selected ? "rounded-full bg-slate-800 px-2 py-1 text-[10px] font-black text-white" : "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700"}>{contact._optOut ? "Descadastrado" : selected ? "Selecionado" : "Vincular"}</button></div>})}</div></div>
                <div className="max-h-[330px] space-y-2 overflow-auto">{loadingCampaigns && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Carregando campanhas...</div>}{!loadingCampaigns && campaigns.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma campanha criada ainda.</div>}{campaigns.map((campaign) => <div key={campaign.id} className="rounded-2xl border bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-800">{campaign.name}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{campaign.message_body || "Sem mensagem"}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{campaignStatusLabel(campaign.status)}</span></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400"><span>Tipo: {campaign.campaign_type || "free_text"}</span><span>• Público: {campaign.audience_source || "contact_book"}</span>{campaign.scheduled_at && <span>• Agendada: {fmtTime(campaign.scheduled_at)}</span>}</div><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => editCampaign(campaign)}>Editar</Button><Button size="sm" disabled={sendingCampaignId === campaign.id} onClick={() => sendCampaignNow(campaign)} style={{ background: C.red }} className="text-white">{sendingCampaignId === campaign.id ? "Enviando..." : "Enviar agora"}</Button></div></div>)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
`, 'Campanhas WhatsApp');

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-start-contact-book-v8] ok');
