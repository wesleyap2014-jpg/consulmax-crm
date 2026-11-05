import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, Check, Layers, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";

export type EmbraconTableRow = {
  id: string;
  admin_id: string;
  segmento: string;
  nome_tabela: string;
  faixa_min: number;
  faixa_max: number;
  prazo_limite: number;
  taxa_adm_pct: number;
  fundo_reserva_pct: number;
  antecip_pct: number;
  antecip_parcelas: number;
  limitador_parcela_pct: number;
  seguro_prest_pct: number;
  permite_lance_embutido: boolean;
  permite_lance_fixo_25: boolean;
  permite_lance_fixo_50: boolean;
  permite_lance_livre: boolean;
  contrata_parcela_cheia: boolean;
  contrata_reduzida_25: boolean;
  contrata_reduzida_50: boolean;
  indice_correcao: string[];
  faixas_credito?: number[] | null;
  reajusta_cada_meses?: number | null;
  permite_sorteio?: boolean | null;
  permite_troca_chaves?: boolean | null;
  permite_fgts?: boolean | null;
};

type Prazo = Pick<
  EmbraconTableRow,
  | "prazo_limite"
  | "taxa_adm_pct"
  | "fundo_reserva_pct"
  | "antecip_pct"
  | "antecip_parcelas"
  | "contrata_parcela_cheia"
  | "contrata_reduzida_50"
  | "contrata_reduzida_25"
> & { id?: string };

const novaFaixa = (): Prazo => ({
  prazo_limite: 80,
  taxa_adm_pct: 0,
  fundo_reserva_pct: 0,
  antecip_pct: 0,
  antecip_parcelas: 0,
  contrata_parcela_cheia: true,
  contrata_reduzida_50: false,
  contrata_reduzida_25: false,
});

const money = (value: number) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value: number) =>
  (Number(value || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) + "%";
const norm = (value: string) =>
  String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function Option({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[#A11C27]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative mt-1">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.0001"
          className="pr-9"
          value={Number((Number(value || 0) * 100).toFixed(4))}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
        />
        <span className="absolute right-3 top-2.5 text-xs text-slate-500">%</span>
      </div>
    </div>
  );
}

function PrazoOverlay({
  original,
  onSave,
  onClose,
}: {
  original: Prazo;
  onSave: (prazo: Prazo) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Prazo>({ ...original });
  const set = <K extends keyof Prazo>(key: K, value: Prazo[K]) => setDraft((p) => ({ ...p, [key]: value }));

  function salvar() {
    if (!Number.isInteger(draft.prazo_limite) || draft.prazo_limite < 1 || draft.prazo_limite > 600) {
      alert("Informe um prazo válido, de 1 a 600 meses.");
      return;
    }
    if (![draft.taxa_adm_pct, draft.fundo_reserva_pct, draft.antecip_pct].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
      alert("As taxas devem ser percentuais entre 0% e 100%.");
      return;
    }
    if (!Number.isInteger(draft.antecip_parcelas) || draft.antecip_parcelas < 0 || draft.antecip_parcelas > 60) {
      alert("A antecipação deve estar entre 0 e 60 parcelas.");
      return;
    }
    if (!draft.contrata_parcela_cheia && !draft.contrata_reduzida_50 && !draft.contrata_reduzida_25) {
      alert("Marque ao menos uma forma de contratação.");
      return;
    }
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl md:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-[#1E293F]">Configurar prazo</h3>
            <p className="text-sm text-slate-500">Taxas e modalidades exclusivas deste prazo.</p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Prazo (meses)</Label>
            <Input className="mt-1" type="number" min="1" max="600" value={draft.prazo_limite} onChange={(e) => set("prazo_limite", Number(e.target.value))} />
          </div>
          <div>
            <Label>Parcelas de antecipação</Label>
            <Input className="mt-1" type="number" min="0" max="60" value={draft.antecip_parcelas} onChange={(e) => set("antecip_parcelas", Number(e.target.value))} />
          </div>
          <PercentField label="Taxa de administração" value={draft.taxa_adm_pct} onChange={(v) => set("taxa_adm_pct", v)} />
          <PercentField label="Fundo de reserva" value={draft.fundo_reserva_pct} onChange={(v) => set("fundo_reserva_pct", v)} />
          <PercentField label="% Antecipação" value={draft.antecip_pct} onChange={(v) => set("antecip_pct", v)} />
        </div>
        <div className="mt-5">
          <Label>Formas de contratação</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Option label="Parcela Cheia" checked={draft.contrata_parcela_cheia} onChange={(v) => set("contrata_parcela_cheia", v)} />
            <Option label="Parcela Reduzida 50%" checked={draft.contrata_reduzida_50} onChange={(v) => set("contrata_reduzida_50", v)} />
            <Option label="Parcela Reduzida 25%" checked={draft.contrata_reduzida_25} onChange={(v) => set("contrata_reduzida_25", v)} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} className="bg-[#A11C27] text-white hover:bg-[#8E1722]"><Check className="mr-2 h-4 w-4" /> Aplicar prazo</Button>
        </div>
      </div>
    </div>
  );
}

type Group = { segmento: string; nome: string; rows: EmbraconTableRow[] };

function Editor({
  adminId,
  rows,
  segmentos,
  onClose,
  onSaved,
}: {
  adminId: string;
  rows: EmbraconTableRow[];
  segmentos: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initial = rows[0];
  const [segmento, setSegmento] = useState(initial?.segmento || segmentos[0] || "");
  const [nome, setNome] = useState(initial?.nome_tabela || "");
  const [sorteio, setSorteio] = useState(initial?.permite_sorteio !== false);
  const [livre, setLivre] = useState(initial?.permite_lance_livre ?? true);
  const [fixo50, setFixo50] = useState(initial?.permite_lance_fixo_50 ?? true);
  const [fixo25, setFixo25] = useState(initial?.permite_lance_fixo_25 ?? true);
  const [embutido, setEmbutido] = useState(initial?.permite_lance_embutido ?? true);
  const [troca, setTroca] = useState(initial?.permite_troca_chaves ?? false);
  const [fgts, setFgts] = useState(initial?.permite_fgts ?? false);
  const [limitador, setLimitador] = useState(initial?.limitador_parcela_pct ?? 0);
  const [seguro, setSeguro] = useState(initial?.seguro_prest_pct ?? 0);
  const [indices, setIndices] = useState((initial?.indice_correcao || ["IPCA"]).join(", "));
  const [reajuste, setReajuste] = useState<string>(initial?.reajusta_cada_meses ? String(initial.reajusta_cada_meses) : "");
  const [creditos, setCreditos] = useState<number[]>([...(initial?.faixas_credito || [])].map(Number).sort((a, b) => a - b));
  const [novoCredito, setNovoCredito] = useState("");
  const [prazos, setPrazos] = useState<Prazo[]>(
    [...rows].sort((a, b) => a.prazo_limite - b.prazo_limite).map((r) => ({
      id: r.id,
      prazo_limite: Number(r.prazo_limite),
      taxa_adm_pct: Number(r.taxa_adm_pct),
      fundo_reserva_pct: Number(r.fundo_reserva_pct),
      antecip_pct: Number(r.antecip_pct),
      antecip_parcelas: Number(r.antecip_parcelas),
      contrata_parcela_cheia: r.contrata_parcela_cheia,
      contrata_reduzida_50: r.contrata_reduzida_50,
      contrata_reduzida_25: r.contrata_reduzida_25,
    }))
  );
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draftPrazo, setDraftPrazo] = useState<Prazo | null>(null);
  const [saving, setSaving] = useState(false);
  const legacyMin = rows.length ? Math.min(...rows.map((r) => Number(r.faixa_min))) : null;
  const legacyMax = rows.length ? Math.max(...rows.map((r) => Number(r.faixa_max))) : null;

  const addCredito = () => {
    const valor = Number(novoCredito.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      alert("Informe um crédito positivo, por exemplo 45000.");
      return;
    }
    setCreditos((prev) => Array.from(new Set([...prev, Math.round(valor * 100) / 100])).sort((a, b) => a - b));
    setNovoCredito("");
  };

  const abrirPrazo = (index: number | null) => {
    setEditIndex(index);
    setDraftPrazo(index === null ? novaFaixa() : { ...prazos[index] });
  };

  async function salvar() {
    if (!segmento || !nome.trim() || !segmentos.includes(segmento)) {
      alert("Escolha um segmento existente e informe o nome da tabela.");
      return;
    }
    if (!prazos.length || new Set(prazos.map((x) => x.prazo_limite)).size !== prazos.length) {
      alert("Cadastre prazos válidos e sem duplicidade.");
      return;
    }
    if (!rows.length && !creditos.length) {
      alert("Informe as faixas de crédito disponíveis antes de cadastrar a tabela.");
      return;
    }
    if (!indices.split(",").some((x) => x.trim())) {
      alert("Informe o índice de correção.");
      return;
    }
    if (reajuste !== "" && (!Number.isInteger(Number(reajuste)) || Number(reajuste) < 1)) {
      alert("Informe uma periodicidade válida, em meses.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("embracon_salvar_tabela_unificada", {
      p_admin_id: adminId,
      p_segmento: segmento,
      p_nome_tabela: nome.trim(),
      p_segmento_anterior: initial?.segmento || null,
      p_nome_anterior: initial?.nome_tabela || null,
      p_config: {
        permite_sorteio: sorteio,
        permite_lance_livre: livre,
        permite_lance_fixo_50: fixo50,
        permite_lance_fixo_25: fixo25,
        permite_lance_embutido: embutido,
        permite_troca_chaves: troca,
        permite_fgts: fgts,
        limitador_parcela_pct: limitador,
        seguro_prest_pct: seguro,
        reajusta_cada_meses: reajuste === "" ? null : Number(reajuste),
        faixas_credito: creditos,
        indices: indices.split(",").map((x) => x.trim()).filter(Boolean),
      },
      p_prazos: prazos,
    });
    if (error) {
      setSaving(false);
      alert("Não foi possível salvar a tabela. Nenhuma alteração parcial foi aplicada. " + error.message);
      return;
    }
    try {
      await onSaved();
      onClose();
    } catch (e) {
      alert("Tabela salva, mas não foi possível atualizar a lista. Atualize a página.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 md:p-6" role="dialog" aria-modal="true">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-[#1E293F]">{rows.length ? "Editar tabela" : "Nova tabela Embracon"}</h2>
            <p className="text-xs text-slate-500">Uma tabela comercial, vários prazos com configurações próprias.</p>
          </div>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-6 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Segmento</Label>
              <select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={segmento} onChange={(e) => setSegmento(e.target.value)}>
                {segmentos.map((seg) => <option value={seg} key={seg}>{seg}</option>)}
              </select>
            </div>
            <div>
              <Label>Nome da tabela</Label>
              <Input className="mt-1" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Automóvel Select Mais" />
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-bold text-[#1E293F]">Formas de Contemplação</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Option label="Sorteio" checked={sorteio} onChange={setSorteio} />
              <Option label="Lance Livre" checked={livre} onChange={setLivre} />
              <Option label="Lance Fixo de 50%" checked={fixo50} onChange={setFixo50} />
              <Option label="Lance Fixo de 25%" checked={fixo25} onChange={setFixo25} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-bold text-[#1E293F]">Pagamento do Lance</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <Option label="Lance Embutido (25%)" checked={embutido} onChange={setEmbutido} />
              <Option label="Troca de Chaves" checked={troca} onChange={setTroca} />
              <Option label="FGTS" checked={fgts} onChange={setFgts} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
              <div>
                <h3 className="font-bold text-[#1E293F]">Prazos</h3>
                <p className="text-xs text-slate-500">Cada prazo possui taxas, antecipação e formas de contratação independentes.</p>
              </div>
              <Button type="button" className="bg-[#A11C27] text-white hover:bg-[#8E1722]" onClick={() => abrirPrazo(null)}>
                <Plus className="mr-2 h-4 w-4" /> Add Prazo
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="p-3">Prazo</th><th className="p-3">Taxa Adm</th><th className="p-3">Fundo Reserva</th>
                    <th className="p-3">% Antecipação</th><th className="p-3">Parcelas Ant.</th>
                    <th className="p-3">Formas de contratação</th><th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {[...prazos].map((p) => {
                    const index = prazos.indexOf(p);
                    const formas = [
                      p.contrata_parcela_cheia ? "Cheia" : null,
                      p.contrata_reduzida_50 ? "Red. 50%" : null,
                      p.contrata_reduzida_25 ? "Red. 25%" : null,
                    ].filter(Boolean).join(" / ");
                    return (
                      <tr key={p.id || "draft-" + index} className="border-t">
                        <td className="p-3 font-bold">{p.prazo_limite} meses</td>
                        <td className="p-3">{percent(p.taxa_adm_pct)}</td>
                        <td className="p-3">{percent(p.fundo_reserva_pct)}</td>
                        <td className="p-3">{percent(p.antecip_pct)}</td>
                        <td className="p-3">{p.antecip_parcelas}</td>
                        <td className="p-3 text-xs">{formas}</td>
                        <td className="p-2">
                          <div className="flex justify-end gap-1">
                            <Button variant="secondary" size="sm" onClick={() => abrirPrazo(index)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="secondary" size="sm" onClick={() => {
                              if (!window.confirm("Remover este prazo? Se houver simulações, vendas ou comissões vinculadas, o banco impedirá a exclusão ao salvar.")) return;
                              setPrazos((prev) => prev.filter((_, i) => i !== index));
                            }}><Trash2 className="h-4 w-4 text-[#A11C27]" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!prazos.length && <tr><td className="p-5 text-center text-slate-500" colSpan={7}>Clique em + Add Prazo para começar.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PercentField label="Limitador da parcela" value={limitador} onChange={setLimitador} />
            <PercentField label="Seguro por parcela" value={seguro} onChange={setSeguro} />
            <div>
              <Label>Índice de correção</Label>
              <Input className="mt-1" value={indices} onChange={(e) => setIndices(e.target.value)} placeholder="IPCA, INCC" />
            </div>
            <div>
              <Label>Reajusta a cada (meses)</Label>
              <Input className="mt-1" type="number" min="1" placeholder="Ex.: 12" value={reajuste} onChange={(e) => setReajuste(e.target.value)} />
              {!reajuste && <p className="mt-1 text-xs text-amber-700">Ainda não configurado</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold text-[#1E293F]">Faixas de Crédito</h3>
            <p className="mt-1 text-xs text-slate-500">Adicione cada valor de crédito disponível, individualmente. Não é um intervalo livre.</p>
            <div className="mt-3 flex max-w-md items-end gap-2">
              <div className="flex-1">
                <Label>Crédito (R$)</Label>
                <Input type="number" min="0.01" step="0.01" placeholder="45000,00" value={novoCredito} onChange={(e) => setNovoCredito(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCredito(); } }} />
              </div>
              <Button type="button" variant="secondary" onClick={addCredito}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {creditos.map((credito) => (
                <span key={credito} className="inline-flex items-center gap-2 rounded-full border border-[#B5A573]/50 bg-[#B5A573]/10 px-3 py-1.5 text-sm font-semibold">
                  {money(credito)}
                  <button type="button" aria-label={"Remover " + money(credito)} onClick={() => setCreditos((list) => list.filter((n) => n !== credito))}><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              {!creditos.length && <span className="text-sm text-amber-700">Nenhum valor individual cadastrado.</span>}
            </div>
            {!creditos.length && legacyMin !== null && legacyMax !== null && (
              <p className="mt-2 text-xs text-slate-500">
                Faixa legada mantida temporariamente: {money(legacyMin)} a {money(legacyMax)}.
                Informe os valores exatos quando disponíveis; não serão inventados automaticamente.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t bg-white px-5 py-4">
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button className="bg-[#A11C27] text-white hover:bg-[#8E1722]" disabled={saving} onClick={salvar}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar Tabela
          </Button>
        </div>
      </div>
      {draftPrazo && (
        <PrazoOverlay
          original={draftPrazo}
          onClose={() => { setDraftPrazo(null); setEditIndex(null); }}
          onSave={(term) => {
            if (prazos.some((p, i) => i !== editIndex && p.prazo_limite === term.prazo_limite)) {
              alert("Já existe um prazo de " + term.prazo_limite + " meses nesta tabela.");
              return;
            }
            setPrazos((prev) => editIndex === null ? [...prev, term].sort((a, b) => a.prazo_limite - b.prazo_limite)
              : prev.map((p, i) => i === editIndex ? term : p).sort((a, b) => a.prazo_limite - b.prazo_limite));
            setDraftPrazo(null);
            setEditIndex(null);
          }}
        />
      )}
    </div>
  );
}

export default function EmbraconTableManager({
  admin,
  allTables,
  onClose,
  onChanged,
}: {
  admin: { id: string; name: string };
  allTables: EmbraconTableRow[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EmbraconTableRow[] | null>(null);
  const [page, setPage] = useState(1);
  const segments = useMemo(
    () => Array.from(new Set(allTables.map((r) => r.segmento))).sort((a, b) => norm(a).localeCompare(norm(b), "pt-BR")),
    [allTables]
  );
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    allTables.forEach((row) => {
      const key = JSON.stringify([row.segmento, row.nome_tabela]);
      const prev = map.get(key);
      if (prev) prev.rows.push(row);
      else map.set(key, { segmento: row.segmento, nome: row.nome_tabela, rows: [row] });
    });
    return [...map.values()]
      .filter((group) => norm(group.segmento + " " + group.nome).includes(norm(query)))
      .sort((a, b) => norm(a.segmento + a.nome).localeCompare(norm(b.segmento + b.nome), "pt-BR"));
  }, [allTables, query]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const shown = groups.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 md:p-6" role="dialog" aria-modal="true">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-black text-[#1E293F]">Configurar Tabelas Embracon</h2>
            <p className="text-sm text-slate-500">{groups.length} tabela(s) comercial(is), {allTables.length} prazo(s). Os registros antigos permanecem vinculados às suas simulações.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full max-w-sm items-center gap-2 rounded-lg border px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="h-10 w-full bg-transparent text-sm outline-none" placeholder="Buscar tabela ou segmento..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
            </div>
            <Button className="bg-[#A11C27] text-white hover:bg-[#8E1722]" onClick={() => setEditing([])} disabled={!segments.length}>
              <Plus className="mr-1 h-4 w-4" /> Nova Tabela
            </Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="p-3">Segmento</th><th className="p-3">Tabela</th><th className="p-3">Prazos</th><th className="p-3">Créditos</th><th className="p-3 text-right">Ações</th></tr>
              </thead>
              <tbody>
                {shown.map((group) => {
                  const credits = group.rows[0]?.faixas_credito;
                  return (
                    <tr className="border-t" key={JSON.stringify([group.segmento, group.nome])}>
                      <td className="p-3 font-medium text-slate-600">{group.segmento}</td>
                      <td className="p-3 font-bold text-[#1E293F]">{group.nome}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1.5">{[...group.rows].sort((a, b) => a.prazo_limite - b.prazo_limite).map((t) =>
                          <span className="rounded-full bg-[#A11C27]/10 px-2.5 py-1 text-xs font-semibold text-[#A11C27]" key={t.id}>{t.prazo_limite}m</span>
                        )}</div>
                      </td>
                      <td className="p-3 text-xs text-slate-600">{credits?.length ? String(credits.length) + " valores" : "Faixas pendentes"}</td>
                      <td className="p-3 text-right">
                        <Button variant="secondary" size="sm" onClick={() => setEditing([...group.rows])}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && <tr><td className="p-5 text-center text-slate-500" colSpan={5}>Nenhuma tabela encontrada.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Página {page} de {totalPages} · {groups.length} tabela(s)</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </div>
      </div>
      {editing !== null && (
        <Editor adminId={admin.id} rows={editing} segmentos={segments} onClose={() => setEditing(null)} onSaved={onChanged} />
      )}
    </div>
  );
}
