// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";

// ===== PDF =====
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;

type Lead = { id: UUID; nome: string; telefone?: string | null };
type Admin = { id: UUID; name: string };

type SimTable = {
  id: UUID;
  admin_id: UUID;
  segmento: string;
  nome_tabela: string;
  faixa_min: number;
  faixa_max: number;
  prazo_limite: number;
  taxa_adm_pct: number;
  fundo_reserva_pct: number;
  antecip_pct: number;
  antecip_parcelas: number; // 0|1|2
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
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

/* ======================= Helpers ========================= */
const brMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";

/** BRL mask */
function formatBRLInputFromNumber(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRLInputToNumber(s: string): number {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}

/** Percent “25,0000” <-> 0.25 (decimal) */
function formatPctInputFromDecimal(d: number): string {
  return (d * 100).toFixed(4).replace(".", ",");
}
function parsePctInputToDecimal(s: string): number {
  const clean = (s || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Exceção do limitador: Motocicleta >= 20k => 1% */
function resolveLimitadorPct(baseLimitadorPct: number, segmento: string, credito: number): number {
  if ((segmento || "").toLowerCase().includes("motocicleta") && credito >= 20000) return 0.01;
  return baseLimitadorPct;
}

/** Formata telefone BR para exibição */
function formatPhoneBR(s?: string) {
  const d = (s || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

/* ======================= Cálculo ========================= */
type CalcInput = {
  credito: number;
  prazoVenda: number;
  forma: FormaContratacao;
  seguro: boolean;
  segmento: string;

  taxaAdmFull: number;
  frPct: number;
  antecipPct: number;
  antecipParcelas: 0 | 1 | 2;
  limitadorPct: number;
  seguroPrestPct: number;

  parcContemplacao: number;
  indice12m: number; // IPCA/INCC/IGPM manual (decimal), aplicado conforme regras
  lanceOfertPct: number;
  lanceEmbutPct: number; // <= 0.25
};

export type ExtratoLinha = {
  parcela: number;
  creditoMes: number;
  valorPago: number;
  reajuste: number;
  saldoDevedor: number;
  investimento: number;
  evento?: string;
};

function calcularSimulacaoComExtrato(i: CalcInput) {
  const {
    credito: C0,
    prazoVenda,
    forma,
    seguro,
    segmento,
    taxaAdmFull,
    frPct,
    antecipPct,
    antecipParcelas,
    limitadorPct,
    seguroPrestPct,
    parcContemplacao, // mCont
    indice12m,
    lanceOfertPct,
    lanceEmbutPct,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const mCont = clamp(Math.floor(parcContemplacao), 1, prazo); // contemplação em [1..prazo]

  // Partes fixas do contrato (sobre crédito original)
  const admValor = C0 * taxaAdmFull;
  const frValor = C0 * frPct;
  let saldo = C0 + admValor + frValor; // saldo do contrato

  // Seguro mensal (apenas soma na parcela exibida; não abate saldo)
  const seguroMensal = seguro ? (C0 + admValor + frValor) * seguroPrestPct : 0;

  // Fator de forma (pré-contemplação apenas)
  const fatorForma = forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;

  // TA efetiva (adm mensal que vai na parcela)
  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);

  // Parcela pré (SEM seguro) — sobre o contrato
  const parcelaPreSemSeguro =
    (C0 * fatorForma + C0 * TA_efetiva + C0 * frPct) / prazo;

  const antecada = antecipParcelas > 0 ? (C0 * antecipPct) / antecipParcelas : 0;

  // Controle de crédito corrigido (para linha "Crédito do mês" no extrato)
  let creditoCorrigido = C0;
  const eventos: ExtratoLinha[] = [];
  let investimentoAc = 0;

  // ======= Pré-contemplação: meses 1..mCont
  for (let m = 1; m <= mCont; m++) {
    // Reajuste anual pré (sobre o CRÉDITO) nos aniversários 13,25,37...
    let reajuste = 0;
    if (m > 1 && (m - 1) % 12 === 0) {
      const acresc = creditoCorrigido * indice12m;
      creditoCorrigido += acresc;
      // O acréscimo é somado ao saldo devedor (regra do enunciado)
      saldo += acresc;
      reajuste = acresc;
    }

    // Parcela do mês (com antecipação quando houver) — mas o que abate saldo é SEM seguro
    const temAntecip = m <= antecipParcelas && antecada > 0;
    const parcelaMesExibida = parcelaPreSemSeguro + (temAntecip ? antecada : 0) + seguroMensal;

    // Abatimento do saldo: apenas componente "sem seguro" (parcelaPreSemSeguro) + antecipação (se houver)
    const abateSaldo = parcelaPreSemSeguro + (temAntecip ? antecada : 0);
    saldo = Math.max(0, saldo - abateSaldo);

    investimentoAc += parcelaMesExibida;

    eventos.push({
      parcela: m,
      creditoMes: creditoCorrigido,
      valorPago: parcelaMesExibida,
      reajuste,
      saldoDevedor: saldo,
      investimento: investimentoAc,
      evento: reajuste > 0 ? "Reajuste pré-contemplação" : undefined,
    });
  }

  // ======= Contemplação no mês mCont
  // Paga-se a parcela do mês normalmente (já acima). Agora aplicam-se lances:
  const lanceEmbutido = creditoCorrigido * clamp(lanceEmbutPct, 0, 0.25); // reduz crédito
  const novoCredito = Math.max(0, creditoCorrigido - lanceEmbutido);

  // Lance ofertado incide sobre saldo (após pagar a parcela do mês)
  const lanceOfertado = creditoCorrigido * clamp(lanceOfertPct, 0, 1); // sobre CRÉDITO corrigido do mês da contemplação
  saldo = Math.max(0, saldo - lanceOfertado);

  // Registrar evento de lance
  if (eventos.length) {
    const idx = eventos.findIndex((l) => l.parcela === mCont);
    if (idx >= 0) {
      const e = eventos[idx];
      eventos[idx] = {
        ...e,
        evento:
          (e.evento ? e.evento + " • " : "") +
          (lanceEmbutido > 0 ? "Lance embutido" : "") +
          (lanceEmbutido > 0 && lanceOfertado > 0 ? " + " : "") +
          (lanceOfertado > 0 ? "Lance ofertado" : ""),
      };
    }
  }

  // A partir daqui, reduções acabam. Volta a considerar o crédito original corrigido (ou novoCredito)
  // Pós: reajuste anual incide sobre o SALDO (não mais sobre crédito)
  const parcelasPagas = mCont;
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

  // Nova parcela (sem limite) — SEM seguro
  const novaParcelaSemLimite = saldo / prazoRestante;

  // Parcela limitante (usa novoCredito + adm + fr, lembrando: adm e fr são do C0, regra pedida)
  const parcelaLimitante = resolveLimitadorPct(limitadorPct, segmento, C0) * (novoCredito + admValor + frValor);

  // Parcela escolhida (SEM seguro) = MAIOR entre as duas
  const parcelaEscolhidaSemSeguro = Math.max(novaParcelaSemLimite, parcelaLimitante);
  const parcelaEscolhidaComSeguro = parcelaEscolhidaSemSeguro + seguroMensal;

  // ======= Pós-contemplação: meses mCont+1 .. prazo
  for (let m = mCont + 1; m <= prazo; m++) {
    // Reajuste anual pós (sobre o SALDO) nos aniversários 13,25,37...
    let reajuste = 0;
    if (m > 1 && (m - 1) % 12 === 0) {
      const acresc = saldo * indice12m;
      saldo += acresc;
      reajuste = acresc;
    }

    const parcelaExibida = parcelaEscolhidaComSeguro;
    const abateSaldo = parcelaEscolhidaSemSeguro;
    saldo = Math.max(0, saldo - abateSaldo);
    investimentoAc += parcelaExibida;

    eventos.push({
      parcela: m,
      creditoMes: novoCredito, // após embutido, o "crédito do mês" exposto é o novo crédito base
      valorPago: parcelaExibida,
      reajuste,
      saldoDevedor: saldo,
      investimento: investimentoAc,
      evento: reajuste > 0 ? "Reajuste pós-contemplação" : undefined,
    });
  }

  return {
    admValor,
    frValor,
    creditoCorrigidoFinal: creditoCorrigido,
    novoCredito,
    lanceEmbutido,
    lanceOfertado,
    TA_efetiva,
    parcelaPreSemSeguro,
    antecada,
    seguroMensal,
    novaParcelaSemLimite,
    parcelaLimitante,
    parcelaEscolhidaSemSeguro,
    parcelaEscolhidaComSeguro,
    prazoRestante,
    saldoFinal: saldo,
    extrato: eventos,
  };
}

/* ========== Inputs com máscara (Money / Percent) ========== */
function MoneyInput({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (n: number) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...rest}
      inputMode="numeric"
      value={formatBRLInputFromNumber(value || 0)}
      onChange={(e) => onChange(parseBRLInputToNumber(e.target.value))}
      className={`text-right ${rest.className || ""}`}
    />
  );
}

function PercentInput({
  valueDecimal,
  onChangeDecimal,
  maxDecimal,
  ...rest
}: {
  valueDecimal: number;
  onChangeDecimal: (d: number) => void;
  maxDecimal?: number;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const display = formatPctInputFromDecimal(valueDecimal || 0);
  return (
    <div className="flex items-center gap-2">
      <Input
        {...rest}
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          let d = parsePctInputToDecimal(e.target.value);
          if (typeof maxDecimal === "number") d = clamp(d, 0, maxDecimal);
          onChangeDecimal(d);
        }}
        className={`text-right ${rest.className || ""}`}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}
/* ========================= Página ======================== */
export default function Simuladores() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);

  const [mgrOpen, setMgrOpen] = useState(false);

  // seleção
  const [leadId, setLeadId] = useState<string>("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState<string>("");

  const [segmento, setSegmento] = useState<string>("");
  const [nomeTabela, setNomeTabela] = useState<string>("");
  const [tabelaId, setTabelaId] = useState<string>("");
  const [prazoAte, setPrazoAte] = useState<number>(0);
  const [faixa, setFaixa] = useState<{ min: number; max: number } | null>(null);

  const [credito, setCredito] = useState<number>(0);
  const [prazoVenda, setPrazoVenda] = useState<number>(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState<boolean>(false);

  const [lanceOfertPct, setLanceOfertPct] = useState<number>(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState<number>(0);
  const [parcContemplacao, setParcContemplacao] = useState<number>(1);

  // ÍNDICES (chips + overlay manual)
  const [indiceSel, setIndiceSel] = useState<"IPCA" | "INCC" | "IGP-M">("IPCA");
  const [overlayIndices, setOverlayIndices] = useState(false);
  const [ipca12, setIpca12] = useState<number>(0.039); // padrão 3,90%
  const [incc12, setIncc12] = useState<number>(0.039);
  const [igpm12, setIgpm12] = useState<number>(0.039);

  // usuário logado (public.users)
  const [userName, setUserName] = useState<string>("");
  const [userPhone, setUserPhone] = useState<string>("");

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacaoComExtrato> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  // Texto livre para “Assembleia”
  const [assembleia, setAssembleia] = useState<string>("15/10");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: t }, { data: l }] = await Promise.all([
        supabase.from("sim_admins").select("id,name").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
        supabase.from("leads").select("id, nome, telefone").limit(200).order("created_at", { ascending: false }),
      ]);
      setAdmins(a ?? []);
      setTables(t ?? []);
      setLeads((l ?? []).map((x: any) => ({ id: x.id, nome: x.nome, telefone: x.telefone })));
      const embr = (a ?? []).find((ad: any) => ad.name === "Embracon");
      setActiveAdminId(embr?.id ?? (a?.[0]?.id ?? null));
      setLoading(false);
    })();
  }, []);

  // pega usuário logado em public.users
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("public.users")
        .select("name, phone")
        .eq("auth_user_id", uid)
        .maybeSingle();
      setUserName((data?.name || "").toString());
      setUserPhone((data?.phone || "").toString());
    })();
  }, []);

  useEffect(() => {
    const found = leads.find((x) => x.id === leadId);
    setLeadInfo(found ? { nome: found.nome, telefone: found.telefone } : null);
  }, [leadId, leads]);

  const adminTables = useMemo(
    () => tables.filter((t) => t.admin_id === activeAdminId),
    [tables, activeAdminId]
  );

  // nomes de tabela distintos por segmento
  const nomesTabelaSegmento = useMemo(() => {
    const list = adminTables
      .filter((t) => (segmento ? t.segmento === segmento : true))
      .map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  // variantes (linhas) do nome escolhido (prazo e taxas diferentes)
  const variantesDaTabela = useMemo(() => {
    return adminTables.filter(
      (t) => t.segmento === segmento && t.nome_tabela === nomeTabela
    );
  }, [adminTables, segmento, nomeTabela]);

  const tabelaSelecionada = useMemo(
    () => tables.find((t) => t.id === tabelaId) || null,
    [tables, tabelaId]
  );

  useEffect(() => {
    if (!tabelaSelecionada) return;
    setPrazoAte(tabelaSelecionada.prazo_limite);
    setFaixa({ min: tabelaSelecionada.faixa_min, max: tabelaSelecionada.faixa_max });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25) setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50) setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  // valida % embutido
  const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, 0.25);
  useEffect(() => {
    if (lanceEmbutPct !== lanceEmbutPctValid) setLanceEmbutPct(lanceEmbutPctValid);
  }, [lanceEmbutPct]); // eslint-disable-line

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular =
    !!tabelaSelecionada &&
    credito > 0 &&
    prazoVenda > 0 &&
    parcContemplacao > 0 &&
    parcContemplacao < prazoVenda;

  // índice selecionado efetivo
  const indice12m = useMemo(() => {
    if (indiceSel === "IPCA") return ipca12;
    if (indiceSel === "INCC") return incc12;
    return igpm12;
  }, [indiceSel, ipca12, incc12, igpm12]);

  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }
    const inp: CalcInput = {
      credito,
      prazoVenda,
      forma,
      seguro: seguroPrest,
      segmento: tabelaSelecionada.segmento,
      taxaAdmFull: tabelaSelecionada.taxa_adm_pct,
      frPct: tabelaSelecionada.fundo_reserva_pct,
      antecipPct: tabelaSelecionada.antecip_pct,
      antecipParcelas: (tabelaSelecionada.antecip_parcelas as 0 | 1 | 2) ?? 0,
      limitadorPct: tabelaSelecionada.limitador_parcela_pct,
      seguroPrestPct: tabelaSelecionada.seguro_prest_pct,
      parcContemplacao,
      indice12m,
      lanceOfertPct,
      lanceEmbutPct: lanceEmbutPctValid,
    };
    setCalc(calcularSimulacaoComExtrato(inp));
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPctValid,
    parcContemplacao,
    indice12m,
  ]); // eslint-disable-line

  async function salvarSimulacao() {
    if (!tabelaSelecionada || !calc) return;
    setSalvando(true);

    const payload = {
      admin_id: activeAdminId,
      table_id: tabelaSelecionada.id,
      lead_id: leadId || null,
      lead_nome: leadInfo?.nome || null,
      lead_telefone: leadInfo?.telefone || null,
      grupo: grupo || null,
      segmento: tabelaSelecionada.segmento,
      nome_tabela: tabelaSelecionada.nome_tabela,
      credito,
      prazo_venda: prazoVenda,
      forma_contratacao: forma,
      seguro_prestamista: seguroPrest,
      lance_ofertado_pct: lanceOfertPct,
      lance_embutido_pct: lanceEmbutPctValid,
      parcela_contemplacao: parcContemplacao,
      valor_categoria: C0Categoria(credito, tabelaSelecionada.taxa_adm_pct, tabelaSelecionada.fundo_reserva_pct),
      parcela_ate_1_ou_2: calc.parcelaPreSemSeguro + (tabelaSelecionada.antecip_parcelas > 0 ? calc.antecada : 0) + calc.seguroMensal,
      parcela_demais: calc.parcelaPreSemSeguro + calc.seguroMensal,
      lance_ofertado_valor: calc.lanceOfertado,
      lance_embutido_valor: calc.lanceEmbutido,
      novo_credito: calc.novoCredito,
      nova_parcela_sem_limite: calc.novaParcelaSemLimite,
      parcela_limitante: calc.parcelaLimitante,
      parcela_escolhida: calc.parcelaEscolhidaSemSeguro,
      saldo_devedor_final: calc.saldoFinal,
      novo_prazo: calc.prazoRestante,
      indice_tipo: indiceSel,
      indice_valor12m: indice12m,
    };

    const { data, error } = await supabase
      .from("sim_simulations")
      .insert(payload)
      .select("code")
      .single();
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar simulação: " + error.message);
      return;
    }
    setSimCode(data?.code ?? null);
  }

  function C0Categoria(C0: number, adm: number, fr: number) {
    return C0 * (1 + adm + fr);
  }

  function handleTableCreatedOrUpdated(newTable: SimTable) {
    setTables((prev) => {
      const exists = prev.find((t) => t.id === newTable.id);
      if (exists) return prev.map((t) => (t.id === newTable.id ? newTable : t));
      return [newTable, ...prev];
    });
  }
  function handleTableDeleted(id: string) {
    setTables((prev) => prev.filter((t) => t.id !== id));
  }

  // ===== Resumo da Proposta (texto copiável) =====
  const resumoTexto = useMemo(() => {
    if (!tabelaSelecionada || !calc || !podeCalcular) return "";

    const bem = (() => {
      const seg = (segmento || tabelaSelecionada.segmento || "").toLowerCase();
      if (seg.includes("imó")) return "imóvel";
      if (seg.includes("serv")) return "serviço";
      if (seg.includes("moto")) return "motocicleta";
      return "veículo";
    })();

    const primeiraParcelaLabel =
      tabelaSelecionada.antecip_parcelas === 2
        ? "Parcelas 1 e 2"
        : tabelaSelecionada.antecip_parcelas === 1
        ? "Parcela 1"
        : "Parcela inicial";

    const telDigits = (userPhone || "").replace(/\D/g, "");
    const wa = `https://wa.me/${telDigits || ""}`;

    const parcelaInicialExib = calc.parcelaPreSemSeguro + (tabelaSelecionada.antecip_parcelas > 0 ? calc.antecada : 0) + calc.seguroMensal;
    const parcelaDemaisExib = calc.parcelaPreSemSeguro + calc.seguroMensal;

    return (
`🎯 Com a estratégia certa, você conquista seu ${bem} sem pagar juros, sem entrada e ainda economiza!

📌 Simulação:

💰 Crédito contratado: ${brMoney(credito)}

💳 ${primeiraParcelaLabel}: ${brMoney(parcelaInicialExib)} (Primeira parcela em até 3x no cartão)
💵 Demais parcelas até a contemplação: ${brMoney(parcelaDemaisExib)}

📈 Contemplação prevista: mês ${parcContemplacao}
🏦 Lance próprio: ${brMoney(Math.max(0, calc.lanceOfertado - calc.lanceEmbutido))}

✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}

📆 Parcelas restantes (valor): ${brMoney(calc.parcelaEscolhidaSemSeguro + calc.seguroMensal)}
⏳ Prazo restante: ${calc.prazoRestante} meses

Índice: ${indiceSel} (${(indice12m*100).toFixed(2)}% 12m)

👉 Quer simular com o valor do seu ${bem} dos sonhos?
Me chama aqui 👇
${wa}`
    );
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone, indiceSel, indice12m]);

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  // ===== Texto OPORTUNIDADE / PROPOSTA EMBRACON =====
  function normalizarSegmento(seg?: string) {
    const s = (seg || "").toLowerCase();
    if (s.includes("imó")) return "Imóvel";
    if (s.includes("auto")) return "Automóvel";
    if (s.includes("moto")) return "Motocicleta";
    if (s.includes("serv")) return "Serviços";
    if (s.includes("pesad")) return "Pesados";
    return (seg || "Automóvel");
  }
  function emojiDoSegmento(seg?: string) {
    const s = (seg || "").toLowerCase();
    if (s.includes("imó")) return "🏠";
    if (s.includes("moto")) return "🏍️";
    if (s.includes("serv")) return "✈️";
    if (s.includes("pesad")) return "🚚";
    return "🚗";
  }

  const propostaTexto = useMemo(() => {
    if (!calc || !podeCalcular) return "";
    const segBase = segmento || tabelaSelecionada?.segmento || "Automóvel";
    const seg = normalizarSegmento(segBase);
    const emoji = emojiDoSegmento(segBase);

    const parcela1Exib = calc.parcelaPreSemSeguro + (tabelaSelecionada?.antecip_parcelas ? calc.antecada : 0) + calc.seguroMensal;
    const mostraParc2 = tabelaSelecionada?.antecip_parcelas === 2;
    const linhaParc2 = mostraParc2 ? `\n💰 Parcela 2: ${brMoney(calc.parcelaPreSemSeguro + calc.antecada + calc.seguroMensal)} (com antecipação)` : "";

    const whatsappFmt = formatPhoneBR(userPhone);
    const whatsappLine = whatsappFmt ? `\nWhatsApp: ${whatsappFmt}` : "";

    return (
`🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

Proposta ${seg}

${emoji} Crédito: ${brMoney(calc.novoCredito)}
💰 Parcela 1: ${brMoney(parcela1Exib)} (Em até 3x no cartão)${linhaParc2}
📆 + ${calc.prazoRestante}x de ${brMoney(calc.parcelaEscolhidaSemSeguro + calc.seguroMensal)}
💵 Lance Próprio: ${brMoney(Math.max(0, calc.lanceOfertado - calc.lanceEmbutido))}
📢 Grupo: ${grupo || "—"}

Índice: ${indiceSel} (${(indice12m*100).toFixed(2)}% 12m)

Assembleia ${assembleia}
📲 Garanta sua vaga agora!${whatsappLine}

Vantagens
✅ Primeira parcela em até 3x no cartão
✅ Parcelas acessíveis
✅ Alta taxa de contemplação`
    );
  }, [calc, podeCalcular, segmento, tabelaSelecionada, grupo, assembleia, userPhone, indiceSel, indice12m]);

  async function copiarProposta() {
    try {
      await navigator.clipboard.writeText(propostaTexto);
      alert("Texto copiado!");
    } catch {
      alert("Não foi possível copiar o texto.");
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando simuladores...
      </div>
    );
  }

  const activeAdmin = admins.find((a) => a.id === activeAdminId);

  return (
    <div className="p-6 space-y-4">
      {/* topo: admins + botões */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {admins.map((a) => (
            <Button
              key={a.id}
              variant={activeAdminId === a.id ? "default" : "secondary"}
              onClick={() => {
                setActiveAdminId(a.id);
              }}
              className="h-10 rounded-2xl px-4"
            >
              {a.name}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeAdmin && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMgrOpen(true)}
                className="h-10 rounded-2xl px-4"
              >
                Gerenciar Tabelas
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => alert("Em breve: adicionar administradora.")}
                className="h-10 rounded-2xl px-4 whitespace-nowrap"
              >
                <Plus className="h-4 w-4 mr-1" /> + Add Administradora
              </Button>
            </>
          )}
        </div>
      </div>

      {/* layout em duas colunas */}
      <div className="grid grid-cols-12 gap-4">
        {/* coluna esquerda: simulador */}
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Simuladores</CardTitle>
            </CardHeader>
            <CardContent>
              {activeAdmin ? (
                activeAdmin.name === "Embracon" ? (
                  <EmbraconSimulator
                    leads={leads}
                    adminTables={adminTables}
                    nomesTabelaSegmento={nomesTabelaSegmento}
                    variantesDaTabela={variantesDaTabela}
                    tabelaSelecionada={tabelaSelecionada}
                    prazoAte={prazoAte}
                    faixa={faixa}
                    leadId={leadId}
                    setLeadId={setLeadId}
                    leadInfo={leadInfo}
                    grupo={grupo}
                    setGrupo={setGrupo}
                    segmento={segmento}
                    setSegmento={(v) => { setSegmento(v); setNomeTabela(""); setTabelaId(""); }}
                    nomeTabela={nomeTabela}
                    setNomeTabela={(v) => { setNomeTabela(v); setTabelaId(""); }}
                    tabelaId={tabelaId}
                    setTabelaId={setTabelaId}
                    credito={credito}
                    setCredito={setCredito}
                    prazoVenda={prazoVenda}
                    setPrazoVenda={setPrazoVenda}
                    forma={forma}
                    setForma={setForma}
                    seguroPrest={seguroPrest}
                    setSeguroPrest={setSeguroPrest}
                    lanceOfertPct={lanceOfertPct}
                    setLanceOfertPct={setLanceOfertPct}
                    lanceEmbutPct={lanceEmbutPct}
                    setLanceEmbutPct={setLanceEmbutPct}
                    parcContemplacao={parcContemplacao}
                    setParcContemplacao={setParcContemplacao}
                    prazoAviso={prazoAviso}
                    calc={calc}
                    salvar={salvarSimulacao}
                    salvando={salvando}
                    simCode={simCode}
                    indiceSel={indiceSel}
                    setIndiceSel={setIndiceSel}
                    ipca12={ipca12} setIpca12={setIpca12}
                    incc12={incc12} setIncc12={setIncc12}
                    igpm12={igpm12} setIgpm12={setIgpm12}
                    overlayIndices={overlayIndices}
                    setOverlayIndices={setOverlayIndices}
                    userName={userName}
                    userPhone={userPhone}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Em breve: simulador para <strong>{activeAdmin.name}</strong>.
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground">Nenhuma administradora encontrada.</div>
              )}
            </CardContent>
          </Card>

          {/* Ações principais */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            {simCode && <span className="text-sm">✅ Salvo como <strong>Simulação #{simCode}</strong></span>}
          </div>
        </div>

        {/* coluna direita: memória + textos */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Memória de Cálculo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">Selecione uma tabela para ver os detalhes.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div>
                    <div className="text-right font-medium">{brMoney(credito || 0)}</div>
                    <div>Prazo da Venda</div>
                    <div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div>
                    <div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div>
                    <div className="text-right">
                      {seguroPrest ? pctHuman(tabelaSelecionada.seguro_prest_pct) : "—"}
                    </div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Taxa Adm (total)</div>
                    <div className="text-right">{pctHuman(tabelaSelecionada.taxa_adm_pct)}</div>
                    <div>TA efetiva</div>
                    <div className="text-right">{calc ? pctHuman(calc.TA_efetiva) : "—"}</div>
                    <div>Fundo Reserva</div>
                    <div className="text-right">{pctHuman(tabelaSelecionada.fundo_reserva_pct)}</div>
                    <div>Antecipação Adm</div>
                    <div className="text-right">
                      {pctHuman(tabelaSelecionada.antecip_pct)} • {tabelaSelecionada.antecip_parcelas}x
                    </div>
                    <div>Limitador Parcela</div>
                    <div className="text-right">
                      {pctHuman(
                        resolveLimitadorPct(
                          tabelaSelecionada.limitador_parcela_pct,
                          tabelaSelecionada.segmento,
                          credito || 0
                        )
                      )}
                    </div>
                    <div>Índice (12m)</div>
                    <div className="text-right">
                      {indiceSel} • {(indice12m * 100).toFixed(2)}%
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Resumo */}
          <Card>
            <CardHeader><CardTitle>Resumo da Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea
                className="w-full h-64 border rounded-md p-3 text-sm leading-relaxed"
                style={{ lineHeight: "1.6" }}
                readOnly
                value={resumoTexto}
                placeholder="Preencha os campos da simulação para gerar o resumo."
              />
              <div className="flex items-center justify-end gap-2">
                <Button onClick={copiarResumo} disabled={!resumoTexto}>Copiar</Button>
              </div>
            </CardContent>
          </Card>

          {/* OPORTUNIDADE */}
          <Card>
            <CardHeader><CardTitle>Texto: Oportunidade / Proposta Embracon</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Assembleia (ex.: 15/10)</Label>
                  <Input value={assembleia} onChange={(e) => setAssembleia(e.target.value)} placeholder="dd/mm" />
                </div>
              </div>
              <textarea
                className="w-full h-72 border rounded-md p-3 text-sm leading-relaxed"
                style={{ lineHeight: "1.6" }}
                readOnly
                value={propostaTexto}
                placeholder="Preencha a simulação para gerar o texto."
              />
              <div className="flex items-center justify-end gap-2">
                <Button onClick={copiarProposta} disabled={!propostaTexto}>Copiar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Overlay de gerenciamento de tabelas */}
      {mgrOpen && activeAdmin && (
        <TableManagerModal
          admin={activeAdmin}
          allTables={adminTables}
          onClose={() => setMgrOpen(false)}
          onCreatedOrUpdated={handleTableCreatedOrUpdated}
          onDeleted={handleTableDeleted}
        />
      )}
    </div>
  );
}

/* ====================== Embracon UI ====================== */
type EmbraconProps = {
  leads: Lead[];
  adminTables: SimTable[];
  nomesTabelaSegmento: string[];
  variantesDaTabela: SimTable[];
  tabelaSelecionada: SimTable | null;
  prazoAte: number;
  faixa: { min: number; max: number } | null;
  leadId: string; setLeadId: (v: string) => void;
  leadInfo: { nome: string; telefone?: string | null } | null;
  grupo: string; setGrupo: (v: string) => void;

  segmento: string; setSegmento: (v: string) => void;
  nomeTabela: string; setNomeTabela: (v: string) => void;
  tabelaId: string; setTabelaId: (v: string) => void;

  credito: number; setCredito: (v: number) => void;
  prazoVenda: number; setPrazoVenda: (v: number) => void;
  forma: FormaContratacao; setForma: (v: FormaContratacao) => void;
  seguroPrest: boolean; setSeguroPrest: (v: boolean) => void;

  lanceOfertPct: number; setLanceOfertPct: (v: number) => void;
  lanceEmbutPct: number; setLanceEmbutPct: (v: number) => void;
  parcContemplacao: number; setParcContemplacao: (v: number) => void;

  prazoAviso: string | null;
  calc: ReturnType<typeof calcularSimulacaoComExtrato> | null;

  salvar: () => Promise<void>;
  salvando: boolean;
  simCode: number | null;

  // Índices
  indiceSel: "IPCA" | "INCC" | "IGP-M";
  setIndiceSel: (v: "IPCA" | "INCC" | "IGP-M") => void;
  ipca12: number; setIpca12: (d: number) => void;
  incc12: number; setIncc12: (d: number) => void;
  igpm12: number; setIgpm12: (d: number) => void;
  overlayIndices: boolean; setOverlayIndices: (b: boolean) => void;

  // cabeçalho de extrato
  userName: string;
  userPhone: string;
};

function EmbraconSimulator(p: EmbraconProps) {
  // Botões/Chips de Índice + overlay
  const Chip = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`px-3 h-8 rounded-full text-sm border ${
        active ? "bg-black text-white border-black" : "bg-white hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Lead */}
      <Card>
        <CardHeader><CardTitle>Embracon</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Selecionar Lead</Label>
              <select
                className="w-full h-10 border rounded-md px-3"
                value={p.leadId}
                onChange={(e) => p.setLeadId(e.target.value)}
              >
                <option value="">Escolha um lead</option>
                {p.leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
              {p.leadInfo && (
                <p className="text-xs text-muted-foreground mt-1">
                  {p.leadInfo.nome} • {p.leadInfo.telefone || "sem telefone"}
                </p>
              )}
            </div>
            <div>
              <Label>Nº do Grupo (opcional)</Label>
              <Input value={p.grupo} onChange={(e) => p.setGrupo(e.target.value)} placeholder="ex.: 9957" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plano */}
      {p.leadId ? (
        <>
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Segmento</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.segmento}
                  onChange={(e) => p.setSegmento(e.target.value)}
                >
                  <option value="">Selecione o segmento</option>
                  {Array.from(new Set(p.adminTables.map((t) => t.segmento))).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Tabela</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.nomeTabela}
                  disabled={!p.segmento}
                  onChange={(e) => p.setNomeTabela(e.target.value)}
                >
                  <option value="">
                    {p.segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}
                  </option>
                  {p.nomesTabelaSegmento.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Prazo Até</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.tabelaId}
                  disabled={!p.nomeTabela}
                  onChange={(e) => p.setTabelaId(e.target.value)}
                >
                  <option value="">
                    {p.nomeTabela ? "Selecione o prazo" : "Selecione a tabela antes"}
                  </option>
                  {p.variantesDaTabela.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR {pctHuman(t.fundo_reserva_pct)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Faixa de Crédito</Label>
                <Input value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Venda */}
          <Card>
            <CardHeader><CardTitle>Configurações da Venda</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Valor do Crédito</Label>
                <MoneyInput value={p.credito || 0} onChange={p.setCredito} />
              </div>

              <div>
                <Label>Prazo da Venda (meses)</Label>
                <Input type="number" value={p.prazoVenda || ""} onChange={(e) => p.setPrazoVenda(Number(e.target.value))} />
                {p.prazoAviso && <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>}
              </div>

              <div>
                <Label>Forma de Contratação</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={p.forma}
                  disabled={!p.tabelaSelecionada}
                  onChange={(e) => p.setForma(e.target.value as any)}
                >
                  <option value="">Selecione</option>
                  {p.tabelaSelecionada?.contrata_parcela_cheia && (
                    <option value="Parcela Cheia">Parcela Cheia</option>
                  )}
                  {p.tabelaSelecionada?.contrata_reduzida_25 && (
                    <option value="Reduzida 25%">Reduzida 25%</option>
                  )}
                  {p.tabelaSelecionada?.contrata_reduzida_50 && (
                    <option value="Reduzida 50%">Reduzida 50%</option>
                  )}
                </select>
              </div>

              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className={p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"}
                    onClick={() => p.setSeguroPrest(true)}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    className={!p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"}
                    onClick={() => p.setSeguroPrest(false)}
                  >
                    Não
                  </Button>
                </div>
              </div>

              {p.tabelaSelecionada && (
                <div className="md:col-span-4 grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                  <div>% Taxa de Adm: <strong>{pctHuman(p.tabelaSelecionada.taxa_adm_pct)}</strong></div>
                  <div>% Fundo Reserva: <strong>{pctHuman(p.tabelaSelecionada.fundo_reserva_pct)}</strong></div>
                  <div>% Antecipação: <strong>{pctHuman(p.tabelaSelecionada.antecip_pct)}</strong> • Parcelas: <strong>{p.tabelaSelecionada.antecip_parcelas}</strong></div>
                  <div>Limitador de Parcela: <strong>{pctHuman(resolveLimitadorPct(p.tabelaSelecionada.limitador_parcela_pct, p.tabelaSelecionada.segmento, p.credito || 0))}</strong></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ÍNDICES (chips + overlay de edição manual) */}
          <Card>
            <CardHeader><CardTitle>Índice (12m) — Manual</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  active={p.indiceSel === "IPCA"}
                  label={`IPCA • ${(p.ipca12 * 100).toFixed(2)}%`}
                  onClick={() => p.setIndiceSel("IPCA")}
                />
                <Chip
                  active={p.indiceSel === "INCC"}
                  label={`INCC • ${(p.incc12 * 100).toFixed(2)}%`}
                  onClick={() => p.setIndiceSel("INCC")}
                />
                <Chip
                  active={p.indiceSel === "IGP-M"}
                  label={`IGP-M • ${(p.igpm12 * 100).toFixed(2)}%`}
                  onClick={() => p.setIndiceSel("IGP-M")}
                />
                <Button variant="secondary" size="sm" onClick={() => p.setOverlayIndices(true)}>
                  Editar índices
                </Button>
              </div>
              {p.overlayIndices && (
                <ModalBase title="Editar Índices (12 meses)" onClose={() => p.setOverlayIndices(false)}>
                  <div className="p-4 grid gap-3 md:grid-cols-3">
                    <div>
                      <Label>IPCA (12m)</Label>
                      <PercentInput valueDecimal={p.ipca12} onChangeDecimal={p.setIpca12} />
                    </div>
                    <div>
                      <Label>INCC (12m)</Label>
                      <PercentInput valueDecimal={p.incc12} onChangeDecimal={p.setIncc12} />
                    </div>
                    <div>
                      <Label>IGP-M (12m)</Label>
                      <PercentInput valueDecimal={p.igpm12} onChangeDecimal={p.setIgpm12} />
                    </div>
                    <div className="md:col-span-3 flex justify-end gap-2">
                      <Button onClick={() => p.setOverlayIndices(false)}>Fechar</Button>
                    </div>
                  </div>
                </ModalBase>
              )}
            </CardContent>
          </Card>

          {/* Até a contemplação */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento até a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>
                  {p.tabelaSelecionada?.antecip_parcelas === 2
                    ? "Parcelas 1 e 2"
                    : p.tabelaSelecionada?.antecip_parcelas === 1
                    ? "Parcela 1"
                    : "Parcela Inicial"}
                </Label>
                <Input
                  value={
                    p.calc
                      ? brMoney(p.calc.parcelaPreSemSeguro + (p.tabelaSelecionada?.antecip_parcelas ? p.calc.antecada : 0) + p.calc.seguroMensal)
                      : ""
                  }
                  readOnly
                />
              </div>
              <div>
                <Label>Demais Parcelas</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.parcelaPreSemSeguro + p.calc.seguroMensal) : ""}
                  readOnly
                />
              </div>
            </CardContent>
          </Card>

          {/* Lances */}
          <Card>
            <CardHeader><CardTitle>Configurações do Lance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado (%)</Label>
                <PercentInput valueDecimal={p.lanceOfertPct} onChangeDecimal={p.setLanceOfertPct} />
              </div>
              <div>
                <Label>Lance Embutido (%)</Label>
                <PercentInput
                  valueDecimal={p.lanceEmbutPct}
                  onChangeDecimal={(d) => {
                    if (d > 0.25) {
                      alert("Lance embutido limitado a 25,0000% do crédito. Voltando para 25%.");
                      p.setLanceEmbutPct(0.25);
                    } else {
                      p.setLanceEmbutPct(d);
                    }
                  }}
                  maxDecimal={0.25}
                />
              </div>
              <div>
                <Label>Parcela da Contemplação</Label>
                <Input
                  type="number"
                  value={p.parcContemplacao}
                  onChange={(e) => p.setParcContemplacao(Math.max(1, Number(e.target.value)))}
                />
                <p className="text-xs text-muted-foreground mt-1">Deve ser menor que o Prazo da Venda.</p>
              </div>
            </CardContent>
          </Card>

          {/* Pós */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento após a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado</Label><Input value={p.calc ? brMoney(p.calc.lanceOfertado) : ""} readOnly /></div>
              <div><Label>Lance Embutido</Label><Input value={p.calc ? brMoney(p.calc.lanceEmbutido) : ""} readOnly /></div>
              <div><Label>Novo Crédito</Label><Input value={p.calc ? brMoney(p.calc.novoCredito) : ""} readOnly /></div>

              <div><Label>Nova Parcela (sem limite)</Label><Input value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""} readOnly /></div>
              <div><Label>Parcela Limitante</Label><Input value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""} readOnly /></div>
              <div><Label>Parcela Escolhida</Label><Input value={p.calc ? brMoney(p.calc.parcelaEscolhidaSemSeguro) : ""} readOnly /></div>

              <div><Label>Parcela Escolhida (c/ seguro)</Label><Input value={p.calc ? brMoney(p.calc.parcelaEscolhidaComSeguro) : ""} readOnly /></div>
              <div><Label>Prazo Restante (meses)</Label><Input value={p.calc ? String(p.calc.prazoRestante) : ""} readOnly /></div>
            </CardContent>
          </Card>

          {/* Extrato em tela + PDF */}
          <ExtratoBox
            extrato={p.calc?.extrato || []}
            indiceSel={p.indiceSel}
            indice12m={p.indiceSel === "IPCA" ? p.ipca12 : p.indiceSel === "INCC" ? p.incc12 : p.igpm12}
            segmento={p.tabelaSelecionada?.segmento || ""}
            tabelaNome={p.tabelaSelecionada?.nome_tabela || ""}
            credito={p.credito}
            forma={p.forma}
            prazoVenda={p.prazoVenda}
            parcContemplacao={p.parcContemplacao}
            userName={p.userName}
            userPhone={p.userPhone}
            leadNome={p.leadInfo?.nome || ""}
            leadTel={p.leadInfo?.telefone || ""}
          />
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Selecione um lead para abrir o simulador.</div>
      )}
    </div>
  );
}
/* =============== Extrato (tela + PDF) ================= */
function CenteredHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-center font-semibold tracking-wide">{children}</div>;
}

function ExtratoBox({
  extrato,
  indiceSel,
  indice12m,
  segmento,
  tabelaNome,
  credito,
  forma,
  prazoVenda,
  parcContemplacao,
  userName,
  userPhone,
  leadNome,
  leadTel,
}: {
  extrato: ExtratoLinha[];
  indiceSel: "IPCA" | "INCC" | "IGP-M";
  indice12m: number;
  segmento: string;
  tabelaNome: string;
  credito: number;
  forma: FormaContratacao;
  prazoVenda: number;
  parcContemplacao: number;
  userName: string;
  userPhone: string;
  leadNome: string;
  leadTel: string | null | undefined;
}) {
  function gerarPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" }); // um doc por chamada

    // Logo topo (proporção correta)
    const pageWidth = doc.internal.pageSize.getWidth();
    try {
      // Se o projeto servir a imagem em /public/logo-consulmax.png
      // Algumas instalações do jsPDF precisam de base64; aqui vamos tentar com HTML image
      // Para garantir, desenhamos um título mesmo sem imagem.
      // (Caso queira converter para base64, basta carregar e usar addImage(base64, "PNG", ...))
      // Usaremos apenas o título centralizado para robustez
    } catch {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("EXTRATO DE SIMULAÇÃO", pageWidth / 2, 40, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Cabeçalhos (centralizados)
    const headerYStart = 70;

    const linha = (label: string) => doc.text(label, pageWidth / 2, currentY, { align: "center" });
    let currentY = headerYStart;

    doc.setFont("helvetica", "bold");
    linha("-------------- DADOS DA CORRETORA ---------------------");
    doc.setFont("helvetica", "normal");
    currentY += 14;
    linha(`Corretora: Consulmax | CNPJ | Telefone: (11) 0000-0000 | Administradora: Embracon`);
    currentY += 14;
    linha(`Usuário: ${userName || "-"} | Telefone/Whats: ${formatPhoneBR(userPhone) || "-"}`);

    currentY += 20;
    doc.setFont("helvetica", "bold");
    linha("-------------- DADOS DO CLIENTE ---------------------");
    doc.setFont("helvetica", "normal");
    currentY += 14;
    linha(`Nome: ${leadNome || "-"} | Telefone: ${leadTel ? formatPhoneBR(leadTel) : "-"}`);

    currentY += 20;
    doc.setFont("helvetica", "bold");
    linha("-------------- DADOS DA SIMULAÇÃO ---------------------");
    doc.setFont("helvetica", "normal");
    currentY += 14;
    linha(`Segmento: ${segmento || "-"} | Tabela: ${tabelaNome || "-"}`);
    currentY += 14;
    linha(`Crédito: ${brMoney(credito)} | Forma: ${forma} | Prazo: ${prazoVenda} meses | Contemplação: ${parcContemplacao}`);
    currentY += 14;
    linha(`Índice: ${indiceSel} (${(indice12m * 100).toFixed(2)}% em 12m)`);

    currentY += 16;

    // Tabela
    autoTable(doc, {
      startY: currentY,
      headStyles: { fillColor: [240, 240, 240] },
      head: [["Parcela", "Crédito", "Valor Pago", "Reajuste", "Saldo Devedor", "Investimento", "Evento"]],
      body: extrato.map((l) => [
        String(l.parcela),
        brMoney(l.creditoMes),
        brMoney(l.valorPago),
        l.reajuste ? brMoney(l.reajuste) : "-",
        brMoney(l.saldoDevedor),
        brMoney(l.investimento),
        l.evento || "-",
      ]),
      styles: { font: "helvetica", fontSize: 9 },
      theme: "grid",
      margin: { left: 32, right: 32 },
    });

    doc.save("extrato-simulacao.pdf");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extrato (tela + PDF)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Cabeçalho centralizado (tela) */}
        <div className="space-y-2">
          <CenteredHeader>-------------- DADOS DA CORRETORA ---------------------</CenteredHeader>
          <div className="text-center text-sm">
            Corretora: Consulmax | CNPJ | Telefone: (11) 0000-0000 | Administradora: Embracon
          </div>
          <div className="text-center text-sm">
            Usuário: {userName || "-"} | Telefone/Whats: {formatPhoneBR(userPhone) || "-"}
          </div>

          <CenteredHeader>-------------- DADOS DO CLIENTE ---------------------</CenteredHeader>
          <div className="text-center text-sm">
            Nome: {leadNome || "-"} | Telefone: {leadTel ? formatPhoneBR(leadTel) : "-"}
          </div>

          <CenteredHeader>-------------- DADOS DA SIMULAÇÃO ---------------------</CenteredHeader>
          <div className="text-center text-sm">
            Segmento: {segmento || "-"} | Tabela: {tabelaNome || "-"}
          </div>
          <div className="text-center text-sm">
            Crédito: {brMoney(credito)} | Forma: {forma} | Prazo: {prazoVenda} meses | Contemplação: {parcContemplacao}
          </div>
          <div className="text-center text-sm">
            Índice: {indiceSel} ({(indice12m * 100).toFixed(2)}% 12m)
          </div>
        </div>

        {/* Tabela simples em tela */}
        <div className="overflow-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Parcela</th>
                <th className="p-2 text-left">Crédito</th>
                <th className="p-2 text-left">Valor Pago</th>
                <th className="p-2 text-left">Reajuste</th>
                <th className="p-2 text-left">Saldo Devedor</th>
                <th className="p-2 text-left">Investimento</th>
                <th className="p-2 text-left">Evento</th>
              </tr>
            </thead>
            <tbody>
              {extrato.map((l) => (
                <tr key={l.parcela} className="border-t">
                  <td className="p-2">{l.parcela}</td>
                  <td className="p-2">{brMoney(l.creditoMes)}</td>
                  <td className="p-2">{brMoney(l.valorPago)}</td>
                  <td className="p-2">{l.reajuste ? brMoney(l.reajuste) : "-"}</td>
                  <td className="p-2">{brMoney(l.saldoDevedor)}</td>
                  <td className="p-2">{brMoney(l.investimento)}</td>
                  <td className="p-2">{l.evento || "-"}</td>
                </tr>
              ))}
              {extrato.length === 0 && (
                <tr><td className="p-3 text-center text-muted-foreground" colSpan={7}>Preencha os campos e calcule para ver o extrato.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end">
          <Button onClick={gerarPDF} disabled={extrato.length === 0}>
            Gerar Extrato / PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* =============== Modal: base com ESC para fechar =============== */
function ModalBase({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============== Modal: Gerenciar Tabelas (igual ao seu, mantido) ============== */
function TableManagerModal({
  admin,
  allTables,
  onClose,
  onCreatedOrUpdated,
  onDeleted,
}: {
  admin: Admin;
  allTables: SimTable[];
  onClose: () => void;
  onCreatedOrUpdated: (t: SimTable) => void;
  onDeleted: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SimTable | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => setPage(1), [allTables.length]);

  const grouped = useMemo(() => {
    return [...allTables].sort((a, b) => {
      const sa = (a.segmento + a.nome_tabela + String(a.prazo_limite)).toLowerCase();
      const sb = (b.segmento + b.nome_tabela + String(b.prazo_limite)).toLowerCase();
      return sa.localeCompare(sb);
    });
  }, [allTables]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / pageSize));
  const pageItems = useMemo(() => grouped.slice((page - 1) * pageSize, page * pageSize), [grouped, page]);

  async function deletar(id: string) {
    if (!confirm("Confirmar exclusão desta tabela? (As simulações vinculadas a ela também serão excluídas)")) return;
    setBusyId(id);

    const delSims = await supabase.from("sim_simulations").delete().eq("table_id", id);
    if (delSims.error) {
      setBusyId(null);
      alert("Erro ao excluir simulações vinculadas: " + delSims.error.message);
      return;
    }

    const { error } = await supabase.from("sim_tables").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    onDeleted(id);
  }

  return (
    <ModalBase onClose={onClose} title="Gerenciador de Tabelas">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">Admin ativa: <strong>{admin.name}</strong></div>
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="h-10 rounded-2xl px-4">
            <Plus className="h-4 w-4 mr-1" /> Nova Tabela
          </Button>
        </div>

        <div className="overflow-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Segmento</th>
                <th className="text-left p-2">Tabela</th>
                <th className="text-left p-2">Prazo</th>
                <th className="text-left p-2">% Adm</th>
                <th className="text-left p-2">% FR</th>
                <th className="text-left p-2">% Antecip</th>
                <th className="text-left p-2">Parc Ant.</th>
                <th className="text-left p-2">% Limite</th>
                <th className="text-left p-2">% Seguro</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">{t.segmento}</td>
                  <td className="p-2">{t.nome_tabela}</td>
                  <td className="p-2">{t.prazo_limite}</td>
                  <td className="p-2">{pctHuman(t.taxa_adm_pct)}</td>
                  <td className="p-2">{pctHuman(t.fundo_reserva_pct)}</td>
                  <td className="p-2">{pctHuman(t.antecip_pct)}</td>
                  <td className="p-2">{t.antecip_parcelas}</td>
                  <td className="p-2">{pctHuman(t.limitador_parcela_pct)}</td>
                  <td className="p-2">{pctHuman(t.seguro_prest_pct)}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setEditing(t); setShowForm(true); }} className="h-9 rounded-xl px-3">
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button variant="destructive" size="sm" disabled={busyId === t.id} onClick={() => deletar(t.id)} className="h-9 rounded-xl px-3">
                        {busyId === t.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-muted-foreground">Sem tabelas para esta administradora.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3 text-sm">
          <div>
            {grouped.length > 0 && (
              <>
                Mostrando <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, grouped.length)}</strong> de <strong>{grouped.length}</strong>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="h-9 rounded-xl px-3" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            <span>Página {page} de {totalPages}</span>
            <Button variant="secondary" className="h-9 rounded-xl px-3" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima</Button>
          </div>
        </div>
      </div>

      {showForm && (
        <TableFormOverlay
          adminId={admin.id}
          initial={editing || undefined}
          onClose={() => setShowForm(false)}
          onSaved={(t) => { onCreatedOrUpdated(t); setShowForm(false); }}
        />
      )}
    </ModalBase>
  );
}

/* ===== Overlay de Formulário (Novo / Editar) de Tabela ==== */
function TableFormOverlay({
  adminId,
  initial,
  onSaved,
  onClose,
}: {
  adminId: string;
  initial?: SimTable;
  onSaved: (t: SimTable) => void;
  onClose: () => void;
}) {
  const [segmento, setSegmento] = useState(initial?.segmento || "Imóvel Estendido");
  const [nome, setNome] = useState(initial?.nome_tabela || "Select Estendido");
  const [faixaMin, setFaixaMin] = useState(initial?.faixa_min ?? 120000);
  const [faixaMax, setFaixaMax] = useState(initial?.faixa_max ?? 1200000);
  const [prazoLimite, setPrazoLimite] = useState(initial?.prazo_limite ?? 240);

  const [taxaAdmHuman, setTaxaAdmHuman] = useState(formatPctInputFromDecimal(initial?.taxa_adm_pct ?? 0.22));
  const [frHuman, setFrHuman] = useState(formatPctInputFromDecimal(initial?.fundo_reserva_pct ?? 0.02));
  const [antecipHuman, setAntecipHuman] = useState(formatPctInputFromDecimal(initial?.antecip_pct ?? 0.02));
  const [antecipParcelas, setAntecipParcelas] = useState(initial?.antecip_parcelas ?? 1);
  const [limHuman, setLimHuman] = useState(formatPctInputFromDecimal(initial?.limitador_parcela_pct ?? 0.002565));
  const [seguroHuman, setSeguroHuman] = useState(formatPctInputFromDecimal(initial?.seguro_prest_pct ?? 0.00061));

  const [perEmbutido, setPerEmbutido] = useState(initial?.permite_lance_embutido ?? true);
  const [perFixo25, setPerFixo25] = useState(initial?.permite_lance_fixo_25 ?? true);
  const [perFixo50, setPerFixo50] = useState(initial?.permite_lance_fixo_50 ?? true);
  const [perLivre, setPerLivre] = useState(initial?.permite_lance_livre ?? true);

  const [cParcelaCheia, setCParcelaCheia] = useState(initial?.contrata_parcela_cheia ?? true);
  const [cRed25, setCRed25] = useState(initial?.contrata_reduzida_25 ?? true);
  const [cRed50, setCRed50] = useState(initial?.contrata_reduzida_50 ?? true);
  const [indices, setIndices] = useState((initial?.indice_correcao || ["IPCA"]).join(", "));

  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    const payload: Omit<SimTable, "id"> = {
      admin_id: adminId,
      segmento,
      nome_tabela: nome,
      faixa_min: Number(faixaMin) || 0,
      faixa_max: Number(faixaMax) || 0,
      prazo_limite: Number(prazoLimite) || 0,
      taxa_adm_pct: parsePctInputToDecimal(taxaAdmHuman),
      fundo_reserva_pct: parsePctInputToDecimal(frHuman),
      antecip_pct: parsePctInputToDecimal(antecipHuman),
      antecip_parcelas: Number(antecipParcelas) || 0,
      limitador_parcela_pct: parsePctInputToDecimal(limHuman),
      seguro_prest_pct: parsePctInputToDecimal(seguroHuman),
      permite_lance_embutido: perEmbutido,
      permite_lance_fixo_25: perFixo25,
      permite_lance_fixo_50: perFixo50,
      permite_lance_livre: perLivre,
      contrata_parcela_cheia: cParcelaCheia,
      contrata_reduzida_25: cRed25,
      contrata_reduzida_50: cRed50,
      indice_correcao: indices.split(",").map((s) => s.trim()).filter(Boolean),
    };

    let res;
    if (initial) {
      res = await supabase.from("sim_tables").update(payload).eq("id", initial.id).select("*").single();
    } else {
      res = await supabase.from("sim_tables").insert(payload).select("*").single();
    }
    setSaving(false);
    if (res.error) { alert("Erro ao salvar tabela: " + res.error.message); return; }
    onSaved(res.data as SimTable);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">{initial ? "Editar Tabela" : "Nova Tabela"}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 grid gap-3 md:grid-cols-4">
          <div><Label>Segmento</Label><Input value={segmento} onChange={(e) => setSegmento(e.target.value)} /></div>
          <div><Label>Nome da Tabela</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label>Faixa (mín)</Label><Input type="number" value={faixaMin} onChange={(e) => setFaixaMin(Number(e.target.value))} /></div>
          <div><Label>Faixa (máx)</Label><Input type="number" value={faixaMax} onChange={(e) => setFaixaMax(Number(e.target.value))} /></div>
          <div><Label>Prazo Limite (meses)</Label><Input type="number" value={prazoLimite} onChange={(e) => setPrazoLimite(Number(e.target.value))} /></div>

          <div><Label>% Taxa Adm</Label><Input value={taxaAdmHuman} onChange={(e) => setTaxaAdmHuman(e.target.value)} /></div>
          <div><Label>% Fundo Reserva</Label><Input value={frHuman} onChange={(e) => setFrHuman(e.target.value)} /></div>
          <div><Label>% Antecipação da Adm</Label><Input value={antecipHuman} onChange={(e) => setAntecipHuman(e.target.value)} /></div>
          <div><Label>Parcelas da Antecipação</Label><Input type="number" value={antecipParcelas} onChange={(e) => setAntecipParcelas(Number(e.target.value))} /></div>

          <div><Label>% Limitador Parcela</Label><Input value={limHuman} onChange={(e) => setLimHuman(e.target.value)} /></div>
          <div><Label>% Seguro por parcela</Label><Input value={seguroHuman} onChange={(e) => setSeguroHuman(e.target.value)} /></div>

          <div className="col-span-2">
            <Label>Lances Permitidos</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={perEmbutido} onChange={(e) => setPerEmbutido(e.target.checked)} />Embutido</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo25} onChange={(e) => setPerFixo25(e.target.checked)} />Fixo 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perFixo50} onChange={(e) => setPerFixo50(e.target.checked)} />Fixo 50%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perLivre} onChange={(e) => setPerLivre(e.target.checked)} />Livre</label>
            </div>
          </div>

          <div className="col-span-2">
            <Label>Formas de Contratação</Label>
            <div className="flex gap-4 mt-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={cParcelaCheia} onChange={(e) => setCParcelaCheia(e.target.checked)} />Parcela Cheia</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed25} onChange={(e) => setCRed25(e.target.checked)} />Reduzida 25%</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={cRed50} onChange={(e) => setCRed50(e.target.checked)} />Reduzida 50%</label>
            </div>
          </div>

          <div className="md:col-span-4">
            <Label>Índice de Correção (separar por vírgula)</Label>
            <Input value={indices} onChange={(e) => setIndices(e.target.value)} placeholder="IPCA, INCC, IGP-M" />
          </div>

          <div className="md:col-span-4 flex gap-2">
            <Button onClick={salvar} disabled={saving} className="h-10 rounded-2xl px-4">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {initial ? "Salvar alterações" : "Salvar Tabela"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={saving} className="h-10 rounded-2xl px-4">
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
