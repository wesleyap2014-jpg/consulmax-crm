// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";

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
  taxa_adm_pct: number;     // decimal (ex.: 0.22)
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
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pctHuman = (d: number) => (d * 100).toFixed(4) + "%";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatPhoneBR(s?: string) {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

/* ========= masks: money/percent (pt-BR) ========= */
const moneyToString = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const stringToMoney = (s: string) => {
  const cents = (s || "").replace(/\D/g, "");
  return (cents ? parseInt(cents, 10) : 0) / 100;
};

const decToPctString = (d: number) => (d * 100).toFixed(4).replace(".", ",");
const pctStringToDec = (s: string) => {
  const clean = (s || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(clean);
  return isNaN(v) ? 0 : v / 100;
};

function MoneyInput({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (n: number) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...rest}
      inputMode="numeric"
      className={`text-right ${rest.className || ""}`}
      value={moneyToString(value || 0)}
      onChange={(e) => onChange(stringToMoney(e.target.value))}
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
  return (
    <div className="flex items-center gap-2">
      <Input
        {...rest}
        inputMode="decimal"
        className={`text-right ${rest.className || ""}`}
        value={decToPctString(valueDecimal || 0)}
        onChange={(e) => {
          let d = pctStringToDec(e.target.value);
          if (typeof maxDecimal === "number") d = clamp(d, 0, maxDecimal);
          onChangeDecimal(d);
        }}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
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
  lanceOfertPct: number;
  lanceEmbutPct: number;
  parcContemplacao: number;
};

function resolveLimitadorPct(basePct: number, segmento: string, credito: number) {
  const s = (segmento || "").toLowerCase();
  if (s.includes("moto") && credito >= 20000) return 0.01;
  return basePct;
}

function calcularSimulacao(i: CalcInput) {
  const {
    credito: C,
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
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const pagas = clamp(parcContemplacao, 0, prazo - 1);
  const restante = Math.max(1, prazo - pagas);

  const segLower = segmento.toLowerCase();
  const isServico = segLower.includes("serv");
  const isMoto = segLower.includes("moto");

  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);

  const valorCategoria = C * (1 + taxaAdmFull + frPct);

  const fundoComumFactor =
    forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;

  const baseMensalSemSeguro =
    (C * fundoComumFactor + C * TA_efetiva + C * frPct) / prazo;

  const seguroMensal = seguro ? valorCategoria * seguroPrestPct : 0;

  const antecipCada = antecipParcelas > 0 ? (C * antecipPct) / antecipParcelas : 0;

  const parcelaAte = baseMensalSemSeguro + (antecipParcelas ? antecipCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  const totalPagoSemSeguro =
    baseMensalSemSeguro * pagas + antecipCada * Math.min(pagas, antecipParcelas);

  const lanceOfertadoValor = C * lanceOfertPct;
  const lanceEmbutidoValor = C * lanceEmbutPct;
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  const saldoDevedorFinal = Math.max(
    0,
    valorCategoria - totalPagoSemSeguro - lanceOfertadoValor
  );

  const novaParcelaSemLimite = saldoDevedorFinal / restante;

  const limPct = resolveLimitadorPct(limitadorPct, segmento, C);
  const parcelaLimitante = limPct * valorCategoria;

  const manterParcela = isServico || (isMoto && C < 20000);

  let parcelaEscolhida = baseMensalSemSeguro; // sem seguro
  let aplicouLimitador = false;

  if (!manterParcela) {
    if (limPct > 0 && parcelaLimitante > novaParcelaSemLimite) {
      aplicouLimitador = true;
      parcelaEscolhida = parcelaLimitante;
    } else {
      parcelaEscolhida = novaParcelaSemLimite;
    }
  }

  const has2aAntecipDepois = antecipParcelas >= 2 && pagas === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois
    ? parcelaEscolhida + antecipCada
    : null;

  let novoPrazo: number;
  if (Math.abs(parcelaEscolhida - novaParcelaSemLimite) < 0.005 && !has2aAntecipDepois) {
    novoPrazo = restante;
  } else {
    let saldoProPrazo = saldoDevedorFinal;
    if (has2aAntecipDepois) saldoProPrazo = Math.max(0, saldoProPrazo - (parcelaEscolhida + antecipCada));
    novoPrazo = Math.max(1, Math.ceil(saldoProPrazo / parcelaEscolhida));
  }

  return {
    valorCategoria,
    parcelaAte,
    parcelaDemais,
    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct: novoCredito > 0 ? lanceProprioValor / novoCredito : 0,
    novoCredito,
    novaParcelaSemLimite,
    parcelaLimitante,
    parcelaEscolhida,
    saldoDevedorFinal,
    novoPrazo,
    TA_efetiva,
    fundoComumFactor,
    antecipAdicionalCada: antecipCada,
    segundaParcelaComAntecipacao,
    has2aAntecipDepois,
    aplicouLimitador,
  };
}

/* ========================= Página ======================== */
export default function Simuladores() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAdminId, setActiveAdminId] = useState<string | null>(null);

  // seleção
  const [leadId, setLeadId] = useState("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState("");

  const [segmento, setSegmento] = useState("");
  const [nomeTabela, setNomeTabela] = useState("");
  const [tabelaId, setTabelaId] = useState("");

  const [prazoAte, setPrazoAte] = useState(0);
  const [faixa, setFaixa] = useState<{ min: number; max: number } | null>(null);

  const [credito, setCredito] = useState(0);
  const [prazoVenda, setPrazoVenda] = useState(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState(false);

  const [lanceOfertPct, setLanceOfertPct] = useState(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState(0);
  const [parcContemplacao, setParcContemplacao] = useState(1);

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  const [userPhone, setUserPhone] = useState("");
  const [userName, setUserName] = useState("Usuário Logado");

  const [assembleia, setAssembleia] = useState("15/10");

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

  // usuário logado
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("name, phone")
        .eq("auth_user_id", uid)
        .maybeSingle();
      setUserPhone((data?.phone || "").toString());
      if (data?.name) setUserName(data.name);
    })();
  }, []);

  useEffect(() => {
    setLeadInfo(leads.find((x) => x.id === leadId) || null);
  }, [leadId, leads]);

  const adminTables = useMemo(
    () => tables.filter((t) => t.admin_id === activeAdminId),
    [tables, activeAdminId]
  );

  const nomesTabelaSegmento = useMemo(() => {
    const list = adminTables.filter((t) => (segmento ? t.segmento === segmento : true)).map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  const variantesDaTabela = useMemo(
    () => adminTables.filter((t) => t.segmento === segmento && t.nome_tabela === nomeTabela),
    [adminTables, segmento, nomeTabela]
  );

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

  const prazoAviso =
    prazoVenda > 0 && prazoAte > 0 && prazoVenda > prazoAte
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular =
    !!tabelaSelecionada && credito > 0 && prazoVenda > 0 && parcContemplacao > 0 && parcContemplacao < prazoVenda;

  // cálculo
  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }
    setCalc(
      calcularSimulacao({
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
        lanceOfertPct,
        lanceEmbutPct: clamp(lanceEmbutPct, 0, 0.25),
        parcContemplacao,
      })
    );
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
    podeCalcular,
  ]);

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
      lance_embutido_pct: clamp(lanceEmbutPct, 0, 0.25),
      parcela_contemplacao: parcContemplacao,
      valor_categoria: calc.valorCategoria,
      parcela_ate_1_ou_2: calc.parcelaAte,
      parcela_demais: calc.parcelaDemais,
      lance_ofertado_valor: calc.lanceOfertadoValor,
      lance_embutido_valor: calc.lanceEmbutidoValor,
      lance_proprio_valor: calc.lanceProprioValor,
      lance_percebido_pct: calc.lancePercebidoPct,
      novo_credito: calc.novoCredito,
      nova_parcela_sem_limite: calc.novaParcelaSemLimite,
      parcela_limitante: calc.parcelaLimitante,
      parcela_escolhida: calc.parcelaEscolhida,
      saldo_devedor_final: calc.saldoDevedorFinal,
      novo_prazo: calc.novoPrazo,
    };
    const { data, error } = await supabase.from("sim_simulations").insert(payload).select("code").single();
    setSalvando(false);
    if (error) return alert("Erro ao salvar simulação: " + error.message);
    setSimCode(data?.code ?? null);
  }
  /* =================== Resumos copiáveis =================== */
  const resumoTexto = useMemo(() => {
    if (!tabelaSelecionada || !calc || !podeCalcular) return "";
    const segLower = (segmento || tabelaSelecionada.segmento || "").toLowerCase();
    const bem = segLower.includes("imó")
      ? "imóvel"
      : segLower.includes("serv")
      ? "serviço"
      : segLower.includes("moto")
      ? "motocicleta"
      : "veículo";

    const primeiraParcelaLabel =
      tabelaSelecionada.antecip_parcelas === 2
        ? "Parcelas 1 e 2"
        : tabelaSelecionada.antecip_parcelas === 1
        ? "Parcela 1"
        : "Parcela inicial";

    const segunda =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? ` (2ª com antecipação: ${brMoney(calc.segundaParcelaComAntecipacao)})`
        : "";

    const wa = `https://wa.me/${(userPhone || "").replace(/\D/g, "")}`;

    return `🎯 Com a estratégia certa, você conquista seu ${bem} sem pagar juros, sem entrada e ainda economiza!

📌 Simulação real:

💰 Crédito contratado: ${brMoney(credito)}
💳 ${primeiraParcelaLabel}: ${brMoney(calc.parcelaAte)} (1ª em até 3x no cartão)
💵 Demais até a contemplação: ${brMoney(calc.parcelaDemais)}
📈 Após a contemplação (prevista no mês ${parcContemplacao}):
🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}
✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}
📆 Parcelas: ${brMoney(calc.parcelaEscolhida)}${segunda}
⏳ Prazo restante: ${calc.novoPrazo} meses

👉 Quer simular com outro valor?
${wa}`;
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone]);

  const propostaTexto = useMemo(() => {
    if (!calc || !podeCalcular) return "";
    const segBase = segmento || tabelaSelecionada?.segmento || "Automóvel";
    const s = segBase.toLowerCase();
    const emoji = s.includes("imó") ? "🏠" : s.includes("moto") ? "🏍️" : s.includes("serv") ? "✈️" : "🚗";
    const linhaParc2 =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? `\n💰 Parcela 2: ${brMoney(calc.segundaParcelaComAntecipacao)} (com antecipação)`
        : "";
    const grupoTxt = grupo || "—";
    const zap = formatPhoneBR(userPhone);

    return `🚨OPORTUNIDADE 🚨

🔥 PROPOSTA EMBRACON🔥

Proposta ${segBase}
${emoji} Crédito: ${brMoney(calc.novoCredito)}
💰 Parcela 1: ${brMoney(calc.parcelaAte)} (em até 3x no cartão)${linhaParc2}
📆 + ${calc.novoPrazo}x de ${brMoney(calc.parcelaEscolhida)}
💵 Lance Próprio: ${brMoney(calc.lanceProprioValor)}
📢 Grupo: ${grupoTxt}

Assembleia ${assembleia}
📲 Fale comigo: ${zap}

Vantagens
✅ Primeira parcela em até 3x no cartão
✅ Parcelas acessíveis
✅ Alta taxa de contemplação`;
  }, [calc, podeCalcular, segmento, tabelaSelecionada, grupo, assembleia, userPhone]);

  async function copiar(txt: string) {
    try {
      await navigator.clipboard.writeText(txt);
      alert("Copiado!");
    } catch {
      alert("Não foi possível copiar.");
    }
  }

  /* ======================= Extrato/PDF ===================== */
  function buildExtratoHtml() {
    if (!tabelaSelecionada || !calc) return "<p>Preencha a simulação.</p>";

    const admin = admins.find((a) => a.id === activeAdminId);
    const adminName = admin?.name || "—";

    const corretoraNome = "Consulmax Consórcios e Investimentos";
    const cnpj = "57.942.043/0001-03";
    const telFixo = "(69) 9 9302-9380";

    const blocoTitulo = (t: string) =>
      `<div class="section-title">-------------- ${t} ---------------------</div>`;

    const linhasSim =
`Segmento: ${tabelaSelecionada.segmento.toUpperCase()}

% Taxa de Adm: ${pctHuman(tabelaSelecionada.taxa_adm_pct)} | Valor da Taxa de Adm: ${brMoney(credito * tabelaSelecionada.taxa_adm_pct)}
% Fundo Reserva: ${pctHuman(tabelaSelecionada.fundo_reserva_pct)} | Valor do Fundo Reserva: ${brMoney(credito * tabelaSelecionada.fundo_reserva_pct)}
% Antecipação: ${pctHuman(tabelaSelecionada.antecip_pct)} | Valor da antecipação da taxa de adm: ${brMoney(credito * tabelaSelecionada.antecip_pct)}
% Do limitador de Parcela: ${pctHuman(resolveLimitadorPct(tabelaSelecionada.limitador_parcela_pct, tabelaSelecionada.segmento, credito))}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Extrato de Simulação</title>
<style>
  @media print { @page { margin: 18mm; } }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; }
  .head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
  .brand img { height:44px; width:auto; object-fit:contain; }
  .title { font-size:22px; font-weight:600; color:#111; text-align:right; }
  .section-title { text-align:center; font-weight:600; margin:22px 0 10px; }
  .box { background:#fafafa; border:1px solid #eee; border-radius:10px; padding:14px 16px; }
  .mono { white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace; font-size:13px; line-height:1.6; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand"><img src="/logo-consulmax.png" alt="Consulmax"/></div>
    <div class="title">Extrato de Simulação</div>
  </div>

  ${blocoTitulo("DADOS DA CORRETORA")}
  <div class="box mono">
Corretora: ${corretoraNome} | CNPJ: ${cnpj} | Telefone: ${telFixo} | Administradora: ${adminName}

Usuário: ${userName} | Telefone/Whats: ${formatPhoneBR(userPhone)}
  </div>

  ${blocoTitulo("DADOS DO CLIENTE")}
  <div class="box mono">
Nome: ${leadInfo?.nome || "—"} | Telefone: ${leadInfo?.telefone || "—"}
  </div>

  ${blocoTitulo("DADOS DA SIMULAÇÃO")}
  <div class="box mono">${linhasSim}</div>
</body>
</html>`;
  }

  function abrirExtrato() {
    if (!calc || !tabelaSelecionada) {
      alert("Preencha a simulação para gerar o extrato.");
      return;
    }
    const html = buildExtratoHtml();
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
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
      {/* topo: admins */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {admins.map((a) => (
            <Button
              key={a.id}
              variant={activeAdminId === a.id ? "default" : "secondary"}
              onClick={() => setActiveAdminId(a.id)}
              className="h-10 rounded-2xl px-4"
            >
              {a.name}
            </Button>
          ))}
        </div>
      </div>

      {/* layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* esquerda */}
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader><CardTitle>Simuladores</CardTitle></CardHeader>
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

          {/* ações principais */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!calc || salvando} onClick={salvarSimulacao} className="h-10 rounded-2xl px-4">
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            <Button variant="secondary" onClick={abrirExtrato} disabled={!calc} className="h-10 rounded-2xl px-4">
              Gerar Extrato / PDF
            </Button>
            {simCode && <span className="text-sm">✅ Salvo como <strong>#{simCode}</strong></span>}
          </div>
        </div>

        {/* direita */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Memória de Cálculo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">Selecione uma tabela.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div><div className="text-right font-medium">{brMoney(credito || 0)}</div>
                    <div>Prazo da Venda</div><div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div><div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div>
                    <div className="text-right">
                      {seguroPrest ? pctHuman(tabelaSelecionada.seguro_prest_pct) : "—"}
                    </div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Fundo Comum (fator)</div>
                    <div className="text-right">{calc ? (calc.fundoComumFactor * 100).toFixed(0) + "%" : "—"}</div>
                    <div>Taxa Adm (total)</div><div className="text-right">{pctHuman(tabelaSelecionada.taxa_adm_pct)}</div>
                    <div>TA efetiva</div><div className="text-right">{calc ? pctHuman(calc.TA_efetiva) : "—"}</div>
                    <div>Fundo Reserva</div><div className="text-right">{pctHuman(tabelaSelecionada.fundo_reserva_pct)}</div>
                    <div>Antecipação Adm</div>
                    <div className="text-right">{pctHuman(tabelaSelecionada.antecip_pct)} • {tabelaSelecionada.antecip_parcelas}x</div>
                    <div>Limitador Parcela</div>
                    <div className="text-right">
                      {pctHuman(resolveLimitadorPct(tabelaSelecionada.limitador_parcela_pct, tabelaSelecionada.segmento, credito || 0))}
                    </div>
                    <div>Valor de Categoria</div><div className="text-right">{calc ? brMoney(calc.valorCategoria) : "—"}</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Resumo da Proposta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea className="w-full h-64 border rounded-md p-3 text-sm leading-relaxed" readOnly value={resumoTexto} />
              <div className="flex items-center justify-end"><Button onClick={() => copiar(resumoTexto)} disabled={!resumoTexto}>Copiar</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Texto: Oportunidade / Proposta Embracon</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Assembleia</Label>
                <Input value={assembleia} onChange={(e) => setAssembleia(e.target.value)} placeholder="dd/mm" />
              </div>
              <textarea className="w-full h-72 border rounded-md p-3 text-sm leading-relaxed" readOnly value={propostaTexto} />
              <div className="flex items-center justify-end"><Button onClick={() => copiar(propostaTexto)} disabled={!propostaTexto}>Copiar</Button></div>
            </CardContent>
          </Card>
        </div>
      </div>
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
  calc: ReturnType<typeof calcularSimulacao> | null;
  salvar: () => Promise<void>;
  salvando: boolean;
  simCode: number | null;
};

function EmbraconSimulator(p: EmbraconProps) {
  return (
    <div className="space-y-6">
      {/* Lead */}
      <Card>
        <CardHeader><CardTitle>Embracon</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Selecionar Lead</Label>
              <select className="w-full h-10 border rounded-md px-3" value={p.leadId} onChange={(e) => p.setLeadId(e.target.value)}>
                <option value="">Escolha um lead</option>
                {p.leads.map((l) => (<option key={l.id} value={l.id}>{l.nome}</option>))}
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

      {/* Configurações do Plano */}
      {p.leadId ? (
        <>
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Segmento</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.segmento} onChange={(e) => p.setSegmento(e.target.value)}>
                  <option value="">Selecione o segmento</option>
                  {Array.from(new Set(p.adminTables.map((t) => t.segmento))).map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div>
                <Label>Tabela</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.nomeTabela} disabled={!p.segmento} onChange={(e) => p.setNomeTabela(e.target.value)}>
                  <option value="">{p.segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}</option>
                  {p.nomesTabelaSegmento.map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
              <div>
                <Label>Prazo Até</Label>
                <select className="w-full h-10 border rounded-md px-3" value={p.tabelaId} disabled={!p.nomeTabela} onChange={(e) => p.setTabelaId(e.target.value)}>
                  <option value="">{p.nomeTabela ? "Selecione o prazo" : "Selecione a tabela antes"}</option>
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

          {/* Configurações da Venda */}
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
                <select className="w-full h-10 border rounded-md px-3" value={p.forma} disabled={!p.tabelaSelecionada} onChange={(e) => p.setForma(e.target.value as any)}>
                  <option value="">Selecione</option>
                  {p.tabelaSelecionada?.contrata_parcela_cheia && <option value="Parcela Cheia">Parcela Cheia</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_25 && <option value="Reduzida 25%">Reduzida 25%</option>}
                  {p.tabelaSelecionada?.contrata_reduzida_50 && <option value="Reduzida 50%">Reduzida 50%</option>}
                </select>
              </div>
              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button type="button" className={p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted hover:bg-muted"} onClick={() => p.setSeguroPrest(true)}>Sim</Button>
                  <Button type="button" className={!p.seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted hover:bg-muted"} onClick={() => p.setSeguroPrest(false)}>Não</Button>
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

          {/* Até a contemplação */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento até a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>{p.tabelaSelecionada?.antecip_parcelas === 2 ? "Parcelas 1 e 2" : p.tabelaSelecionada?.antecip_parcelas === 1 ? "Parcela 1" : "Parcela Inicial"}</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaAte) : ""} readOnly />
              </div>
              <div>
                <Label>Demais Parcelas</Label>
                <Input value={p.calc ? brMoney(p.calc.parcelaDemais) : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Lance */}
          <Card>
            <CardHeader><CardTitle>Configurações do Lance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado (%)</Label>
                <PercentInput valueDecimal={p.lanceOfertPct} onChangeDecimal={p.setLanceOfertPct} />
              </div>
              <div>
                <Label>Lance Embutido (%)</Label>
                <PercentInput valueDecimal={p.lanceEmbutPct} onChangeDecimal={(d) => p.setLanceEmbutPct(Math.min(0.25, d))} maxDecimal={0.25} />
              </div>
              <div>
                <Label>Parcela da Contemplação</Label>
                <Input type="number" value={p.parcContemplacao} onChange={(e) => p.setParcContemplacao(Math.max(1, Number(e.target.value)))} />
                <p className="text-xs text-muted-foreground mt-1">Deve ser menor que o Prazo da Venda.</p>
              </div>
            </CardContent>
          </Card>

          {/* Após a contemplação */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento após a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado</Label><Input value={p.calc ? brMoney(p.calc.lanceOfertadoValor) : ""} readOnly /></div>
              <div><Label>Lance Embutido</Label><Input value={p.calc ? brMoney(p.calc.lanceEmbutidoValor) : ""} readOnly /></div>
              <div><Label>Lance Próprio</Label><Input value={p.calc ? brMoney(p.calc.lanceProprioValor) : ""} readOnly /></div>

              <div><Label>Lance Percebido (%)</Label><Input value={p.calc ? pctHuman(p.calc.lancePercebidoPct) : ""} readOnly /></div>
              <div><Label>Novo Crédito</Label><Input value={p.calc ? brMoney(p.calc.novoCredito) : ""} readOnly /></div>
              <div><Label>Nova Parcela (sem limite)</Label><Input value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""} readOnly /></div>

              <div><Label>Parcela Limitante</Label><Input value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""} readOnly /></div>
              <div><Label>Parcela Escolhida</Label><Input value={p.calc ? brMoney(p.calc.parcelaEscolhida) : ""} readOnly /></div>
              <div><Label>Novo Prazo (meses)</Label><Input value={p.calc ? String(p.calc.novoPrazo) : ""} readOnly /></div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="text-sm text-muted-foreground">Selecione um lead para iniciar.</CardContent></Card>
      )}
    </div>
  );
}
