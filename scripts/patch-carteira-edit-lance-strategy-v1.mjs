import fs from 'fs';

const file = 'src/pages/Carteira.tsx';
let src = fs.readFileSync(file, 'utf8');

const modeOld = `type CotaEditMode = "pick" | "cota_codigo" | "contemplacao" | "inad" | "transfer";
`;
const modeNew = `type CotaEditMode = "pick" | "cota_codigo" | "contemplacao" | "inad" | "transfer" | "lance_strategy";
`;
if (!src.includes('"lance_strategy"')) {
  if (!src.includes(modeOld)) throw new Error('patch-carteira-edit-lance-strategy-v1: CotaEditMode anchor not found');
  src = src.replace(modeOld, modeNew);
}

const stateAnchor = `  const [ceInadFlag, setCeInadFlag] = useState<boolean>(false);
  const [ceInadEm, setCeInadEm] = useState<string>("");
  const [ceInadRev, setCeInadRev] = useState<string>("");
`;
const stateInsert = stateAnchor + `
  const [ceLanceStrategy, setCeLanceStrategy] = useState<any>(emptyLanceStrategy());
`;
if (!src.includes('const [ceLanceStrategy, setCeLanceStrategy]')) {
  if (!src.includes(stateAnchor)) throw new Error('patch-carteira-edit-lance-strategy-v1: ce state anchor not found');
  src = src.replace(stateAnchor, stateInsert);
}

const helpersAnchor = `  const openViewVenda = (v: Venda, lead?: Lead) => setViewVendaModal({ open: true, venda: v, lead });

  const openCotaEditor = (v: Venda) => {
`;
const helpersInsert = `  const openViewVenda = (v: Venda, lead?: Lead) => setViewVendaModal({ open: true, venda: v, lead });

  const hydrateLanceStrategyFromVenda = (v: Venda) => {
    const next = emptyLanceStrategy();
    const opcoes = Array.isArray(v.estrategia_lance?.opcoes) ? v.estrategia_lance.opcoes : [];

    opcoes.forEach((op: any) => {
      const chave = String(op?.chave || "");
      const tipo = String(op?.tipo || "").toLowerCase();
      let key = chave;
      if (!key) {
        if (tipo.includes("livre")) key = "livre";
        else if (tipo.includes("segundo")) key = "fixo2";
        else if (tipo.includes("fixo")) key = "fixo1";
      }
      if (!key || !(key in next)) return;
      next[key] = true;
      if (op?.percentual != null) next[key + "_pct"] = formatPct4(Number(op.percentual));
    });

    return next;
  };

  const toggleCeLanceStrategy = (key: string, config: any) => {
    setCeLanceStrategy((prev: any) => {
      if (config?.single) {
        const next = emptyLanceStrategy();
        const willSelect = !prev?.[key];
        return { ...next, [key]: willSelect, [key + "_pct"]: prev?.[key + "_pct"] || "" };
      }
      return { ...prev, [key]: !prev?.[key] };
    });
  };

  const buildCeLancePayload = (v: Venda) => {
    const config = lanceConfigForAdmin(v.administradora as string);
    const selected = (config?.options || []).filter((opt: any) => !!ceLanceStrategy?.[opt.key]);

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
        const raw = String(ceLanceStrategy?.[opt.key + "_pct"] || "").trim();
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

  const saveLanceStrategy = async () => {
    try {
      if (!isAdmin) throw new Error("Somente admin pode editar.");
      const v = cotaEditor.venda;
      if (!v) return;

      const estrategia_lance = buildCeLancePayload(v);
      await updateVenda(v.id, { estrategia_lance });
      await reloadEncarteiradas();
      closeCotaEditor();
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar estratégia de lance.");
    }
  };

  const openCotaEditor = (v: Venda) => {
`;
if (!src.includes('const hydrateLanceStrategyFromVenda =')) {
  if (!src.includes(helpersAnchor)) throw new Error('patch-carteira-edit-lance-strategy-v1: helpers anchor not found');
  src = src.replace(helpersAnchor, helpersInsert);
}

const openEditorAnchor = `    setCeInadFlag(!!v.inad);
    setCeInadEm(v.inad_em ?? "");
    setCeInadRev(v.inad_revertida_em ?? "");
  };
`;
const openEditorInsert = `    setCeInadFlag(!!v.inad);
    setCeInadEm(v.inad_em ?? "");
    setCeInadRev(v.inad_revertida_em ?? "");
    setCeLanceStrategy(hydrateLanceStrategyFromVenda(v));
  };
`;
if (!src.includes('setCeLanceStrategy(hydrateLanceStrategyFromVenda(v));')) {
  if (!src.includes(openEditorAnchor)) throw new Error('patch-carteira-edit-lance-strategy-v1: open editor anchor not found');
  src = src.replace(openEditorAnchor, openEditorInsert);
}

const pickAnchor = `                <button className="text-left border rounded-2xl p-4 hover:bg-gray-50" onClick={() => setCotaEditor((p) => ({ ...p, mode: "inad" }))}>
                  <div className="font-medium">⚠️ Inadimplência</div>
                  <div className="text-sm text-gray-600 mt-1">Marcar/desmarcar com data de início e data de reversão.</div>
                </button>
              </div>
            )}
`;
const pickInsert = `                <button className="text-left border rounded-2xl p-4 hover:bg-gray-50" onClick={() => setCotaEditor((p) => ({ ...p, mode: "inad" }))}>
                  <div className="font-medium">⚠️ Inadimplência</div>
                  <div className="text-sm text-gray-600 mt-1">Marcar/desmarcar com data de início e data de reversão.</div>
                </button>

                <button className="text-left border rounded-2xl p-4 hover:bg-gray-50" onClick={() => setCotaEditor((p) => ({ ...p, mode: "lance_strategy" }))}>
                  <div className="font-medium">🎯 Estratégia de lance</div>
                  <div className="text-sm text-gray-600 mt-1">Incluir ou alterar a estratégia que será usada para esta cota.</div>
                </button>
              </div>
            )}
`;
if (!src.includes('mode: "lance_strategy"')) {
  if (!src.includes(pickAnchor)) throw new Error('patch-carteira-edit-lance-strategy-v1: pick button anchor not found');
  src = src.replace(pickAnchor, pickInsert);
}

const uiAnchor = `            {cotaEditor.mode === "inad" && (
              <div className="space-y-4">
`;
const uiInsert = `            {cotaEditor.mode === "lance_strategy" &&
              (() => {
                const v = cotaEditor.venda!;
                const config = lanceConfigForAdmin(v.administradora as string);
                return (
                  <div className="space-y-4">
                    <div className="border rounded-2xl p-4 bg-gray-50">
                      <div className="font-medium">Estratégia de lance</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Administradora: <strong>{v.administradora || "—"}</strong>. {config.note}
                      </div>
                    </div>

                    {config.options.length === 0 ? (
                      <div className="border rounded-2xl p-4 bg-gray-50 text-sm text-gray-600">
                        {config.adm === "HS" ? "HS dispensado por ora." : "Esta administradora ainda não exige estratégia de lance."}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {config.options.map((opt: any) => {
                          const checked = !!ceLanceStrategy?.[opt.key];
                          return (
                            <div key={opt.key} className={"rounded-xl border p-3 " + (checked ? "bg-white border-[#1E293F]" : "bg-white/60")}>
                              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                <input type={config.single ? "radio" : "checkbox"} checked={checked} onChange={() => toggleCeLanceStrategy(opt.key, config)} />
                                {opt.label}
                              </label>
                              {opt.fixedPct && <div className="text-xs text-gray-500 mt-2">Percentual fixo: {formatPct4(opt.fixedPct)}%</div>}
                              {checked && opt.requiresPct && (
                                <div className="mt-2">
                                  <label className="text-xs text-gray-500">Percentual</label>
                                  <input
                                    className="w-full border rounded-lg px-2 py-1 text-sm"
                                    value={ceLanceStrategy?.[opt.key + "_pct"] || ""}
                                    onChange={(e) => setCeLanceStrategy((p: any) => ({ ...p, [opt.key + "_pct"]: e.target.value }))}
                                    placeholder="Ex.: 25,0000%"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <button className="px-4 py-2 rounded-xl border" onClick={() => setCotaEditor((p) => ({ ...p, mode: "pick" }))}>
                        Voltar
                      </button>
                      <button className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90" onClick={saveLanceStrategy}>
                        Salvar
                      </button>
                    </div>
                  </div>
                );
              })()}

            {cotaEditor.mode === "inad" && (
              <div className="space-y-4">
`;
if (!src.includes('cotaEditor.mode === "lance_strategy"')) {
  if (!src.includes(uiAnchor)) throw new Error('patch-carteira-edit-lance-strategy-v1: lance strategy UI anchor not found');
  src = src.replace(uiAnchor, uiInsert);
}

fs.writeFileSync(file, src);
console.log('patch-carteira-edit-lance-strategy-v1 applied');
