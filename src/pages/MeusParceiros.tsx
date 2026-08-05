import { useEffect, useMemo, useState } from "react";
import { cpf, cnpj } from "cpf-cnpj-validator";
import {
  Building2,
  CircleDollarSign,
  Copy,
  Edit3,
  Handshake,
  Loader2,
  Mail,
  Phone,
  Plus,
  QrCode,
  RefreshCcw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PartnerType = "amigo" | "institucional";
type PixKeyType = "cpf_cnpj" | "email" | "telefone" | "aleatoria";

type Partner = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  tipo: PartnerType;
  cpf_cnpj: string;
  data_nascimento_constituicao: string;
  comissao_pct: number;
  pix_tipo: PixKeyType | null;
  pix_chave: string | null;
  created_by: string;
  unit_id: string | null;
  created_at: string;
  updated_at: string;
};

type PartnerMetrics = {
  indications: number;
  converted: number;
  commission: number;
};

type PartnerMetricsRow = {
  partner_id: string;
  indications: number | string | null;
  converted: number | string | null;
  commission_generated: number | string | null;
};

type PartnerForm = {
  nome: string;
  telefone: string;
  email: string;
  tipo: PartnerType;
  cpf_cnpj: string;
  data_nascimento_constituicao: string;
  comissao_pct: string;
  pix_tipo: PixKeyType | "";
  pix_chave: string;
};

const EMPTY_FORM: PartnerForm = {
  nome: "",
  telefone: "",
  email: "",
  tipo: "amigo",
  cpf_cnpj: "",
  data_nascimento_constituicao: "",
  comissao_pct: "",
  pix_tipo: "cpf_cnpj",
  pix_chave: "",
};

const EMPTY_METRICS: PartnerMetrics = {
  indications: 0,
  converted: 0,
  commission: 0,
};

const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  cpf_cnpj: "CPF/CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};

const RANDOM_PIX_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COMMISSION_RULES: Record<
  PartnerType,
  { min: number; max: number; label: string }
> = {
  amigo: { min: 0.2, max: 0.4, label: "0,20% a 0,40%" },
  institucional: { min: 0.5, max: 1, label: "0,50% a 1,00%" },
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function maskPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function maskDocument(value: string, type: PartnerType) {
  const digits = onlyDigits(value).slice(0, type === "amigo" ? 11 : 14);
  if (type === "amigo") {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function normalizePixPhone(value: string) {
  const digits = onlyDigits(value);
  const countryDigits =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return countryDigits ? `+${countryDigits}` : "";
}

function normalizePixKey(type: PixKeyType, value: string, document: string) {
  if (type === "cpf_cnpj") return onlyDigits(document);
  if (type === "email") return value.trim().toLowerCase();
  if (type === "telefone") return normalizePixPhone(value);
  return value.trim().toLowerCase();
}

function pixKeyForInput(partner: Partner) {
  if (!partner.pix_tipo || !partner.pix_chave) return "";
  if (partner.pix_tipo === "cpf_cnpj") {
    return maskDocument(partner.pix_chave, partner.tipo);
  }
  if (partner.pix_tipo === "telefone") {
    const digits = onlyDigits(partner.pix_chave);
    const localDigits = digits.startsWith("55") ? digits.slice(2) : digits;
    return maskPhone(localDigits);
  }
  return partner.pix_chave;
}

function formatPixKey(partner: Partner) {
  if (!partner.pix_tipo || !partner.pix_chave) return "Não informada";
  if (partner.pix_tipo === "cpf_cnpj") {
    return maskDocument(partner.pix_chave, partner.tipo);
  }
  if (partner.pix_tipo === "telefone") {
    const digits = onlyDigits(partner.pix_chave);
    const localDigits = digits.startsWith("55") ? digits.slice(2) : digits;
    return `+55 ${maskPhone(localDigits)}`;
  }
  return partner.pix_chave;
}

function parseCommission(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  return Number(normalized);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}%`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function typeLabel(type: PartnerType) {
  return type === "amigo" ? "Parceiro Amigo" : "Parceiro Institucional";
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function todayLocalDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function MeusParceiros() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [metricsByPartner, setMetricsByPartner] = useState<
    Record<string, PartnerMetrics>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPartners() {
    setLoading(true);
    setError(null);
    try {
      const [partnersResult, metricsResult] = await Promise.all([
        supabase
          .from("partners")
          .select(
            "id,nome,telefone,email,tipo,cpf_cnpj,data_nascimento_constituicao,comissao_pct,pix_tipo,pix_chave,created_by,unit_id,created_at,updated_at",
          )
          .order("nome", { ascending: true }),
        supabase.rpc("get_partner_metrics"),
      ]);

      if (partnersResult.error) throw partnersResult.error;
      if (metricsResult.error) throw metricsResult.error;

      const nextMetrics = Object.fromEntries(
        ((metricsResult.data || []) as PartnerMetricsRow[]).map((row) => [
          row.partner_id,
          {
            indications: Number(row.indications) || 0,
            converted: Number(row.converted) || 0,
            commission: Number(row.commission_generated) || 0,
          },
        ]),
      );

      setPartners((partnersResult.data || []) as Partner[]);
      setMetricsByPartner(nextMetrics);
    } catch (caught: any) {
      setError(caught?.message || "Não foi possível carregar os parceiros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPartners();
  }, []);

  const filteredPartners = useMemo(() => {
    const term = normalizeSearch(search.trim());
    if (!term) return partners;
    return partners.filter((partner) =>
      normalizeSearch(
        [
          partner.nome,
          partner.telefone,
          partner.email,
          partner.pix_chave ?? "",
          partner.pix_tipo ? PIX_KEY_LABELS[partner.pix_tipo] : "PIX pendente",
          typeLabel(partner.tipo),
        ].join(" "),
      ).includes(term),
    );
  }, [partners, search]);

  const summary = useMemo(
    () =>
      partners.reduce(
        (current, partner) => {
          const metrics = metricsByPartner[partner.id] ?? EMPTY_METRICS;
          current.indications += metrics.indications;
          current.converted += metrics.converted;
          current.commission += metrics.commission;
          return current;
        },
        {
          total: partners.length,
          indications: 0,
          converted: 0,
          commission: 0,
        },
      ),
    [metricsByPartner, partners],
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setNotice(null);
    setDialogOpen(true);
  }

  function openEdit(partner: Partner) {
    setEditingId(partner.id);
    setForm({
      nome: partner.nome,
      telefone: maskPhone(partner.telefone),
      email: partner.email,
      tipo: partner.tipo,
      cpf_cnpj: maskDocument(partner.cpf_cnpj, partner.tipo),
      data_nascimento_constituicao: partner.data_nascimento_constituicao,
      comissao_pct: new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(partner.comissao_pct)),
      pix_tipo: partner.pix_tipo ?? "",
      pix_chave: pixKeyForInput(partner),
    });
    setError(null);
    setNotice(null);
    setDialogOpen(true);
  }

  function changePartnerType(type: PartnerType) {
    setForm((current) => ({
      ...current,
      tipo: type,
      cpf_cnpj: "",
      data_nascimento_constituicao: "",
      comissao_pct: "",
      pix_tipo: "cpf_cnpj",
      pix_chave: "",
    }));
  }

  function changePixType(type: PixKeyType) {
    setForm((current) => ({
      ...current,
      pix_tipo: type,
      pix_chave:
        type === "cpf_cnpj"
          ? current.cpf_cnpj
          : type === "email"
            ? current.email
            : type === "telefone"
              ? current.telefone
              : "",
    }));
  }

  function validateForm() {
    const document = onlyDigits(form.cpf_cnpj);
    const phone = onlyDigits(form.telefone);
    const commission = parseCommission(form.comissao_pct);
    const rule = COMMISSION_RULES[form.tipo];

    if (form.nome.trim().length < 2) return "Informe o nome do parceiro.";
    if (phone.length < 10 || phone.length > 11)
      return "Informe um telefone válido com DDD.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
      return "Informe um e-mail válido.";
    if (form.tipo === "amigo" && !cpf.isValid(document))
      return "Informe um CPF válido.";
    if (form.tipo === "institucional" && !cnpj.isValid(document))
      return "Informe um CNPJ válido.";
    if (!form.data_nascimento_constituicao) {
      return form.tipo === "amigo"
        ? "Informe a data de nascimento."
        : "Informe a data de constituição.";
    }
    if (form.data_nascimento_constituicao > todayLocalDate()) {
      return "A data informada não pode estar no futuro.";
    }
    if (!form.pix_tipo) return "Selecione o tipo da chave PIX.";
    const pixKey = normalizePixKey(
      form.pix_tipo,
      form.pix_chave,
      form.cpf_cnpj,
    );
    if (form.pix_tipo === "email" && !/^\S+@\S+\.\S+$/.test(pixKey)) {
      return "Informe um e-mail válido como chave PIX.";
    }
    if (form.pix_tipo === "telefone" && !/^\+55\d{10,11}$/.test(pixKey)) {
      return "Informe um telefone brasileiro válido com DDD como chave PIX.";
    }
    if (form.pix_tipo === "aleatoria" && !RANDOM_PIX_KEY_PATTERN.test(pixKey)) {
      return "Informe uma chave PIX aleatória válida.";
    }
    if (
      !Number.isFinite(commission) ||
      commission < rule.min ||
      commission > rule.max
    ) {
      return `A comissão do ${typeLabel(form.tipo)} deve ficar entre ${rule.label}.`;
    }
    return null;
  }

  async function savePartner() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    if (!form.pix_tipo) {
      setSaving(false);
      setError("Selecione o tipo da chave PIX.");
      return;
    }

    const pixKey = normalizePixKey(
      form.pix_tipo,
      form.pix_chave,
      form.cpf_cnpj,
    );

    const payload = {
      nome: form.nome.trim(),
      telefone: onlyDigits(form.telefone),
      email: form.email.trim().toLowerCase(),
      tipo: form.tipo,
      cpf_cnpj: onlyDigits(form.cpf_cnpj),
      data_nascimento_constituicao: form.data_nascimento_constituicao,
      comissao_pct: parseCommission(form.comissao_pct),
      pix_tipo: form.pix_tipo,
      pix_chave: pixKey,
    };

    try {
      const operation = editingId
        ? supabase.from("partners").update(payload).eq("id", editingId)
        : supabase.from("partners").insert(payload);
      const { error: saveError } = await operation;
      if (saveError) {
        if (saveError.code === "23505") {
          const duplicateTarget = `${saveError.message} ${saveError.details}`;
          throw new Error(
            duplicateTarget.includes("pix")
              ? "Esta chave PIX já está vinculada a outro parceiro seu."
              : "Este CPF/CNPJ já está cadastrado entre os seus parceiros.",
          );
        }
        throw saveError;
      }

      setDialogOpen(false);
      setNotice(
        editingId
          ? "Parceiro atualizado com sucesso."
          : "Parceiro cadastrado com sucesso.",
      );
      await loadPartners();
    } catch (caught: any) {
      setError(caught?.message || "Não foi possível salvar o parceiro.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePartner(partner: Partner) {
    const confirmed = window.confirm(
      `Deseja excluir ${partner.nome}? Esta ação removerá o cadastro do parceiro.`,
    );
    if (!confirmed) return;

    setDeletingId(partner.id);
    setError(null);
    setNotice(null);
    try {
      const { error: deleteError } = await supabase
        .from("partners")
        .delete()
        .eq("id", partner.id);
      if (deleteError) throw deleteError;
      setNotice("Parceiro excluído com sucesso.");
      await loadPartners();
    } catch (caught: any) {
      setError(caught?.message || "Não foi possível excluir o parceiro.");
    } finally {
      setDeletingId(null);
    }
  }

  async function copyPixKey(partner: Partner) {
    setError(null);
    if (!partner.pix_chave) {
      setError(`Cadastre a chave PIX de ${partner.nome} antes de copiá-la.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(partner.pix_chave);
      setNotice(`Chave PIX de ${partner.nome} copiada.`);
    } catch {
      setError("Não foi possível copiar a chave PIX automaticamente.");
    }
  }

  const commissionRule = COMMISSION_RULES[form.tipo];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-white/60 bg-white/75 p-5 shadow-[0_18px_50px_rgba(30,41,63,0.10)] backdrop-blur-xl md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#A11C27] p-3 text-white shadow-lg shadow-[#A11C27]/20">
              <Handshake className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#A11C27]">
                Programa de Parceiros
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1E293F] md:text-3xl">
                Meus Parceiros
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Cadastre Parceiros Amigo e Institucionais e acompanhe as
                indicações, conversões e comissões geradas por cada
                relacionamento.
              </p>
            </div>
          </div>
          <Button
            onClick={openCreate}
            className="h-11 gap-2 px-5 shadow-lg shadow-[#A11C27]/15"
          >
            <Plus className="h-4 w-4" />
            Novo parceiro
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={UsersRound}
          label="Parceiros"
          value={String(summary.total)}
        />
        <SummaryCard
          icon={UserRound}
          label="Indicações"
          value={String(summary.indications)}
        />
        <SummaryCard
          icon={Building2}
          label="Convertidas"
          value={String(summary.converted)}
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="Comissão gerada"
          value={formatCurrency(summary.commission)}
        />
      </section>

      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      )}
      {error && !dialogOpen && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      <Card className="overflow-hidden border border-white/70 bg-white/85 shadow-[0_16px_45px_rgba(30,41,63,0.08)] backdrop-blur-xl">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div>
              <h2 className="text-lg font-black text-[#1E293F]">
                Parceiros cadastrados
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Os indicadores serão alimentados automaticamente após o vínculo
                com Oportunidades.
              </p>
            </div>
            <div className="flex w-full gap-2 md:w-auto">
              <div className="relative min-w-0 flex-1 md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar parceiro"
                  className="h-10 border-slate-200 bg-white pl-9"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={loadPartners}
                disabled={loading}
                title="Atualizar lista"
              >
                <RefreshCcw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando parceiros…
            </div>
          ) : filteredPartners.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <div className="rounded-full bg-[#A11C27]/10 p-4 text-[#A11C27]">
                <Handshake className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#1E293F]">
                {search
                  ? "Nenhum parceiro encontrado"
                  : "Comece sua rede de parceiros"}
              </h3>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                {search
                  ? "Tente buscar por outro nome, telefone, e-mail ou tipo."
                  : "Cadastre seu primeiro Parceiro Amigo ou Parceiro Institucional."}
              </p>
              {!search && (
                <Button onClick={openCreate} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Cadastrar parceiro
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1360px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-bold">Nome</th>
                      <th className="px-4 py-3 font-bold">Telefone</th>
                      <th className="px-4 py-3 font-bold">E-mail</th>
                      <th className="px-4 py-3 font-bold">Tipo</th>
                      <th className="px-4 py-3 font-bold">Chave PIX</th>
                      <th className="px-4 py-3 text-right font-bold">
                        Comissão pactuada
                      </th>
                      <th className="px-4 py-3 text-center font-bold">
                        Indicações
                      </th>
                      <th className="px-4 py-3 text-center font-bold">
                        Convertidas
                      </th>
                      <th className="px-4 py-3 text-right font-bold">
                        Comissão gerada
                      </th>
                      <th className="px-5 py-3 text-right font-bold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPartners.map((partner) => (
                      <PartnerTableRow
                        key={partner.id}
                        partner={partner}
                        metrics={metricsByPartner[partner.id] ?? EMPTY_METRICS}
                        deleting={deletingId === partner.id}
                        onCopyPix={() => copyPixKey(partner)}
                        onEdit={() => openEdit(partner)}
                        onDelete={() => deletePartner(partner)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-4 lg:hidden">
                {filteredPartners.map((partner) => (
                  <PartnerMobileCard
                    key={partner.id}
                    partner={partner}
                    metrics={metricsByPartner[partner.id] ?? EMPTY_METRICS}
                    deleting={deletingId === partner.id}
                    onCopyPix={() => copyPixKey(partner)}
                    onEdit={() => openEdit(partner)}
                    onDelete={() => deletePartner(partner)}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-[26px] border border-white/70 p-0">
          <DialogHeader className="border-b border-slate-100 px-5 pb-4 pt-5 md:px-6">
            <DialogTitle className="text-xl font-black text-[#1E293F]">
              {editingId ? "Editar parceiro" : "Novo parceiro"}
            </DialogTitle>
            <DialogDescription>
              Informe os dados do relacionamento e o percentual pactuado sobre o
              crédito vendido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5 py-5 md:px-6">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              <TypeButton
                active={form.tipo === "amigo"}
                icon={UserRound}
                label="Parceiro Amigo"
                onClick={() => changePartnerType("amigo")}
              />
              <TypeButton
                active={form.tipo === "institucional"}
                icon={Building2}
                label="Parceiro Institucional"
                onClick={() => changePartnerType("institucional")}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome" required className="md:col-span-2">
                <Input
                  value={form.nome}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nome: event.target.value,
                    }))
                  }
                  placeholder={
                    form.tipo === "amigo"
                      ? "Nome completo"
                      : "Razão social ou nome fantasia"
                  }
                  autoFocus
                />
              </Field>

              <Field label="Telefone" required>
                <Input
                  value={form.telefone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      telefone: maskPhone(event.target.value),
                    }))
                  }
                  placeholder="(69) 9 9999-9999"
                  inputMode="tel"
                />
              </Field>

              <Field label="E-mail" required>
                <Input
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="parceiro@email.com"
                  type="email"
                />
              </Field>

              <Field label={form.tipo === "amigo" ? "CPF" : "CNPJ"} required>
                <Input
                  value={form.cpf_cnpj}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      cpf_cnpj: maskDocument(event.target.value, current.tipo),
                    }))
                  }
                  placeholder={
                    form.tipo === "amigo"
                      ? "000.000.000-00"
                      : "00.000.000/0000-00"
                  }
                  inputMode="numeric"
                />
              </Field>

              <Field
                label={
                  form.tipo === "amigo"
                    ? "Data de nascimento"
                    : "Data de constituição"
                }
                required
              >
                <Input
                  value={form.data_nascimento_constituicao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      data_nascimento_constituicao: event.target.value,
                    }))
                  }
                  type="date"
                  max={todayLocalDate()}
                />
              </Field>

              <Field
                label="Comissão pactuada"
                required
                className="md:col-span-2"
              >
                <div className="relative">
                  <Input
                    value={form.comissao_pct}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        comissao_pct: event.target.value.replace(
                          /[^\d,.]/g,
                          "",
                        ),
                      }))
                    }
                    placeholder={
                      form.tipo === "amigo" ? "Ex.: 0,30" : "Ex.: 0,75"
                    }
                    inputMode="decimal"
                    className="pr-10"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-500">
                    %
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Para {typeLabel(form.tipo)}: {commissionRule.label} sobre o
                  crédito vendido.
                </p>
              </Field>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:col-span-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-[#A11C27]/10 p-2 text-[#A11C27]">
                    <QrCode className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#1E293F]">
                      Dados para pagamento
                    </p>
                    <p className="text-xs text-slate-500">
                      A chave PIX será usada no pagamento das comissões.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                      Tipo da chave PIX
                      <span className="ml-1 text-[#A11C27]">*</span>
                    </span>
                    <Select
                      value={form.pix_tipo || undefined}
                      onValueChange={(value) =>
                        changePixType(value as PixKeyType)
                      }
                    >
                      <SelectTrigger className="h-10 border-slate-200 bg-white">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf_cnpj">
                          {form.tipo === "amigo" ? "CPF" : "CNPJ"}
                        </SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="telefone">Telefone</SelectItem>
                        <SelectItem value="aleatoria">
                          Chave aleatória
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Field label="Chave PIX" required>
                    <Input
                      value={
                        form.pix_tipo === "cpf_cnpj"
                          ? maskDocument(form.cpf_cnpj, form.tipo)
                          : form.pix_chave
                      }
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pix_chave: event.target.value,
                        }))
                      }
                      placeholder={
                        form.pix_tipo === "email"
                          ? "pix@email.com"
                          : form.pix_tipo === "telefone"
                            ? "(69) 9 9999-9999"
                            : form.pix_tipo === "aleatoria"
                              ? "00000000-0000-0000-0000-000000000000"
                              : form.tipo === "amigo"
                                ? "Preenchida pelo CPF"
                                : "Preenchida pelo CNPJ"
                      }
                      readOnly={form.pix_tipo === "cpf_cnpj"}
                      type={form.pix_tipo === "email" ? "email" : "text"}
                      inputMode={form.pix_tipo === "telefone" ? "tel" : "text"}
                      className={
                        form.pix_tipo === "cpf_cnpj"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-white"
                      }
                    />
                  </Field>
                </div>

                <p className="text-xs leading-5 text-slate-500">
                  {form.pix_tipo === "cpf_cnpj"
                    ? `A chave será exatamente o ${form.tipo === "amigo" ? "CPF" : "CNPJ"} informado acima.`
                    : form.pix_tipo === "telefone"
                      ? "Digite o telefone com DDD; o código +55 será incluído automaticamente."
                      : form.pix_tipo === "aleatoria"
                        ? "Use a chave aleatória completa, no formato enviado pelo banco."
                        : "A chave pode ser diferente do e-mail de contato do parceiro."}
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-slate-100 px-5 pb-5 pt-4 md:px-6">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={savePartner}
              disabled={saving}
              className="min-w-32 gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Salvar alterações" : "Cadastrar parceiro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
}) {
  return (
    <Card className="border border-white/70 bg-white/80 shadow-[0_10px_30px_rgba(30,41,63,0.07)] backdrop-blur-xl">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-2xl bg-[#A11C27]/10 p-2.5 text-[#A11C27]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-0.5 text-xl font-black text-[#1E293F]">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PartnerTableRow({
  partner,
  metrics,
  deleting,
  onCopyPix,
  onEdit,
  onDelete,
}: {
  partner: Partner;
  metrics: PartnerMetrics;
  deleting: boolean;
  onCopyPix: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-slate-50/70">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E293F] text-xs font-black text-white">
            {partner.nome.slice(0, 2).toUpperCase()}
          </div>
          <span className="font-bold text-[#1E293F]">{partner.nome}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
        {maskPhone(partner.telefone)}
      </td>
      <td
        className="max-w-56 truncate px-4 py-4 text-slate-600"
        title={partner.email}
      >
        {partner.email}
      </td>
      <td className="px-4 py-4">
        <span
          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
            partner.tipo === "amigo"
              ? "bg-blue-50 text-blue-700"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {typeLabel(partner.tipo)}
        </span>
      </td>
      <td className="max-w-64 px-4 py-4">
        <button
          type="button"
          onClick={onCopyPix}
          className="group flex max-w-full items-center gap-2 text-left"
          title={`Copiar chave PIX: ${partner.pix_chave}`}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {partner.pix_tipo
                ? PIX_KEY_LABELS[partner.pix_tipo]
                : "PIX pendente"}
            </p>
            <p className="truncate font-semibold text-slate-700 group-hover:text-[#A11C27]">
              {formatPixKey(partner)}
            </p>
          </div>
          <Copy className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-[#A11C27]" />
        </button>
      </td>
      <td className="px-4 py-4 text-right font-black text-[#A11C27]">
        {formatPercent(partner.comissao_pct)}
      </td>
      <td className="px-4 py-4 text-center font-bold text-slate-700">
        {metrics.indications}
      </td>
      <td className="px-4 py-4 text-center font-bold text-slate-700">
        {metrics.converted}
      </td>
      <td className="px-4 py-4 text-right font-bold text-slate-700">
        {formatCurrency(metrics.commission)}
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            title="Editar parceiro"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            title="Excluir parceiro"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function PartnerMobileCard({
  partner,
  metrics,
  deleting,
  onCopyPix,
  onEdit,
  onDelete,
}: {
  partner: Partner;
  metrics: PartnerMetrics;
  deleting: boolean;
  onCopyPix: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-[#1E293F]">{partner.nome}</h3>
          <span
            className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
              partner.tipo === "amigo"
                ? "bg-blue-50 text-blue-700"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {typeLabel(partner.tipo)}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Comissão
          </p>
          <p className="text-base font-black text-[#A11C27]">
            {formatPercent(partner.comissao_pct)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-600">
        <a
          href={`tel:${onlyDigits(partner.telefone)}`}
          className="flex items-center gap-2 hover:text-[#A11C27]"
        >
          <Phone className="h-4 w-4" />
          {maskPhone(partner.telefone)}
        </a>
        <a
          href={`mailto:${partner.email}`}
          className="flex min-w-0 items-center gap-2 hover:text-[#A11C27]"
        >
          <Mail className="h-4 w-4 shrink-0" />
          <span className="truncate">{partner.email}</span>
        </a>
        <button
          type="button"
          onClick={onCopyPix}
          className="flex min-w-0 items-center gap-2 text-left hover:text-[#A11C27]"
          title="Copiar chave PIX"
        >
          <QrCode className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              PIX ·{" "}
              {partner.pix_tipo ? PIX_KEY_LABELS[partner.pix_tipo] : "Pendente"}
            </span>
            <span className="block truncate">{formatPixKey(partner)}</span>
          </span>
          <Copy className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
        <MobileMetric label="Indicações" value={String(metrics.indications)} />
        <MobileMetric label="Convertidas" value={String(metrics.converted)} />
        <MobileMetric
          label="Gerada"
          value={formatCurrency(metrics.commission)}
        />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
          <Edit3 className="h-4 w-4" />
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={deleting}
          className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Excluir
        </Button>
      </div>
    </article>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-black text-[#1E293F]">
        {value}
      </p>
    </div>
  );
}

function TypeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition sm:text-sm ${
        active
          ? "bg-white text-[#A11C27] shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}
        {required && <span className="ml-1 text-[#A11C27]">*</span>}
      </span>
      {children}
    </label>
  );
}
