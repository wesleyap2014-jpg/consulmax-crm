import fs from "node:fs";

const file = "src/pages/AtendimentoWhatsApp.tsx";
let src = fs.readFileSync(file, "utf8");

const marker = "patch-whatsapp-campaign-bulk-audience-v35";
if (src.includes(marker)) {
  console.log(`${marker}: already applied`);
  process.exit(0);
}

function mustReplace(search, replace, label) {
  if (!src.includes(search)) {
    throw new Error(`${marker}: trecho não encontrado para ${label}`);
  }
  src = src.replace(search, replace);
}

mustReplace(
  `  const [campaignAudienceLoading, setCampaignAudienceLoading] = useState(false);\n  const [selectedCampaignContacts, setSelectedCampaignContacts] = useState<ContactBook[]>([]);`,
  `  const [campaignAudienceLoading, setCampaignAudienceLoading] = useState(false);\n  const [campaignAudienceBulkLoading, setCampaignAudienceBulkLoading] = useState<string | null>(null);\n  const [selectedCampaignContacts, setSelectedCampaignContacts] = useState<ContactBook[]>([]);`,
  "estado de carregamento em massa"
);

const bulkFunction = `
  async function addCampaignAudienceSource(source: "leads" | "clientes" | "whatsapp_contact_book") {
    const labelMap: Record<typeof source, string> = {
      leads: "Leads",
      clientes: "Clientes",
      whatsapp_contact_book: "Agenda WhatsApp",
    };

    setCampaignAudienceBulkLoading(source);

    try {
      let query: any;

      if (source === "leads") {
        query = supabase.from("leads").select("id,nome,telefone,email,owner_id").not("telefone", "is", null).limit(2000);
        if (!manager && authUserId) query = query.eq("owner_id", authUserId);
      } else if (source === "clientes") {
        query = supabase.from("clientes").select("id,nome,telefone,email,created_by").not("telefone", "is", null).limit(2000);
        if (!manager && authUserId) query = query.eq("created_by", authUserId);
      } else {
        query = supabase
          .from("whatsapp_contact_book")
          .select("id,nome,telefone,telefone_digits,email,origem,tags,lead_id,cliente_id,opportunity_id")
          .not("telefone_digits", "is", null)
          .order("nome", { ascending: true })
          .limit(3000);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as any[];
      const contacts: ContactBook[] = rows
        .map((row) => {
          const phone = onlyDigits(row.telefone_digits || row.telefone);

          if (!phone) return null;

          if (source === "leads") {
            return {
              id: row.id,
              nome: row.nome || "Lead sem nome",
              telefone: phone,
              telefone_digits: phone,
              email: row.email || null,
              origem: "leads",
              tags: ["lead"],
              lead_id: row.id,
            } as ContactBook;
          }

          if (source === "clientes") {
            return {
              id: row.id,
              nome: row.nome || "Cliente sem nome",
              telefone: phone,
              telefone_digits: phone,
              email: row.email || null,
              origem: "clientes",
              tags: ["cliente"],
              cliente_id: row.id,
            } as ContactBook;
          }

          return {
            id: row.id,
            nome: row.nome || "Contato WhatsApp",
            telefone: phone,
            telefone_digits: phone,
            email: row.email || null,
            origem: row.origem || "agenda_whatsapp",
            tags: row.tags || [],
            lead_id: row.lead_id || null,
            cliente_id: row.cliente_id || null,
            opportunity_id: row.opportunity_id || null,
          } as ContactBook;
        })
        .filter(Boolean) as ContactBook[];

      if (contacts.length === 0) {
        alert(`Nenhum contato com telefone foi encontrado em ${labelMap[source]}.`);
        return;
      }

      const phones = Array.from(new Set(contacts.map((contact) => onlyDigits(contact.telefone_digits || contact.telefone)).filter(Boolean)));
      const blocked = new Set<string>();

      for (let i = 0; i < phones.length; i += 500) {
        const chunk = phones.slice(i, i + 500);
        const { data: optRows, error: optError } = await supabase
          .from("whatsapp_opt_outs")
          .select("telefone_digits")
          .in("telefone_digits", chunk);

        if (optError) throw optError;
        (optRows || []).forEach((row: any) => blocked.add(onlyDigits(row.telefone_digits)));
      }

      let added = 0;
      let duplicates = 0;
      let skipped = 0;

      setSelectedCampaignContacts((prev) => {
        const seen = new Set(prev.map((item) => onlyDigits(item.telefone_digits || item.telefone)).filter(Boolean));
        const next = [...prev];

        contacts.forEach((contact) => {
          const phone = onlyDigits(contact.telefone_digits || contact.telefone);
          if (!phone) return;

          if (blocked.has(phone)) {
            skipped++;
            return;
          }

          if (seen.has(phone)) {
            duplicates++;
            return;
          }

          seen.add(phone);
          next.push(contact);
          added++;
        });

        return next;
      });

      alert(`${labelMap[source]} adicionados à campanha.\n\nAdicionados: ${added}\nDuplicados ignorados: ${duplicates}\nDescadastrados ignorados: ${skipped}`);
    } catch (error: any) {
      console.error("Erro ao importar público da campanha:", error);
      alert(error?.message || "Não foi possível importar esta lista de contatos.");
    } finally {
      setCampaignAudienceBulkLoading(null);
    }
  }

`;

mustReplace(
  `  function toggleCampaignContact(contact: ContactBook) {`,
  `${bulkFunction}  function toggleCampaignContact(contact: ContactBook) {`,
  "função de importação de público em massa"
);

mustReplace(
  `        subtitle="Selecione contatos, edite campanhas, inclua anexo e dispare manualmente ou deixe agendada para o runner."`,
  `        subtitle="Selecione uma base inteira, como Leads ou Clientes, ou pesquise contatos específicos para montar o público da campanha."`,
  "subtítulo do overlay de campanhas"
);

mustReplace(
  `                <p className="text-xs text-slate-500">Pesquise, selecione contatos e vincule à campanha.</p>`,
  `                <p className="text-xs text-slate-500">Selecione uma base completa ou vincule contatos manualmente.</p>`,
  "texto de apoio do público"
);

const audienceBlock = `
            <div className="mb-3 rounded-2xl border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Públicos rápidos</p>
                  <p className="mt-1 text-xs text-slate-500">Adicione listas completas sem selecionar contato por contato.</p>
                </div>
                {campaignAudienceBulkLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!campaignAudienceBulkLoading}
                  onClick={() => addCampaignAudienceSource("leads")}
                  className="justify-start rounded-xl"
                >
                  {campaignAudienceBulkLoading === "leads" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                  Leads
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={!!campaignAudienceBulkLoading}
                  onClick={() => addCampaignAudienceSource("clientes")}
                  className="justify-start rounded-xl"
                >
                  {campaignAudienceBulkLoading === "clientes" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                  Clientes
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={!!campaignAudienceBulkLoading}
                  onClick={() => addCampaignAudienceSource("whatsapp_contact_book")}
                  className="justify-start rounded-xl"
                >
                  {campaignAudienceBulkLoading === "whatsapp_contact_book" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                  Agenda WhatsApp
                </Button>
              </div>
            </div>
`;

mustReplace(
  `            <div className="mb-3 rounded-2xl bg-slate-50 p-3">`,
  `${audienceBlock}
            <div className="mb-3 rounded-2xl bg-slate-50 p-3">`,
  "bloco de públicos rápidos"
);

fs.writeFileSync(file, src);
console.log(`${marker}: applied`);
