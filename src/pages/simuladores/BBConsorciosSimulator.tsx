// src/pages/simuladores/BBConsorciosSimulator.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  AlertTriangle,
  Building2,
  Calculator,
  Car,
  CheckCircle2,
  Copy,
  Home,
  Loader2,
  Pencil,
  Plus,
  Save,
  Settings,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

type SegmentoBB = "automoveis" | "imoveis" | "servicos" | "pesados";
type LanceStrategy = "livre" | "fixo_25" | "fixo_50";

type BBGroup = {
  id: string;
  grupo: string;
  segmento: SegmentoBB;
  nome_grupo: string | null;
  observacoes: string | null;
  credito_min: number | null;
  credito_max: number | null;
  prazo_min: number | null;
  prazo_max: number | null;
  taxa_adm_pct: number | null;
  fundo_reserva_pct: number | null;
  seguro_pct: number | null;
  permite_lance_livre: boolean | null;
  permite_lance_embutido: boolean | null;
  lance_embutido_max_pct: number | null;
  permite_fixo_25: boolean | null;
  permite_fixo_50: boolean | null;
  is_active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BBGroupForm = {
  grupo: string;
  segmento: SegmentoBB;
  nome_grupo: string;
  observacoes: string;
  credito_min: string;
  credito_max: string;
  prazo_min: string;
  prazo_max: string;
  taxa_adm_pct: string;
  fundo_reserva_pct: string;
  seguro_pct: string;
  permite_lance_livre: boolean;
  permite_lance_embutido: boolean;
  lance_embutido_max_pct: string;
  permite_fixo_25: boolean;
  permite_fixo_50: boolean;
  is_active: boolean;
};

type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  owner_id: string | null;
};

type LoggedUserProfile = {
  id: string;
  auth_user_id?: string | null;
  nome?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  telefone?: string | null;
  role?: string | null;
  user_role?: string | null;
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
  { key: "servicos" as const, label: "Serviços", icon: Wrench },
  { key: "pesados" as const, label: "Pesados", icon: Building2 },
];

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

function pctHuman(decimal?: number | null, digits = 2) {
  return `${(Number(decimal || 0) * 100).toFixed(digits).replace(".", ",")}%`;
}

function numberFrom(value: string) {
  const clean = String(value || "").replace(/\D/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getUserName(user?: LoggedUserProfile | null) {
  return String(user?.nome || user?.name || user?.email || "Consultor");
}

function getUserPhone(user?: LoggedUserProfile | null) {
  return onlyDigits(user?.phone || user?.telefone || "");
}

function buildWhatsappLink(user?: LoggedUserProfile | null) {
  const phone = getUserPhone(user);
  return phone ? `https://wa.me/${phone}` : "";
}

function defaultForm(segmento: SegmentoBB): BBGroupForm {
  return {
    grupo: "",
    segmento,
    nome_grupo: "",
    observacoes: "",
    credito_min: formatMoneyInput(0),
    credito_max: formatMoneyInput(0),
    prazo_min: "1",
    prazo_max: "80",
    taxa_adm_pct: "0,0000",
    fundo_reserva_pct: "0,0000",
    seguro_pct: "0,0000",
    permite_lance_livre: true,
    permite_lance_embutido: true,
    lance_embutido_max_pct: "25,0000",
    permite_fixo_25: true,
    permite_fixo_50: true,
    is_active: true,
  };
}

function formFromGroup(group: BBGroup): BBGroupForm {
  return {
    grupo: group.grupo || "",
    segmento: group.segmento || "automoveis",
    nome_grupo: group.nome_grupo || "",
    observacoes: group.observacoes || "",
    credito_min: formatMoneyInput(Number(group.credito_min || 0)),
    credito_max: formatMoneyInput(Number(group.credito_max || 0)),
    prazo_min: String(group.prazo_min || 1),
    prazo_max: String(group.prazo_max || 80),
    taxa_adm_pct: formatPercentInput(group.taxa_adm_pct),
    fundo_reserva_pct: formatPercentInput(group.fundo_reserva_pct),
    seguro_pct: formatPercentInput(group.seguro_pct),
    permite_lance_livre: group.permite_lance_livre !== false,
    permite_lance_embutido: group.permite_lance_embutido !== false,
    lance_embutido_max_pct: formatPercentInput(group.lance_embutido_max_pct ?? 0.25),
    permite_fixo_25: group.permite_fixo_25 !== false,
    permite_fixo_50: group.permite_fixo_50 !== false,
    is_active: group.is_active !== false,
  };
}

function payloadFromForm(form: BBGroupForm) {
  return {
    grupo: form.grupo.trim(),
    segmento: form.segmento,
    nome_grupo: form.nome_grupo.trim() || null,
    observacoes: form.observacoes.trim() || null,
    credito_min: parseMoney(form.credito_min),
    credito_max: parseMoney(form.credito_max),
    prazo_min: Math.max(1, numberFrom(form.prazo_min)),
    prazo_max: Math.max(1, numberFrom(form.prazo_max)),
    taxa_adm_pct: parsePercent(form.taxa_adm_pct),
    fundo_reserva_pct: parsePercent(form.fundo_reserva_pct),
    seguro_pct: parsePercent(form.seguro_pct),
    permite_lance_livre: form.permite_lance_livre,
    permite_lance_embutido: form.permite_lance_embutido,
    lance_embutido_max_pct: parsePercent(form.lance_embutido_max_pct),
    permite_fixo_25: form.permite_fixo_25,
    permite_fixo_50: form.permite_fixo_50,
    is_active: form.is_active,
  };
}

function strategyLabel(strategy: LanceStrategy) {
  if (strategy === "fixo_25") return "Fixo 25%";
  if (strategy === "fixo_50") return "Fixo 50%";
  return "Livre";
}

function calcBB(input: {
  group: BBGroup | null;
  credito: number;
  prazo: number;
  parcelaContemplacao: number;
  strategy: LanceStrategy;
  lanceLivrePct: number;
  usarEmbutido: boolean;
  lanceEmbutidoPct: number;
}) {
  const {
    group,
    credito,
    prazo,
    parcelaContemplacao,
    strategy,
    lanceLivrePct,
    usarEmbutido,
    lanceEmbutidoPct,
  } = input;

  if (!group) return { result: null as any, error: "Selecione um grupo/tabela BB." };
  if (!credito) return { result: null as any, error: "Informe o crédito desejado." };

  const min = Number(group.credito_min || 0);
  const max = Number(group.credito_max || 0);

  if (min > 0 && credito < min) {
    return { result: null as any, error: `Crédito abaixo da faixa mínima deste grupo: ${brMoney(min)}.` };
  }

  if (max > 0 && credito > max) {
    return { result: null as any, error: `Crédito acima da faixa máxima deste grupo: ${brMoney(max)}.` };
  }

  const prazoMin = Number(group.prazo_min || 1);
  const prazoMax = Number(group.prazo_max || prazo || 1);
  const prazoFinalInput = clamp(Math.max(1, prazo), prazoMin, prazoMax);

  const taxaAdm = Number(group.taxa_adm_pct || 0);
  const fundoReserva = Number(group.fundo_reserva_pct || 0);
  const seguroPct = Number(group.seguro_pct || 0);
  const maxEmbutidoPct = Number(group.lance_embutido_max_pct || 0);

  const valorCategoria = credito * (1 + taxaAdm + fundoReserva);
  const parcelaBase = valorCategoria / prazoFinalInput;
  const seguroMensal = valorCategoria * seguroPct;
  const parcelaAntes = parcelaBase + seguroMensal;

  const parcelaContempl = clamp(Math.max(1, parcelaContemplacao), 1, prazoFinalInput);
  const prazoRestanteAposContemplacao = Math.max(1, prazoFinalInput - parcelaContempl);
  const totalPagoAteContemplacao = parcelaBase * parcelaContempl;

  let lancePct = lanceLivrePct;

  if (strategy === "fixo_25") lancePct = 0.25;
  if (strategy === "fixo_50") lancePct = 0.5;

  if (strategy === "livre" && group.permite_lance_livre === false) {
    return { result: null as any, error: "Este grupo não permite lance livre." };
  }

  if (strategy === "fixo_25" && group.permite_fixo_25 === false) {
    return { result: null as any, error: "Este grupo não permite lance fixo de 25%." };
  }

  if (strategy === "fixo_50" && group.permite_fixo_50 === false) {
    return { result: null as any, error: "Este grupo não permite lance fixo de 50%." };
  }

  const lanceOfertadoValor = valorCategoria * Math.max(0, lancePct);

  let embutidoPctFinal = 0;
  if (usarEmbutido) {
    if (group.permite_lance_embutido === false) {
      return { result: null as any, error: "Este grupo não permite lance embutido." };
    }

    embutidoPctFinal = Math.max(0, lanceEmbutidoPct);

    if (maxEmbutidoPct > 0 && embutidoPctFinal > maxEmbutidoPct) {
      return {
        result: null as any,
        error: `Lance embutido acima do máximo permitido (${pctHuman(maxEmbutidoPct)}).`,
      };
    }
  }

  const lanceEmbutidoValor = valorCategoria * embutidoPctFinal;

  if (lanceEmbutidoValor > lanceOfertadoValor + 0.01) {
    return {
      result: null as any,
      error: "O lance embutido não pode ser maior que o lance ofertado.",
    };
  }

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const creditoLiquido = Math.max(0, credito - lanceEmbutidoValor);

  const saldoAposPagamentos = Math.max(0, valorCategoria - totalPagoAteContemplacao);
  const saldoAposLance = Math.max(0, saldoAposPagamentos - lanceOfertadoValor);
  const parcelaApos = saldoAposLance / prazoRestanteAposContemplacao + seguroMensal;

  const investimentoAteContemplacao = parcelaAntes * parcelaContempl + lanceProprioValor;

  return {
    result: {
      credito,
      creditoLiquido,
      prazo: prazoFinalInput,
      taxaAdm,
      fundoReserva,
      seguroPct,
      valorCategoria,
      parcelaAntes,
      parcelaApos,
      parcelaBase,
      seguroMensal,
      parcelaContemplacao: parcelaContempl,
      prazoRestanteAposContemplacao,
      lancePct,
      lanceOfertadoValor,
      lanceEmbutidoValor,
      lanceProprioValor,
      saldoAposLance,
      investimentoAteContemplacao,
    },
    error: "",
  };
}

function sqlForSetup() {
  return `create table if not exists public.sim_bb_groups (
  id uuid primary key default uuid_generate_v4(),
  grupo text not null,
  segmento text not null,
  nome_grupo text,
  observacoes text,
  credito_min numeric,
  credito_max numeric,
  prazo_min int,
  prazo_max int,
  taxa_adm_pct numeric,
  fundo_reserva_pct numeric,
  seguro_pct numeric,
  permite_lance_livre boolean default true,
  permite_lance_embutido boolean default true,
  lance_embutido_max_pct numeric default 0.25,
  permite_fixo_25 boolean default true,
  permite_fixo_50 boolean default true,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists sim_bb_groups_segmento_idx
on public.sim_bb_groups(segmento);

create index if not exists sim_bb_groups_active_idx
on public.sim_bb_groups(is_active);`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[22px] border bg-white/75 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black" style={{ color: C.navy }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function ConfigOverlay({
  open,
  onClose,
  initialSegmento,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialSegmento: SegmentoBB;
  editing: BBGroup | null;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<BBGroupForm>(() => defaultForm(initialSegmento));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(editing ? formFromGroup(editing) : defaultForm(initialSegmento));
  }, [open, editing, initialSegmento]);

  if (!open) return null;

  async function save() {
    setError(null);
    const payload = payloadFromForm(form);

    if (!payload.grupo) {
      setError("Informe o grupo/código da tabela.");
      return;
    }

    if (!payload.credito_min || !payload.credito_max) {
      setError("Informe as faixas mínima e máxima de crédito.");
      return;
    }

    if (payload.prazo_max < payload.prazo_min) {
      setError("O prazo máximo não pode ser menor que o prazo mínimo.");
      return;
    }

    setSaving(true);

    const req = editing?.id
      ? supabase.from("sim_bb_groups").update(payload as any).eq("id", editing.id)
      : supabase.from("sim_bb_groups").insert(payload as any);

    const { error: saveErr } = await req;
    setSaving(false);

    if (saveErr) {
      setError(saveErr.message);
      return;
    }

    await onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] border bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 p-4 backdrop-blur">
          <div>
            <div className="text-lg font-black" style={{ color: C.navy }}>
              {editing ? "Editar grupo BB" : "Cadastrar grupo BB"}
            </div>
            <div className="text-xs text-slate-500">Configure faixa, prazo, taxas e lances permitidos.</div>
          </div>
          <Button variant="secondary" className="rounded-2xl" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <Label>Segmento</Label>
            <select
              className="h-10 w-full rounded-md border px-3"
              value={form.segmento}
              onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value as SegmentoBB }))}
            >
              {segmentos.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Grupo / Código</Label>
            <Input value={form.grupo} onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value }))} placeholder="Ex.: BB Auto 80" />
          </div>

          <div className="md:col-span-2">
            <Label>Nome comercial</Label>
            <Input value={form.nome_grupo} onChange={(e) => setForm((f) => ({ ...f, nome_grupo: e.target.value }))} placeholder="Ex.: BB Consórcio Auto" />
          </div>

          <div>
            <Label>Crédito mínimo</Label>
            <Input value={form.credito_min} onChange={(e) => setForm((f) => ({ ...f, credito_min: formatMoneyInput(parseMoney(e.target.value)) }))} />
          </div>

          <div>
            <Label>Crédito máximo</Label>
            <Input value={form.credito_max} onChange={(e) => setForm((f) => ({ ...f, credito_max: formatMoneyInput(parseMoney(e.target.value)) }))} />
          </div>

          <div>
            <Label>Prazo mínimo</Label>
            <Input value={form.prazo_min} onChange={(e) => setForm((f) => ({ ...f, prazo_min: e.target.value }))} />
          </div>

          <div>
            <Label>Prazo máximo</Label>
            <Input value={form.prazo_max} onChange={(e) => setForm((f) => ({ ...f, prazo_max: e.target.value }))} />
          </div>

          <div>
            <Label>Taxa de administração total (%)</Label>
            <Input value={form.taxa_adm_pct} onChange={(e) => setForm((f) => ({ ...f, taxa_adm_pct: e.target.value }))} placeholder="Ex.: 18,0000" />
          </div>

          <div>
            <Label>Fundo de reserva total (%)</Label>
            <Input value={form.fundo_reserva_pct} onChange={(e) => setForm((f) => ({ ...f, fundo_reserva_pct: e.target.value }))} placeholder="Ex.: 2,0000" />
          </div>

          <div>
            <Label>Seguro mensal sobre categoria (%)</Label>
            <Input value={form.seguro_pct} onChange={(e) => setForm((f) => ({ ...f, seguro_pct: e.target.value }))} placeholder="Ex.: 0,0000" />
          </div>

          <div>
            <Label>Máximo de lance embutido (%)</Label>
            <Input value={form.lance_embutido_max_pct} onChange={(e) => setForm((f) => ({ ...f, lance_embutido_max_pct: e.target.value }))} placeholder="Ex.: 25,0000" />
          </div>

          <div className="md:col-span-2 grid gap-3 rounded-2xl border bg-slate-50/70 p-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.permite_lance_livre} onChange={(e) => setForm((f) => ({ ...f, permite_lance_livre: e.target.checked }))} />
              Permite lance livre
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.permite_lance_embutido} onChange={(e) => setForm((f) => ({ ...f, permite_lance_embutido: e.target.checked }))} />
              Permite lance embutido
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.permite_fixo_25} onChange={(e) => setForm((f) => ({ ...f, permite_fixo_25: e.target.checked }))} />
              Permite fixo 25%
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.permite_fixo_50} onChange={(e) => setForm((f) => ({ ...f, permite_fixo_50: e.target.checked }))} />
              Permite fixo 50%
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Grupo ativo
            </label>
          </div>

          <div className="md:col-span-2">
            <Label>Observações</Label>
            <textarea
              className="min-h-[90px] w-full rounded-md border px-3 py-2 text-sm"
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            />
          </div>

          {error && <div className="md:col-span-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="md:col-span-2 flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving} className="rounded-2xl">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar grupo
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={saving} className="rounded-2xl">Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BBConsorciosSimulator() {
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userProfile, setUserProfile] = useState<LoggedUserProfile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState<string>("");
  const [leadSearch, setLeadSearch] = useState("");

  const [groups, setGroups] = useState<BBGroup[]>([]);
  const [segmento, setSegmento] = useState<SegmentoBB>("automoveis");
  const [groupId, setGroupId] = useState<string>("");
  const [creditoInput, setCreditoInput] = useState(formatMoneyInput(0));
  const [prazoInput, setPrazoInput] = useState("80");
  const [parcelaContemplacaoInput, setParcelaContemplacaoInput] = useState("12");
  const [strategy, setStrategy] = useState<LanceStrategy>("livre");
  const [lanceLivrePct, setLanceLivrePct] = useState("30,0000");
  const [usarEmbutido, setUsarEmbutido] = useState(true);
  const [lanceEmbutidoPct, setLanceEmbutidoPct] = useState("25,0000");

  const [configOpen, setConfigOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BBGroup | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setTableMissing(false);

    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData?.user?.id ?? null;

    if (authUserId) {
      const { data: me } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,email,phone,telefone,role,user_role")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      setUserProfile((me as LoggedUserProfile) || null);
      const role = String((me as any)?.role || (me as any)?.user_role || "").toLowerCase();
      setIsAdmin(role === "admin");
    }

    const leadsReq = await supabase
      .from("leads")
      .select("id,nome,telefone,email,owner_id")
      .order("created_at", { ascending: false })
      .limit(300);

    setLeads((leadsReq.data ?? []) as Lead[]);

    const { data, error } = await supabase
      .from("sim_bb_groups")
      .select("*")
      .order("segmento", { ascending: true })
      .order("grupo", { ascending: true });

    if (error) {
      if (String(error.message || "").toLowerCase().includes("does not exist")) {
        setTableMissing(true);
      }
      setGroups([]);
    } else {
      setGroups((data ?? []) as BBGroup[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const activeGroups = useMemo(() => groups.filter((g) => g.is_active !== false), [groups]);

  const segmentGroups = useMemo(
    () => activeGroups.filter((g) => g.segmento === segmento),
    [activeGroups, segmento]
  );

  useEffect(() => {
    if (!segmentGroups.length) {
      setGroupId("");
      return;
    }

    if (!segmentGroups.some((g) => g.id === groupId)) {
      setGroupId(segmentGroups[0].id);
    }
  }, [segmentGroups, groupId]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === groupId) || null,
    [groups, groupId]
  );

  const selectedLead = useMemo(() => leads.find((l) => l.id === leadId) || null, [leads, leadId]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads.slice(0, 20);
    return leads
      .filter((l) => `${l.nome || ""} ${l.telefone || ""} ${l.email || ""}`.toLowerCase().includes(q))
      .slice(0, 25);
  }, [leads, leadSearch]);

  const credito = parseMoney(creditoInput);
  const prazo = numberFrom(prazoInput);
  const parcelaContemplacao = numberFrom(parcelaContemplacaoInput);
  const calculation = calcBB({
    group: selectedGroup,
    credito,
    prazo,
    parcelaContemplacao,
    strategy,
    lanceLivrePct: parsePercent(lanceLivrePct),
    usarEmbutido,
    lanceEmbutidoPct: parsePercent(lanceEmbutidoPct),
  });
  const result = calculation.result;

  const resumoTexto = useMemo(() => {
    if (!result || !selectedGroup) return "";

    const leadLine = selectedLead ? `Cliente: ${selectedLead.nome}\n` : "";
    const consultorLine = `Consultor: ${getUserName(userProfile)}\n`;

    return `${leadLine}${consultorLine}\n*Simulação BB Consórcios*\n\nAdministradora: BB Consórcios\nGrupo/Tabela: ${selectedGroup.nome_grupo || selectedGroup.grupo}\nSegmento: ${segmentos.find((s) => s.key === selectedGroup.segmento)?.label || selectedGroup.segmento}\nCrédito contratado: ${brMoney(result.credito)}\nPrazo: ${result.prazo} meses\n\n*Parcelas*\nParcela antes da contemplação: ${brMoney(result.parcelaAntes)}\nParcela estimada após contemplação: ${brMoney(result.parcelaApos)}\n\n*Lance*\nEstratégia: ${strategyLabel(strategy)}\nLance ofertado: ${pctHuman(result.lancePct)} = ${brMoney(result.lanceOfertadoValor)}\nLance embutido: ${brMoney(result.lanceEmbutidoValor)}\nLance próprio: ${brMoney(result.lanceProprioValor)}\nCrédito líquido estimado: ${brMoney(result.creditoLiquido)}\n\nInvestimento até a contemplação: ${brMoney(result.investimentoAteContemplacao)}\nSaldo devedor estimado após lance: ${brMoney(result.saldoAposLance)}\n\nSimulação estimativa sujeita às regras vigentes da administradora e confirmação da tabela.`;
  }, [result, selectedGroup, selectedLead, userProfile, strategy]);

  async function copyResumo() {
    if (!resumoTexto) return;
    await navigator.clipboard.writeText(resumoTexto);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function deleteGroup(group: BBGroup) {
    const ok = window.confirm(`Excluir o grupo ${group.grupo}?`);
    if (!ok) return;

    const { error } = await supabase.from("sim_bb_groups").delete().eq("id", group.id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simulador BB Consórcios...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[28px] border p-6 md:p-8 shadow-sm"
        style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.28)" }} />
        <div className="relative z-[1] flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Calculator className="h-3.5 w-3.5" /> Simulador BB Consórcios
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight">Configure a estratégia de crédito e lance</h1>
            <p className="mt-3 text-sm md:text-base text-white/82">
              Simulação parametrizada por grupo/tabela, faixa de crédito, prazo, taxas e modalidades de lance permitidas.
            </p>
          </div>

          {isAdmin && (
            <Button
              type="button"
              onClick={() => {
                setEditingGroup(null);
                setConfigOpen(true);
              }}
              className="h-11 shrink-0 rounded-2xl bg-white px-4 font-semibold text-slate-900 hover:bg-white/90"
            >
              <Settings className="mr-2 h-4 w-4" /> Configurar grupos
            </Button>
          )}
        </div>
      </section>

      {tableMissing && (
        <Card className="rounded-[28px] border border-amber-200 bg-amber-50/80 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 font-bold text-amber-800">
              <AlertTriangle className="h-5 w-5" /> Tabela sim_bb_groups ainda não existe
            </div>
            <p className="text-sm text-amber-800">Rode este SQL no Supabase para habilitar o simulador BB:</p>
            <pre className="max-h-[320px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-white">{sqlForSetup()}</pre>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
        <div className="space-y-4">
          <Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                <UserRound className="h-5 w-5" /> Cliente e segmento
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Buscar lead</Label>
                <Input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="Digite nome, telefone ou e-mail" />
                <div className="mt-2 max-h-44 overflow-auto rounded-2xl border bg-white">
                  <button
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-sm ${!leadId ? "bg-slate-100 font-semibold" : ""}`}
                    onClick={() => setLeadId("")}
                  >
                    Sem lead vinculado
                  </button>
                  {filteredLeads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${leadId === lead.id ? "bg-slate-100 font-semibold" : ""}`}
                      onClick={() => setLeadId(lead.id)}
                    >
                      {lead.nome} <span className="text-xs text-slate-500">{lead.telefone || lead.email || ""}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 grid gap-3 md:grid-cols-4">
                {segmentos.map((s) => {
                  const Icon = s.icon;
                  const active = segmento === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSegmento(s.key)}
                      className="rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{ borderColor: active ? C.ruby : "rgba(30,41,63,.12)", background: active ? "rgba(161,28,39,.08)" : "white" }}
                    >
                      <Icon className="mb-2 h-5 w-5" style={{ color: active ? C.ruby : C.navy }} />
                      <div className="text-sm font-black" style={{ color: C.navy }}>{s.label}</div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                <Building2 className="h-5 w-5" /> Tabela e plano
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Grupo/Tabela BB</Label>
                <select className="h-10 w-full rounded-md border px-3" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  {!segmentGroups.length && <option value="">Nenhum grupo cadastrado para este segmento</option>}
                  {segmentGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome_grupo || g.grupo} • {brMoney(Number(g.credito_min || 0))} a {brMoney(Number(g.credito_max || 0))} • {g.prazo_min || 1}-{g.prazo_max || 0} meses
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Crédito contratado</Label>
                <Input value={creditoInput} onChange={(e) => setCreditoInput(formatMoneyInput(parseMoney(e.target.value)))} />
              </div>
              <div>
                <Label>Prazo</Label>
                <Input value={prazoInput} onChange={(e) => setPrazoInput(e.target.value)} />
              </div>
              <div>
                <Label>Contemplação estimada na parcela</Label>
                <Input value={parcelaContemplacaoInput} onChange={(e) => setParcelaContemplacaoInput(e.target.value)} />
              </div>
              <div>
                <Label>Estratégia de lance</Label>
                <select className="h-10 w-full rounded-md border px-3" value={strategy} onChange={(e) => setStrategy(e.target.value as LanceStrategy)}>
                  <option value="livre">Lance livre</option>
                  <option value="fixo_25">Fixo 25%</option>
                  <option value="fixo_50">Fixo 50%</option>
                </select>
              </div>

              {strategy === "livre" && (
                <div>
                  <Label>Percentual do lance livre</Label>
                  <Input value={lanceLivrePct} onChange={(e) => setLanceLivrePct(e.target.value)} placeholder="Ex.: 30,0000" />
                </div>
              )}

              <div className="rounded-2xl border bg-slate-50/70 p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={usarEmbutido} onChange={(e) => setUsarEmbutido(e.target.checked)} />
                  Usar lance embutido
                </label>
              </div>

              {usarEmbutido && (
                <div>
                  <Label>Percentual do lance embutido</Label>
                  <Input value={lanceEmbutidoPct} onChange={(e) => setLanceEmbutidoPct(e.target.value)} placeholder="Ex.: 25,0000" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {calculation.error && (
            <Card className="rounded-[28px] border border-red-200 bg-red-50/80 shadow-sm">
              <CardContent className="flex items-center gap-2 p-4 text-sm font-semibold text-red-700">
                <AlertTriangle className="h-5 w-5" /> {calculation.error}
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Metric label="Crédito contratado" value={brMoney(result.credito)} hint={`Líquido estimado: ${brMoney(result.creditoLiquido)}`} />
                <Metric label="Parcela antes" value={brMoney(result.parcelaAntes)} hint={`Seguro mensal: ${brMoney(result.seguroMensal)}`} />
                <Metric label="Lance ofertado" value={brMoney(result.lanceOfertadoValor)} hint={`${strategyLabel(strategy)} • ${pctHuman(result.lancePct)}`} />
                <Metric label="Lance próprio" value={brMoney(result.lanceProprioValor)} hint={`Embutido: ${brMoney(result.lanceEmbutidoValor)}`} />
                <Metric label="Parcela pós-contemplação" value={brMoney(result.parcelaApos)} hint={`${result.prazoRestanteAposContemplacao} parcelas restantes`} />
                <Metric label="Investimento até contemplação" value={brMoney(result.investimentoAteContemplacao)} hint={`Até a parcela ${result.parcelaContemplacao}`} />
              </div>

              <Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                    <CheckCircle2 className="h-5 w-5" /> Resumo para WhatsApp
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea className="min-h-[260px] w-full rounded-2xl border bg-slate-50 p-3 text-sm" readOnly value={resumoTexto} />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={copyResumo} className="rounded-2xl">
                      <Copy className="mr-2 h-4 w-4" /> {copied ? "Copiado!" : "Copiar resumo"}
                    </Button>
                    {buildWhatsappLink(userProfile) && (
                      <Button variant="secondary" className="rounded-2xl" onClick={() => window.open(buildWhatsappLink(userProfile), "_blank")}>Abrir WhatsApp</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {isAdmin && groups.length > 0 && (
        <Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur">
          <CardHeader>
            <CardTitle style={{ color: C.navy }}>Grupos cadastrados BB</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-3 rounded-2xl border p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black" style={{ color: C.navy }}>{g.nome_grupo || g.grupo}</div>
                  <div className="text-xs text-slate-500">
                    {segmentos.find((s) => s.key === g.segmento)?.label} • {brMoney(Number(g.credito_min || 0))} a {brMoney(Number(g.credito_max || 0))} • {g.prazo_min}-{g.prazo_max} meses • {g.is_active === false ? "Inativo" : "Ativo"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="rounded-2xl" onClick={() => { setEditingGroup(g); setConfigOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" className="rounded-2xl" onClick={() => deleteGroup(g)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfigOverlay
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        initialSegmento={segmento}
        editing={editingGroup}
        onSaved={load}
      />
    </div>
  );
}
