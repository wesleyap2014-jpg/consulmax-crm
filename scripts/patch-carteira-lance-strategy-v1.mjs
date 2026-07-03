import fs from 'fs';

const file = 'src/pages/Carteira.tsx';
let src = fs.readFileSync(file, 'utf8');

const typeAnchor = `  descricao: string | null;
  status: "nova" | "encarteirada";
`;
const typeInsert = `  descricao: string | null;
  estrategia_lance?: any | null;
  status: "nova" | "encarteirada";
`;

if (!src.includes('estrategia_lance?: any | null;')) {
  if (!src.includes(typeAnchor)) throw new Error('patch-carteira-lance-strategy-v1: Venda type anchor not found');
  src = src.replace(typeAnchor, typeInsert);
}

const stateAnchor = `  const [form, setForm] = useState<Partial<Venda>>({
    cpf: "",
    data_venda: new Date().toISOString().slice(0, 10),
    produto: "Automóvel",
    administradora: "",
    forma_venda: "Parcela Cheia",
    tipo_venda: "Normal",
    descricao: "",
    grupo: "",
    tabela: "",
    data_nascimento: "",
  });
`;

const stateInsert = stateAnchor + `

  const emptyLanceStrategy = () => ({
    livre: false,
    livre_pct: "",
    fixo1: false,
    fixo1_pct: "",
    fixo2: false,
    fixo2_pct: "",
  });

  const [lanceStrategy, setLanceStrategy] = useState<any>(emptyLanceStrategy());
`;

if (!src.includes('const [lanceStrategy, setLanceStrategy]')) {
  if (!src.includes(stateAnchor)) throw new Error('patch-carteira-lance-strategy-v1: form state anchor not found');
  src = src.replace(stateAnchor, stateInsert);
}

const helperAnchor = `  const onFormChange = (k: keyof Venda, val: any) => setForm((f) => ({ ...f, [k]: val }));
`;

const helperInsert = helperAnchor + `

  const normalizedAdminForLance = (raw?: string | null) => {
    const s = (raw || "")
      .toString()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase();
    if (s.includes("embracon")) return "EMBRACON";
    if (s.includes("maggi")) return "MAGGI";
    if (s.includes("bb") || s.includes("banco do brasil") || s.includes("bancodobrasil")) return "BB CONSÓRCIOS";
    if (s.includes("hs")) return "HS";
    return "";
  };

  const lanceConfigForAdmin = (raw?: string | null) => {
    const adm = normalizedAdminForLance(raw);
    if (adm === "EMBRACON") {
      return {
        adm,
        required: true,
        single: true,
        note: "Selecione exatamente uma estratégia para Embracon.",
        options: [
          { key: "livre", tipo: "Lance Livre", label: "Lance Livre", requiresPct: true },
          { key: "fixo1", tipo: "Primeiro Lance Fixo 50%", label: "Primeiro Lance Fixo 50%", requiresPct: false, fixedPct: 50 },
          { key: "fixo2", tipo: "Segundo Lance Fixo 25%", label: "Segundo Lance Fixo 25%", requiresPct: false, fixedPct: 25 },
        ],
      };
    }
    if (adm === "MAGGI") {
      return {
        adm,
        required: true,
        single: false,
        max: 3,
        note: "Selecione uma ou mais estratégias para Maggi. Todas exigem percentual.",
        options: [
          { key: "livre", tipo: "Lance Livre", label: "Lance Livre", requiresPct: true },
          { key: "fixo1", tipo: "Primeiro Lance Fixo", label: "Primeiro Lance Fixo", requiresPct: true },
          { key: "fixo2", tipo: "Segundo Lance Fixo", label: "Segundo Lance Fixo", requiresPct: true },
        ],
      };
    }
    if (adm === "BB CONSÓRCIOS") {
      return {
        adm,
        required: true,
        single: false,
        max: 2,
        note: "Selecione ao menos uma estratégia para BB Consórcios.",
        options: [
          { key: "livre", tipo: "Lance Livre", label: "Lance Livre", requiresPct: true },
          { key: "fixo1", tipo: "Lance Fixo", label: "Lance Fixo", requiresPct: true },
        ],
      };
    }
    if (adm === "HS") {
      return { adm, required: false, single: false, max: 0, note: "HS dispensado por ora.", options: [] };
    }
    return { adm, required: false, single: false, max: 0, note: "Selecione uma administradora para configurar a estratégia de lance.", options: [] };
  };

  const selectedLanceOptions = (config: any) => (config?.options || []).filter((opt: any) => !!lanceStrategy?.[opt.key]);

  const toggleLanceStrategy = (key: string, config: any) => {
    setLanceStrategy((prev: any) => {
      if (config?.single) {
        const next = emptyLanceStrategy();
        const willSelect = !prev?.[key];
        return { ...next, [key]: willSelect, [key + "_pct"]: prev?.[key + "_pct"] || "" };
      }
      return { ...prev, [key]: !prev?.[key] };
    });
  };

  const validateAndBuildLancePayload = () => {
    const config = lanceConfigForAdmin(form.administradora as string);
    const selected = selectedLanceOptions(config);

    if (config.required && selected.length === 0) {
      throw new Error("Selecione pelo menos uma estratégia de lance para " + config.adm + ".");
    }

    if (config.single && selected.length !== 1) {
      throw new Error("Selecione apenas uma estratégia de lance para " + config.adm + ".");
    }

    if (config.max && selected.length > config.max) {
      throw new Error("Selecione no máximo " + config.max + " estratégia(s) de lance para " + config.adm + ".");
    }

    const opcoes = selected.map((opt: any) => {
      let percentual = opt.fixedPct ?? null;
      if (opt.requiresPct) {
        const raw = String(lanceStrategy?.[opt.key + "_pct"] || "").trim();
        const parsed = parsePct4(raw);
        if (parsed == null) throw new Error("Informe o percentual para " + opt.label + ".");
        percentual = parsed;
      }
      return {
        chave: opt.key,
        tipo: opt.tipo || opt.label,
        percentual,
        percentual_formatado: percentual == null ? null : formatPct4(percentual) + "%",
      };
    });

    if (!opcoes.length) return null;

    return {
      administradora: config.adm,
      opcoes,
      atualizado_em: new Date().toISOString(),
    };
  };
`;

if (!src.includes('const normalizedAdminForLance')) {
  if (!src.includes(helperAnchor)) throw new Error('patch-carteira-lance-strategy-v1: onFormChange anchor not found');
  src = src.replace(helperAnchor, helperInsert);
}

const adminReturnOld = `                      return { ...f, administradora: value, produto: nextProduto, tabela: "" };
`;
const adminReturnNew = `                      setLanceStrategy(emptyLanceStrategy());
                      return { ...f, administradora: value, produto: nextProduto, tabela: "" };
`;
if (!src.includes('setLanceStrategy(emptyLanceStrategy());\n                      return { ...f, administradora: value, produto: nextProduto, tabela: "" };')) {
  if (!src.includes(adminReturnOld)) throw new Error('patch-carteira-lance-strategy-v1: admin return anchor not found');
  src = src.replace(adminReturnOld, adminReturnNew);
}

const payloadOld = `      const segmento = normalizeProdutoToSegmento(form.produto as Produto);
      const payload: Partial<Venda> = {
`;
const payloadNew = `      const segmento = normalizeProdutoToSegmento(form.produto as Produto);
      const estrategiaLance = validateAndBuildLancePayload();
      const payload: Partial<Venda> = {
`;
if (!src.includes('const estrategiaLance = validateAndBuildLancePayload();')) {
  if (!src.includes(payloadOld)) throw new Error('patch-carteira-lance-strategy-v1: payload anchor not found');
  src = src.replace(payloadOld, payloadNew);
}

const descricaoOld = `        descricao: form.descricao ?? "",
`;
const descricaoNew = `        descricao: form.descricao ?? "",
        estrategia_lance: estrategiaLance,
`;
if (!src.includes('estrategia_lance: estrategiaLance,')) {
  if (!src.includes(descricaoOld)) throw new Error('patch-carteira-lance-strategy-v1: descricao payload anchor not found');
  src = src.replace(descricaoOld, descricaoNew);
}

const resetOld = `        descricao: "",
        grupo: "",
        tabela: "",
        data_nascimento: "",
      });

      setLeadSearch("");
`;
const resetNew = `        descricao: "",
        grupo: "",
        tabela: "",
        data_nascimento: "",
      });
      setLanceStrategy(emptyLanceStrategy());

      setLeadSearch("");
`;
if (!src.includes('setLanceStrategy(emptyLanceStrategy());\n\n      setLeadSearch("");')) {
  if (!src.includes(resetOld)) throw new Error('patch-carteira-lance-strategy-v1: reset anchor not found');
  src = src.replace(resetOld, resetNew);
}

const uiAnchor = `              {form.tipo_venda === "Bolsão" && (
                <div>
                  <label className="text-sm text-gray-600">Grupo (Bolsão)</label>
                  <input className="w-full border rounded-xl px-3 py-2" value={form.grupo ?? ""} onChange={(e) => onFormChange("grupo", e.target.value)} placeholder="Informe o número do grupo" />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Descrição da Venda</label>
`;

const uiInsert = `              {form.tipo_venda === "Bolsão" && (
                <div>
                  <label className="text-sm text-gray-600">Grupo (Bolsão)</label>
                  <input className="w-full border rounded-xl px-3 py-2" value={form.grupo ?? ""} onChange={(e) => onFormChange("grupo", e.target.value)} placeholder="Informe o número do grupo" />
                </div>
              )}

              {(() => {
                const config = lanceConfigForAdmin(form.administradora as string);
                return (
                  <div className="md:col-span-2 rounded-2xl border bg-gray-50 p-4 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Estratégia de lance</div>
                      <div className="text-xs text-gray-500">{config.note}</div>
                    </div>

                    {config.options.length === 0 ? (
                      <div className="text-sm text-gray-500">{config.adm === "HS" ? "HS dispensado por ora." : "Selecione uma administradora para exibir as opções."}</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {config.options.map((opt: any) => {
                          const checked = !!lanceStrategy?.[opt.key];
                          return (
                            <div key={opt.key} className={"rounded-xl border p-3 " + (checked ? "bg-white border-[#1E293F]" : "bg-white/60")}>
                              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                <input type={config.single ? "radio" : "checkbox"} checked={checked} onChange={() => toggleLanceStrategy(opt.key, config)} />
                                {opt.label}
                              </label>
                              {opt.fixedPct && <div className="text-xs text-gray-500 mt-2">Percentual fixo: {formatPct4(opt.fixedPct)}%</div>}
                              {checked && opt.requiresPct && (
                                <div className="mt-2">
                                  <label className="text-xs text-gray-500">Percentual</label>
                                  <input
                                    className="w-full border rounded-lg px-2 py-1 text-sm"
                                    value={lanceStrategy?.[opt.key + "_pct"] || ""}
                                    onChange={(e) => setLanceStrategy((p: any) => ({ ...p, [opt.key + "_pct"]: e.target.value }))}
                                    placeholder="Ex.: 25,0000%"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Descrição da Venda</label>
`;

if (!src.includes('Estratégia de lance</div>')) {
  if (!src.includes(uiAnchor)) throw new Error('patch-carteira-lance-strategy-v1: ui anchor not found');
  src = src.replace(uiAnchor, uiInsert);
}

fs.writeFileSync(file, src);
console.log('patch-carteira-lance-strategy-v1 applied');
