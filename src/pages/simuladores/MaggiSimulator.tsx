// src/pages/simuladores/MaggiSimulator.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Car,
  Home,
  Settings,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Copy,
  Calculator,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

type SegmentoMaggi = "automoveis" | "imoveis";
type ModalidadeLance = "livre" | "embutido" | "livre_embutido" | "fixo";

type MaggiGroup = {
  id: string;
  grupo: string;
  segmento: SegmentoMaggi;
  nome_grupo: string | null;
  perfil_grupo: string | null;
  observacoes: string | null;
  credito_min: number | null;
  credito_max: number | null;
  prazo_original: number | null;
  prazo_restante: number | null;
  taxa_adm_pct: number | null;
  fundo_reserva_pct: number | null;
  seguro_pct: number | null;
  permite_lance_livre: boolean | null;
  permite_lance_embutido: boolean | null;
  permite_lance_fixo: boolean | null;
  lance_embutido_max_pct: number | null;
  lance_fixo_pct: number | null;
  regra_pos_contemplacao: string | null;
  config: Record<string, any> | null;
  is_active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GroupForm = {
  grupo: string;
  segmento: SegmentoMaggi;
  nome_grupo: string;
  perfil_grupo: string;
  observacoes: string;
  credito_min: string;
  credito_max: string;
  prazo_original: string;
  prazo_restante: string;
  taxa_adm_pct: string;
  fundo_reserva_pct: string;
  seguro_pct: string;
  permite_lance_livre: boolean;
  permite_lance_embutido: boolean;
  permite_lance_fixo: boolean;
  lance_embutido_max_pct: string;
  lance_fixo_pct: string;
  regra_pos_contemplacao: string;
  is_active: boolean;
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

const segmentos = [
  { key: "automoveis" as const, label: "Automóveis", icon: Car },
  { key: "imoveis" as const, label: "Imóveis", icon: Home },
];

const modalidadeLabels: Record<ModalidadeLance, string> = {
  livre: "Lance livre",
  embutido: "Lance embutido",
  livre_embutido: "Livre + embutido",
  fixo: "Lance fixo",
};

function brMoney(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function parseMoney(value: string) {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

function formatMoneyInput(value: number) {
  return brMoney(value || 0);
}

function parsePercent(value: string) {
  const clean = (value || "")
    .replace(/\s|%/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(clean);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function formatPercentInput(decimal?: number | null) {
  return ((Number(decimal || 0) * 100).toFixed(4)).replace(".", ",");
}

function pctHuman(decimal?: number | null, digits = 4) {
  return `${((Number(decimal || 0)) * 100).toFixed(digits).replace(".", ",")}%`;
}

function numberFrom(value: string) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function defaultForm(segmento: SegmentoMaggi): GroupForm {
  return {
    grupo: "",
    segmento,
    nome_grupo: "",
    perfil_grupo: "",
    observacoes: "",
    credito_min: formatMoneyInput(0),
    credito_max: formatMoneyInput(0),
    prazo_original: "0",
    prazo_restante: "0",
    taxa_adm_pct: "20,0000",
    fundo_reserva_pct: "0,0000",
    seguro_pct: "0,0000",
    permite_lance_livre: true,
    permite_lance_embutido: true,
    permite_lance_fixo: false,
    lance_embutido_max_pct: "25,0000",
    lance_fixo_pct: "0,0000",
    regra_pos_contemplacao: "saldo_devedor_prazo_restante",
    is_active: true,
  };
}

function formFromGroup(g: MaggiGroup): GroupForm {
  return {
    grupo: g.grupo || "",
    segmento: g.segmento || "automoveis",
    nome_grupo: g.nome_grupo || "",
    perfil_grupo: g.perfil_grupo || "",
    observacoes: g.observacoes || "",
    credito_min: formatMoneyInput(Number(g.credito_min || 0)),
    credito_max: formatMoneyInput(Number(g.credito_max || 0)),
    prazo_original: String(g.prazo_original || 0),
    prazo_restante: String(g.prazo_restante || 0),
    taxa_adm_pct: formatPercentInput(g.taxa_adm_pct),
    fundo_reserva_pct: formatPercentInput(g.fundo_reserva_pct),
    seguro_pct: formatPercentInput(g.seguro_pct),
    permite_lance_livre: g.permite_lance_livre !== false,
    permite_lance_embutido: g.permite_lance_embutido !== false,
    permite_lance_fixo: g.permite_lance_fixo === true,
    lance_embutido_max_pct: formatPercentInput(g.lance_embutido_max_pct ?? 0.25),
    lance_fixo_pct: formatPercentInput(g.lance_fixo_pct ?? 0),
    regra_pos_contemplacao: g.regra_pos_contemplacao || "saldo_devedor_prazo_restante",
    is_active: g.is_active !== false,
  };
}

function normalizeGroupPayload(form: GroupForm) {
  return {
    grupo: form.grupo.trim(),
    segmento: form.segmento,
    nome_grupo: form.nome_grupo.trim() || null,
    perfil_grupo: form.perfil_grupo.trim() || null,
    observacoes: form.observacoes.trim() || null,
    credito_min: parseMoney(form.credito_min),
    credito_max: parseMoney(form.credito_max),
    prazo_original: numberFrom(form.prazo_original),
    prazo_restante: numberFrom(form.prazo_restante),
    taxa_adm_pct: parsePercent(form.taxa_adm_pct),
    fundo_reserva_pct: parsePercent(form.fundo_reserva_pct),
    seguro_pct: parsePercent(form.seguro_pct),
    permite_lance_livre: form.permite_lance_livre,
    permite_lance_embutido: form.permite_lance_embutido,
    permite_lance_fixo: form.permite_lance_fixo,
    lance_embutido_max_pct: parsePercent(form.lance_embutido_max_pct),
    lance_fixo_pct: parsePercent(form.lance_fixo_pct),
    regra_pos_contemplacao: form.regra_pos_contemplacao || "saldo_devedor_prazo_restante",
    is_active: form.is_active,
  };
}

function calcMaggi(input: {
  group: MaggiGroup | null;
  credito: number;
  modalidade: ModalidadeLance;
  lanceLivrePct: number;
  lanceEmbutidoPct: number;
  parcelaContemplacao: number;
}) {
  const { group, credito, modalidade, lanceLivrePct, lanceEmbutidoPct, parcelaContemplacao } = input;

  if (!group || !credito) return null;

  const taxaAdm = Number(group.taxa_adm_pct || 0);
  const fundoReserva = Number(group.fundo_reserva_pct || 0);
  const seguroPct = Number(group.seguro_pct || 0);
  const prazoOriginal = Math.max(1, Number(group.prazo_original || group.prazo_restante || 1));
  const prazoRestanteGrupo = Math.max(1, Number(group.prazo_restante || prazoOriginal));
  const parcelaContempl = Math.max(1, Number(parcelaContemplacao || 1));
  const prazoAposContemplacao = Math.max(1, prazoRestanteGrupo - parcelaContempl);

  const valorCategoria = credito * (1 + taxaAdm + fundoReserva);
  const seguroMensal = valorCategoria * seguroPct;
  const parcelaBase = valorCategoria / prazoOriginal;
  const parcelaAntes = parcelaBase + seguroMensal;
  const totalPagoAteContemplacao = parcelaBase * parcelaContempl;

  const lanceFixoPct = Number(group.lance_fixo_pct || 0);
  const embutidoMaxPct = Number(group.lance_embutido_max_pct ?? 0.25);

  let lanceLivreValor = 0;
  let lanceEmbutidoValor = 0;
  let lanceOfertadoValor = 0;

  if (modalidade === "livre") {
    lanceLivreValor = credito * Math.max(0, lanceLivrePct);
    lanceOfertadoValor = lanceLivreValor;
  }

  if (modalidade === "embutido") {
    lanceEmbutidoValor = credito * Math.min(Math.max(0, lanceEmbutidoPct), embutidoMaxPct);
    lanceOfertadoValor = lanceEmbutidoValor;
  }

  if (modalidade === "livre_embutido") {
    lanceLivreValor = credito * Math.max(0, lanceLivrePct);
    lanceEmbutidoValor = credito * Math.min(Math.max(0, lanceEmbutidoPct), embutidoMaxPct);
    lanceOfertadoValor = lanceLivreValor + lanceEmbutidoValor;
  }

  if (modalidade === "fixo") {
    lanceLivreValor = credito * Math.max(0, lanceFixoPct);
    lanceOfertadoValor = lanceLivreValor;
  }

  const creditoLiquido = Math.max(0, credito - lanceEmbutidoValor);
  const saldoDevedorProjetado = Math.max(0, valorCategoria - totalPagoAteContemplacao - lanceOfertadoValor);
  const parcelaApos = saldoDevedorProjetado / prazoAposContemplacao + seguroMensal;
  const percentualLanceTotal = credito > 0 ? lanceOfertadoValor / credito : 0;

  return {
    valorCategoria,
    parcelaAntes,
    totalPagoAteContemplacao,
    lanceLivreValor,
    lanceEmbutidoValor,
    lanceOfertadoValor,
    creditoLiquido,
    saldoDevedorProjetado,
    parcelaApos,
    prazoAposContemplacao,
    percentualLanceTotal,
  };
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border bg-white/80 p-4 shadow-sm backdrop-blur" style={{ borderColor: "rgba(30,41,63,.10)" }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-xl font-black" style={{ color: C.navy }}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "rgba(161,28,39,.10)", color: C.ruby }}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-black" style={{ color: C.navy }}>{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function ConfigGroupsOverlay({
  open,
  onClose,
  segmento,
  groups,
  onReload,
}: {
  open: boolean;
  onClose: () => void;
  segmento: SegmentoMaggi;
  groups: MaggiGroup[];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<MaggiGroup | null>(null);
  const [form, setForm] = useState<GroupForm>(() => defaultForm(segmento));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) setForm(formFromGroup(editing));
    else setForm(defaultForm(segmento));
  }, [open, editing, segmento]);

  if (!open) return null;

  function update<K extends keyof GroupForm>(key: K, value: GroupForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveGroup() {
    const payload = normalizeGroupPayload(form);

    if (!payload.grupo) {
      alert("Informe o número do grupo.");
      return;
    }

    setSaving(true);

    const result = editing
      ? await supabase.from("sim_maggi_groups").update(payload).eq("id", editing.id).select("*").single()
      : await supabase.from("sim_maggi_groups").insert(payload).select("*").single();

    setSaving(false);

    if (result.error) {
      alert(`Erro ao salvar grupo: ${result.error.message}`);
      return;
    }

    setEditing(null);
    setForm(defaultForm(segmento));
    await onReload();
  }

  async function deleteGroup(group: MaggiGroup) {
    if (!confirm(`Excluir o grupo ${group.grupo}?`)) return;

    setDeletingId(group.id);
    const { error } = await supabase.from("sim_maggi_groups").delete().eq("id", group.id);
    setDeletingId(null);

    if (error) {
      alert(`Erro ao excluir grupo: ${error.message}`);
      return;
    }

    if (editing?.id === group.id) setEditing(null);
    await onReload();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-black" style={{ color: C.navy }}>Configurar grupos Maggi</h2>
            <p className="text-sm text-slate-500">Cadastre regras específicas por grupo e segmento.</p>
          </div>
          <button className="rounded-2xl border p-2 hover:bg-slate-50" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-76px)] gap-0 overflow-y-auto lg:grid-cols-[1fr_1.25fr]">
          <div className="border-r p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold" style={{ color: C.navy }}>Grupos cadastrados</h3>
              <Button
                variant="secondary"
                className="h-9 rounded-2xl"
                onClick={() => {
                  setEditing(null);
                  setForm(defaultForm(segmento));
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Novo
              </Button>
            </div>

            <div className="space-y-2">
              {groups.map((g) => (
                <div key={g.id} className="rounded-2xl border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-black" style={{ color: C.navy }}>Grupo {g.grupo}</div>
                      <div className="text-xs text-slate-500">{g.nome_grupo || g.perfil_grupo || "Sem descrição"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {brMoney(Number(g.credito_min || 0))} a {brMoney(Number(g.credito_max || 0))}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button className="rounded-xl border p-2 hover:bg-slate-50" onClick={() => setEditing(g)} type="button">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="rounded-xl border p-2 hover:bg-red-50" onClick={() => deleteGroup(g)} type="button" disabled={deletingId === g.id}>
                        {deletingId === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {groups.length === 0 && (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                  Nenhum grupo cadastrado para este segmento.
                </div>
              )}
            </div>
          </div>

          <div className="p-5">
            <h3 className="mb-4 font-bold" style={{ color: C.navy }}>{editing ? `Editando grupo ${editing.grupo}` : "Novo grupo"}</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Segmento</Label>
                <select className="h-10 w-full rounded-md border px-3" value={form.segmento} onChange={(e) => update("segmento", e.target.value as SegmentoMaggi)}>
                  <option value="automoveis">Automóveis</option>
                  <option value="imoveis">Imóveis</option>
                </select>
              </div>

              <div>
                <Label>Grupo</Label>
                <Input value={form.grupo} onChange={(e) => update("grupo", e.target.value)} placeholder="Ex.: 2020" />
              </div>

              <div>
                <Label>Nome do grupo</Label>
                <Input value={form.nome_grupo} onChange={(e) => update("nome_grupo", e.target.value)} placeholder="Ex.: Imóvel Flex" />
              </div>

              <div>
                <Label>Perfil do grupo</Label>
                <Input value={form.perfil_grupo} onChange={(e) => update("perfil_grupo", e.target.value)} placeholder="Ex.: Bom para lance embutido" />
              </div>

              <div>
                <Label>Crédito mínimo</Label>
                <Input value={form.credito_min} inputMode="numeric" onChange={(e) => update("credito_min", formatMoneyInput(parseMoney(e.target.value)))} />
              </div>

              <div>
                <Label>Crédito máximo</Label>
                <Input value={form.credito_max} inputMode="numeric" onChange={(e) => update("credito_max", formatMoneyInput(parseMoney(e.target.value)))} />
              </div>

              <div>
                <Label>Prazo original</Label>
                <Input type="number" value={form.prazo_original} onChange={(e) => update("prazo_original", e.target.value)} />
              </div>

              <div>
                <Label>Prazo restante</Label>
                <Input type="number" value={form.prazo_restante} onChange={(e) => update("prazo_restante", e.target.value)} />
              </div>

              <div>
                <Label>Taxa de administração (%)</Label>
                <Input value={form.taxa_adm_pct} onChange={(e) => update("taxa_adm_pct", e.target.value)} />
              </div>

              <div>
                <Label>Fundo de reserva (%)</Label>
                <Input value={form.fundo_reserva_pct} onChange={(e) => update("fundo_reserva_pct", e.target.value)} />
              </div>

              <div>
                <Label>Seguro mensal (%)</Label>
                <Input value={form.seguro_pct} onChange={(e) => update("seguro_pct", e.target.value)} />
              </div>

              <div>
                <Label>Máx. lance embutido (%)</Label>
                <Input value={form.lance_embutido_max_pct} onChange={(e) => update("lance_embutido_max_pct", e.target.value)} />
              </div>

              <div>
                <Label>Lance fixo (%)</Label>
                <Input value={form.lance_fixo_pct} onChange={(e) => update("lance_fixo_pct", e.target.value)} />
              </div>

              <div>
                <Label>Regra pós-contemplação</Label>
                <select className="h-10 w-full rounded-md border px-3" value={form.regra_pos_contemplacao} onChange={(e) => update("regra_pos_contemplacao", e.target.value)}>
                  <option value="saldo_devedor_prazo_restante">Saldo devedor ÷ prazo restante</option>
                  <option value="mantem_parcela_reduz_prazo">Mantém parcela e reduz prazo</option>
                  <option value="custom">Customizada</option>
                </select>
              </div>

              <div className="md:col-span-2 grid gap-2 rounded-2xl border p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.permite_lance_livre} onChange={(e) => update("permite_lance_livre", e.target.checked)} />
                  Permite lance livre
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.permite_lance_embutido} onChange={(e) => update("permite_lance_embutido", e.target.checked)} />
                  Permite lance embutido
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.permite_lance_fixo} onChange={(e) => update("permite_lance_fixo", e.target.checked)} />
                  Permite lance fixo
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} />
                  Grupo ativo
                </label>
              </div>

              <div className="md:col-span-2">
                <Label>Observações internas</Label>
                <textarea
                  className="min-h-[88px] w-full rounded-md border p-3 text-sm"
                  value={form.observacoes}
                  onChange={(e) => update("observacoes", e.target.value)}
                  placeholder="Regras específicas, cuidados comerciais, perfil de contemplação..."
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="h-10 rounded-2xl" onClick={saveGroup} disabled={saving} style={{ background: C.ruby }}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar grupo
              </Button>
              <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => { setEditing(null); setForm(defaultForm(segmento)); }} disabled={saving}>
                Limpar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MaggiSimulator() {
  const [segmento, setSegmento] = useState<SegmentoMaggi>("automoveis");
  const [groups, setGroups] = useState<MaggiGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [credito, setCredito] = useState(0);
  const [modalidade, setModalidade] = useState<ModalidadeLance>("livre_embutido");
  const [lanceLivrePctInput, setLanceLivrePctInput] = useState("20,0000");
  const [lanceEmbutidoPctInput, setLanceEmbutidoPctInput] = useState("25,0000");
  const [parcelaContemplacao, setParcelaContemplacao] = useState(1);

  async function loadGroups() {
    setLoadingGroups(true);
    const { data, error } = await supabase
      .from("sim_maggi_groups")
      .select("*")
      .eq("is_active", true)
      .order("segmento", { ascending: true })
      .order("grupo", { ascending: true });

    if (error) {
      console.error("Erro ao carregar grupos Maggi:", error.message);
      setGroups([]);
    } else {
      setGroups((data ?? []) as MaggiGroup[]);
    }

    setLoadingGroups(false);
  }

  useEffect(() => {
    loadGroups();
  }, []);

  const filteredGroups = useMemo(() => groups.filter((g) => g.segmento === segmento), [groups, segmento]);
  const selectedGroup = useMemo(() => filteredGroups.find((g) => g.id === selectedGroupId) || null, [filteredGroups, selectedGroupId]);

  useEffect(() => {
    setSelectedGroupId("");
  }, [segmento]);

  const allowedModalidades = useMemo(() => {
    const g = selectedGroup;
    const list: ModalidadeLance[] = [];

    if (!g || g.permite_lance_livre !== false) list.push("livre");
    if (!g || g.permite_lance_embutido !== false) list.push("embutido");
    if (!g || (g.permite_lance_livre !== false && g.permite_lance_embutido !== false)) list.push("livre_embutido");
    if (g?.permite_lance_fixo === true) list.push("fixo");

    return list;
  }, [selectedGroup]);

  useEffect(() => {
    if (!allowedModalidades.includes(modalidade)) setModalidade(allowedModalidades[0] || "livre");
  }, [allowedModalidades, modalidade]);

  const result = useMemo(() => {
    return calcMaggi({
      group: selectedGroup,
      credito,
      modalidade,
      lanceLivrePct: parsePercent(lanceLivrePctInput),
      lanceEmbutidoPct: parsePercent(lanceEmbutidoPctInput),
      parcelaContemplacao,
    });
  }, [selectedGroup, credito, modalidade, lanceLivrePctInput, lanceEmbutidoPctInput, parcelaContemplacao]);

  const resumoTexto = useMemo(() => {
    if (!selectedGroup || !result) return "";

    return `🔥 Simulação Maggi - ${segmento === "automoveis" ? "Automóveis" : "Imóveis"}\n\nGrupo: ${selectedGroup.grupo}\nPerfil: ${selectedGroup.perfil_grupo || "—"}\nCrédito contratado: ${brMoney(credito)}\nModalidade de lance: ${modalidadeLabels[modalidade]}\nLance ofertado: ${brMoney(result.lanceOfertadoValor)} (${pctHuman(result.percentualLanceTotal)})\nLance embutido: ${brMoney(result.lanceEmbutidoValor)}\nLance próprio: ${brMoney(result.lanceLivreValor)}\nCrédito líquido estimado: ${brMoney(result.creditoLiquido)}\n\nParcela antes da contemplação: ${brMoney(result.parcelaAntes)}\nContemplação prevista: parcela ${parcelaContemplacao}\nParcela após contemplação: ${brMoney(result.parcelaApos)}\nPrazo estimado após contemplação: ${result.prazoAposContemplacao} meses\n\nObservação: simulação sujeita às regras do grupo e confirmação da administradora.`;
  }, [selectedGroup, result, segmento, credito, modalidade, parcelaContemplacao]);

  async function copiarResumo() {
    if (!resumoTexto) return;
    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[28px] border p-6 md:p-8 shadow-sm"
        style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.28)" }} />
        <div className="relative z-[1] flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Calculator className="h-3.5 w-3.5" /> Simulador Maggi
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight">Estratégia por grupo e modalidade de lance</h1>
            <p className="mt-3 text-sm md:text-base text-white/82">
              Escolha o segmento, selecione o grupo Maggi e configure a estratégia de lance para visualizar o resultado projetado.
            </p>
          </div>

          <Button className="h-11 rounded-2xl bg-white text-slate-900 hover:bg-white/90" onClick={() => setConfigOpen(true)}>
            <Settings className="mr-2 h-4 w-4" /> Configurar grupos
          </Button>
        </div>
      </section>

      <Card className="rounded-[28px] border bg-white/75 shadow-sm backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base" style={{ color: C.navy }}>Bem desejado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {segmentos.map((item) => {
              const Icon = item.icon;
              const active = segmento === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSegmento(item.key)}
                  className="h-24 rounded-2xl border flex flex-col items-center justify-center gap-2 transition hover:-translate-y-0.5"
                  style={{
                    borderColor: active ? C.ruby : "rgba(161,28,39,.55)",
                    background: active ? "rgba(161,28,39,.08)" : "#fff",
                    color: C.ruby,
                    boxShadow: active ? "0 10px 24px rgba(161,28,39,.16)" : "none",
                  }}
                >
                  <Icon className="h-8 w-8" />
                  <span className="text-xs font-black uppercase">{item.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_.95fr]">
        <Card className="rounded-[28px] border bg-white/75 shadow-sm backdrop-blur">
          <CardHeader>
            <SectionTitle icon={Settings} title="Configuração da simulação" subtitle="Selecione o grupo e defina crédito, modalidade e lance." />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Grupo Maggi</Label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={loadingGroups}
                >
                  <option value="">{loadingGroups ? "Carregando grupos..." : "Selecione o grupo"}</option>
                  {filteredGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      Grupo {g.grupo} {g.nome_grupo ? `• ${g.nome_grupo}` : ""}
                    </option>
                  ))}
                </select>
                {!loadingGroups && filteredGroups.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">Nenhum grupo ativo cadastrado para este segmento.</p>
                )}
              </div>

              <div>
                <Label>Valor do crédito</Label>
                <Input value={formatMoneyInput(credito)} inputMode="numeric" onChange={(e) => setCredito(parseMoney(e.target.value))} />
              </div>

              <div>
                <Label>Contemplação prevista na parcela</Label>
                <Input type="number" value={parcelaContemplacao} onChange={(e) => setParcelaContemplacao(Math.max(1, Number(e.target.value || 1)))} />
              </div>

              <div>
                <Label>Modalidade de lance</Label>
                <select className="h-10 w-full rounded-md border px-3" value={modalidade} onChange={(e) => setModalidade(e.target.value as ModalidadeLance)}>
                  {allowedModalidades.map((m) => (
                    <option key={m} value={m}>{modalidadeLabels[m]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(modalidade === "livre" || modalidade === "livre_embutido") && (
                <div>
                  <Label>Lance livre / próprio (%)</Label>
                  <Input value={lanceLivrePctInput} onChange={(e) => setLanceLivrePctInput(e.target.value)} />
                </div>
              )}

              {(modalidade === "embutido" || modalidade === "livre_embutido") && (
                <div>
                  <Label>Lance embutido (%)</Label>
                  <Input value={lanceEmbutidoPctInput} onChange={(e) => setLanceEmbutidoPctInput(e.target.value)} />
                  {selectedGroup && (
                    <p className="mt-1 text-xs text-slate-500">Máximo do grupo: {pctHuman(selectedGroup.lance_embutido_max_pct ?? 0.25)}</p>
                  )}
                </div>
              )}
            </div>

            {selectedGroup && (
              <div className="rounded-3xl border bg-slate-50/80 p-4 text-sm text-slate-600">
                <div className="font-black" style={{ color: C.navy }}>Grupo {selectedGroup.grupo}</div>
                <div className="mt-1">Perfil: {selectedGroup.perfil_grupo || "—"}</div>
                <div className="mt-1">Crédito permitido: {brMoney(Number(selectedGroup.credito_min || 0))} a {brMoney(Number(selectedGroup.credito_max || 0))}</div>
                <div className="mt-1">Taxa adm: {pctHuman(selectedGroup.taxa_adm_pct)} • Fundo reserva: {pctHuman(selectedGroup.fundo_reserva_pct)}</div>
                {selectedGroup.observacoes && <div className="mt-2 text-xs">Obs.: {selectedGroup.observacoes}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border bg-white/75 shadow-sm backdrop-blur">
          <CardHeader>
            <SectionTitle icon={TrendingUp} title="Resultado da simulação" subtitle="Cards calculados com base no perfil do grupo." />
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">
                Selecione um grupo e informe o valor do crédito para gerar a simulação.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard title="Crédito contratado" value={brMoney(credito)} />
                  <MetricCard title="Crédito líquido" value={brMoney(result.creditoLiquido)} hint="Após lance embutido, se houver." />
                  <MetricCard title="Lance ofertado" value={brMoney(result.lanceOfertadoValor)} hint={pctHuman(result.percentualLanceTotal)} />
                  <MetricCard title="Lance próprio" value={brMoney(result.lanceLivreValor)} />
                  <MetricCard title="Parcela antes" value={brMoney(result.parcelaAntes)} hint="Estimativa antes da contemplação." />
                  <MetricCard title="Parcela após" value={brMoney(result.parcelaApos)} hint={`${result.prazoAposContemplacao} meses estimados`} />
                </div>

                <div className="rounded-3xl border bg-slate-50/80 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-black" style={{ color: C.navy }}>
                    <ShieldCheck className="h-4 w-4" /> Inteligência comercial
                  </div>
                  <p className="mt-2">
                    {selectedGroup?.perfil_grupo || "Cadastre um perfil para este grupo no overlay de configuração."}
                  </p>
                  <p className="mt-1 text-xs">
                    Regra pós-contemplação: {selectedGroup?.regra_pos_contemplacao || "saldo_devedor_prazo_restante"}.
                  </p>
                </div>

                <Button variant="secondary" className="h-10 w-full rounded-2xl" onClick={copiarResumo}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar resumo para WhatsApp
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfigGroupsOverlay
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        segmento={segmento}
        groups={filteredGroups}
        onReload={loadGroups}
      />
    </div>
  );
}
