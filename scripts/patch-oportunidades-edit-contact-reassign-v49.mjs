import fs from "node:fs";

function replaceOnce(source, label, pattern, replacement, marker) {
  if (marker && source.includes(marker)) {
    console.log(`[patch-oportunidades-v49] ${label}: já aplicado`);
    return source;
  }
  if (typeof pattern === "string") {
    if (!source.includes(pattern)) {
      throw new Error(`[patch-oportunidades-v49] âncora não encontrada: ${label}`);
    }
    console.log(`[patch-oportunidades-v49] ${label}: aplicado`);
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) {
    throw new Error(`[patch-oportunidades-v49] padrão não encontrado: ${label}`);
  }
  console.log(`[patch-oportunidades-v49] ${label}: aplicado`);
  return source.replace(pattern, replacement);
}

const v5File = "src/pages/OportunidadesPipelineV5.tsx";
let v5 = fs.readFileSync(v5File, "utf8");

v5 = replaceOnce(
  v5,
  "estado de edição rápida do contato",
  '  const [oppLeadSearch, setOppLeadSearch] = useState("");',
  `  const [oppLeadSearch, setOppLeadSearch] = useState("");
  const [editingOpportunityLeadId, setEditingOpportunityLeadId] = useState("");
  const [editOpportunityLeadName, setEditOpportunityLeadName] = useState("");
  const [editOpportunityLeadPhone, setEditOpportunityLeadPhone] = useState("");
  const [editOpportunityLeadEmail, setEditOpportunityLeadEmail] = useState("");
  const [editOpportunityLeadSaving, setEditOpportunityLeadSaving] = useState(false);`,
  "editingOpportunityLeadId",
);

v5 = replaceOnce(
  v5,
  "funções de edição rápida do contato",
  '  async function createOpp() {',
  `  function beginOpportunityLeadEdit(lead: Lead) {
    setOppLeadId(lead.id);
    setEditingOpportunityLeadId(lead.id);
    setEditOpportunityLeadName(String(lead.nome || ""));
    setEditOpportunityLeadPhone(String(lead.telefone || ""));
    setEditOpportunityLeadEmail(String(lead.email || ""));
  }

  function cancelOpportunityLeadEdit() {
    setEditingOpportunityLeadId("");
    setEditOpportunityLeadName("");
    setEditOpportunityLeadPhone("");
    setEditOpportunityLeadEmail("");
  }

  async function saveOpportunityLeadEdit() {
    if (!editingOpportunityLeadId) return;
    const nome = editOpportunityLeadName.trim();
    if (!nome) return alert("Informe o nome do contato.");

    const rawPhone = editOpportunityLeadPhone.trim();
    const parsedPhone = rawPhone
      ? parsePhoneNumberFromString(rawPhone, rawPhone.startsWith("+") ? undefined : "BR")
      : null;
    if (!parsedPhone?.isValid()) {
      return alert("Informe um telefone válido. Para números internacionais, use o código do país.");
    }
    const telefone = parsedPhone.number;
    const email = editOpportunityLeadEmail.trim();
    if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return alert("Informe um e-mail válido ou deixe o campo em branco.");
    }

    setEditOpportunityLeadSaving(true);
    try {
      const duplicate = await supabase
        .from("leads")
        .select("id,nome")
        .eq("telefone", telefone)
        .neq("id", editingOpportunityLeadId)
        .limit(1);
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data?.length) {
        return alert("Este telefone já está cadastrado para " + (duplicate.data[0].nome || "outro contato") + ".");
      }

      const { data, error } = await supabase
        .from("leads")
        .update({ nome, telefone, email: email || null })
        .eq("id", editingOpportunityLeadId)
        .select("id,nome,telefone,email,origem,partner_id,owner_id,created_at")
        .single();
      if (error) throw error;

      const updated = data as Lead;
      setLeads((current) =>
        current.map((lead) => (lead.id === updated.id ? { ...lead, ...updated } : lead)),
      );
      setOppLeadId(updated.id);
      setOppLeadSearch(updated.nome || "");
      cancelOpportunityLeadEdit();
    } catch (error: any) {
      alert(error?.message || "Não foi possível atualizar o contato.");
    } finally {
      setEditOpportunityLeadSaving(false);
    }
  }

  async function createOpp() {`,
  "function beginOpportunityLeadEdit",
);

v5 = replaceOnce(
  v5,
  "resultado de busca com lápis de edição",
  /\{opportunityLeadMatches\.map\(\(lead\) => \(\s*<button[\s\S]*?<\/button>\s*\)\)\}/,
  `{opportunityLeadMatches.map((lead) => (
              <div
                key={lead.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 40px",
                  gap: 8,
                  alignItems: "stretch",
                }}
              >
                <button
                  type="button"
                  style={{
                    ...leadResultButton,
                    ...(lead.id === oppLeadId ? selectedLeadResult : {}),
                  }}
                  onClick={() => setOppLeadId(lead.id)}
                >
                  <strong>{lead.nome}</strong>
                  <span>
                    {formatPhone(lead.telefone)}
                    {lead.email ? \` • \${lead.email}\` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={"Editar contato " + lead.nome}
                  title="Editar contato"
                  onClick={(event) => {
                    event.stopPropagation();
                    beginOpportunityLeadEdit(lead);
                  }}
                  style={{
                    border: "1px solid rgba(30,41,63,.14)",
                    borderRadius: 12,
                    background: lead.id === editingOpportunityLeadId ? "rgba(181,165,115,.18)" : "white",
                    color: C.navy,
                    fontSize: 18,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  ✎
                </button>
              </div>
            ))}`,
  'aria-label={"Editar contato " + lead.nome}',
);

const editPanelAnchor = `            {opportunityLeadMatches.length === 0 && (
              <div style={emptyLeadResults}>Nenhum lead encontrado.</div>
            )}
          </div>

          {selectedOpportunityLead && (`;
const editPanelReplacement = `            {opportunityLeadMatches.length === 0 && (
              <div style={emptyLeadResults}>Nenhum lead encontrado.</div>
            )}
          </div>

          {editingOpportunityLeadId && (
            <div
              data-crm-opportunity-contact-edit="true"
              style={{
                marginTop: 12,
                padding: 14,
                border: "1px solid rgba(181,165,115,.45)",
                borderRadius: 16,
                background: "rgba(224,206,140,.10)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ color: C.navy }}>Editar contato</strong>
                <small style={{ color: C.slate }}>
                  Altere somente os dados cadastrais necessários e salve antes de criar a oportunidade.
                </small>
              </div>

              <label style={labelStyle}>Nome</label>
              <input
                style={inputStyle}
                value={editOpportunityLeadName}
                onChange={(event) => setEditOpportunityLeadName(event.target.value)}
                placeholder="Nome do contato"
              />

              <label style={labelStyle}>Telefone</label>
              <input
                style={inputStyle}
                value={editOpportunityLeadPhone}
                onChange={(event) => setEditOpportunityLeadPhone(event.target.value)}
                placeholder="Ex.: +55 69 99999-9999"
              />

              <label style={labelStyle}>E-mail</label>
              <input
                style={inputStyle}
                type="email"
                value={editOpportunityLeadEmail}
                onChange={(event) => setEditOpportunityLeadEmail(event.target.value)}
                placeholder="email@exemplo.com"
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={btnSecondary}
                  disabled={editOpportunityLeadSaving}
                  onClick={cancelOpportunityLeadEdit}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={editOpportunityLeadSaving}
                  onClick={saveOpportunityLeadEdit}
                >
                  {editOpportunityLeadSaving ? "Salvando..." : "Salvar contato"}
                </button>
              </div>
            </div>
          )}

          {selectedOpportunityLead && (`;
v5 = replaceOnce(
  v5,
  "formulário de edição dentro de Nova Oportunidade",
  editPanelAnchor,
  editPanelReplacement,
  'data-crm-opportunity-contact-edit="true"',
);

v5 = replaceOnce(
  v5,
  "limpar edição ao fechar Nova Oportunidade",
  '<Modal title="Nova Oportunidade" onClose={() => setNewOppOpen(false)}>',
  '<Modal title="Nova Oportunidade" onClose={() => { cancelOpportunityLeadEdit(); setNewOppOpen(false); }}>',
  'onClose={() => { cancelOpportunityLeadEdit(); setNewOppOpen(false); }}',
);

fs.writeFileSync(v5File, v5);

const legacyFile = "src/pages/OportunidadesPipelineV7Legacy.tsx";
let legacy = fs.readFileSync(legacyFile, "utf8");
const reassignAnchor = `  useEffect(() => {
    if (open) loadData();
  }, [open]);`;
const reassignReplacement = `${reassignAnchor}

  useEffect(() => {
    const handleCardReassign = (event: Event) => {
      const opportunityId = String(
        (event as CustomEvent<{ opportunityId?: string }>).detail?.opportunityId || "",
      );
      if (!opportunityId) return;

      const opportunity = opps.find((item) => item.id === opportunityId) || null;
      setQ("");
      setSelectedOppId(opportunityId);
      setSelectedUserId(opportunity?.vendedor_id || "");
      setSyncLeadOwner(true);
      setOpen(true);
    };

    window.addEventListener("crm:reassign-opportunity", handleCardReassign as EventListener);
    return () =>
      window.removeEventListener("crm:reassign-opportunity", handleCardReassign as EventListener);
  }, [opps]);`;
legacy = replaceOnce(
  legacy,
  "ligar botão Reatribuir do card ao modal existente",
  reassignAnchor,
  reassignReplacement,
  "handleCardReassign",
);
fs.writeFileSync(legacyFile, legacy);

for (const [file, checks] of [
  [v5File, ["editingOpportunityLeadId", "saveOpportunityLeadEdit", "data-crm-opportunity-contact-edit", "Editar contato"]],
  [legacyFile, ["crm:reassign-opportunity", "handleCardReassign", "setSelectedOppId(opportunityId)"]],
]) {
  const source = fs.readFileSync(file, "utf8");
  for (const check of checks) {
    if (!source.includes(check)) {
      throw new Error(`[patch-oportunidades-v49] validação falhou em ${file}: ${check}`);
    }
  }
}

console.log("[patch-oportunidades-v49] concluído");
