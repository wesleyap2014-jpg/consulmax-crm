// src/pages/Simuladores.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

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
  if (segmento?.toLowerCase().includes("motocicleta") && credito >= 20000) return 0.01;
  return baseLimitadorPct;
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
  lanceEmbutPct: number; // <= 0.25
  parcContemplacao: number;
};

/** Regra alinhada com exemplos e:
 * - Serviços e Moto < 20k: não reduz parcela, só prazo
 * - tratamento “2ª parcela com antecipação”
 */
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
    lanceOfertPct,
    lanceEmbutPct,
    parcContemplacao,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const parcelasPagas = Math.max(0, Math.min(parcContemplacao, prazo));
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

  // Flags de categoria
  const segLower = (segmento || "").toLowerCase();
  const isServico = segLower.includes("serv");
  const isMoto = segLower.includes("moto");

  // TA efetiva (parte que vai para as parcelas mensais)
  const TA_efetiva = Math.max(0, taxaAdmFull - antecipPct);

  // Valor de categoria (base para saldo + limitador + seguro)
  const valorCategoria = C * (1 + taxaAdmFull + frPct);

  // Fator do Fundo Comum conforme contratação
  const fundoComumFactor =
    forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;

  // Parcela base (SEM seguro)
  const baseMensalSemSeguro =
    (C * fundoComumFactor + C * TA_efetiva + C * frPct) / prazo;

  // Seguro mensal (só soma na parcela, não abate saldo)
  const seguroMensal = seguro ? valorCategoria * i.seguroPrestPct : 0;

  // Antecipação (somada nas primeiras 1 ou 2 parcelas)
  const antecipAdicionalCada =
    antecipParcelas > 0 ? (C * antecipPct) / antecipParcelas : 0;

  // Exibição até a contemplação
  const parcelaAte =
    (baseMensalSemSeguro + (antecipParcelas > 0 ? antecipAdicionalCada : 0)) +
    seguroMensal;
  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  // TOTAL PAGO ATÉ A CONTEMPLAÇÃO (SEM seguro)
  const totalPagoSemSeguro =
    baseMensalSemSeguro * parcelasPagas +
    antecipAdicionalCada * Math.min(parcelasPagas, antecipParcelas);

  // Lances
  const lanceOfertadoValor = C * lanceOfertPct;
  const lanceEmbutidoValor = C * lanceEmbutPct;
  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);

  // SALDO DEVEDOR FINAL (valorCategoria - pagos - lance ofertado)
  const saldoDevedorFinal = Math.max(
    0,
    valorCategoria - totalPagoSemSeguro - lanceOfertadoValor
  );

  // NOVA PARCELA (sem limite) = saldo final / prazo restante (SEM seguro)
  const novaParcelaSemLimite = saldoDevedorFinal / prazoRestante;

  // LIMITADOR (sobre valor de categoria)
  const limitadorBase = resolveLimitadorPct(i.limitadorPct, segmento, C);
  const parcelaLimitante = limitadorBase > 0 ? valorCategoria * limitadorBase : 0;

  // Regras especiais: Serviços OU Moto < 20k => mantém parcela, recalcula apenas prazo
  const manterParcela = isServico || (isMoto && C < 20000);

  let aplicouLimitador = false;
  let parcelaEscolhida = baseMensalSemSeguro; // sempre sem seguro

  if (!manterParcela) {
    if (limitadorBase > 0 && parcelaLimitante > novaParcelaSemLimite) {
      aplicouLimitador = true;
      parcelaEscolhida = parcelaLimitante;
    } else {
      parcelaEscolhida = novaParcelaSemLimite;
    }
  }

  // Caso especial: antecipação em 2x e contemplação na 1ª parcela
  const has2aAntecipDepois = antecipParcelas >= 2 && parcContemplacao === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois
    ? parcelaEscolhida + antecipAdicionalCada
    : null;

  // NOVO PRAZO
  const parcelasIguais =
    Math.abs(parcelaEscolhida - novaParcelaSemLimite) < 0.005;

  let novoPrazo: number;
  if (parcelasIguais && !has2aAntecipDepois) {
    novoPrazo = prazoRestante;
  } else {
    let saldoParaPrazo = saldoDevedorFinal;
    if (has2aAntecipDepois) {
      saldoParaPrazo = Math.max(0, saldoParaPrazo - (parcelaEscolhida + antecipAdicionalCada));
    }
    novoPrazo = Math.max(1, Math.ceil(saldoParaPrazo / parcelaEscolhida));
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
    novaParcelaSemLimite, // (SEM seguro)
    parcelaLimitante,     // (SEM seguro)
    parcelaEscolhida,     // (SEM seguro)
    saldoDevedorFinal,
    novoPrazo,
    TA_efetiva,
    fundoComumFactor,
    antecipAdicionalCada,
    segundaParcelaComAntecipacao,
    has2aAntecipDepois,
    aplicouLimitador,
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

  const [mgrOpen, setMgrOpen] = useState(false); // overlay lista/edição

  // seleção Embracon
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

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacao> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [simCode, setSimCode] = useState<number | null>(null);

  // dados do usuário logado (para Resumo/WhatsApp/Foto)
  const [userPhone, setUserPhone] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

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

  // pega dados do usuário logado
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("users")
        .select("phone, avatar_url, name, whatsapp")
        .eq("auth_user_id", uid)
        .maybeSingle();
      const phone = (data?.whatsapp || data?.phone || "").toString();
      setUserPhone(phone);
      setUserAvatar((data as any)?.avatar_url || null);
      setUserName(((data as any)?.name || "").toString());
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
    setFaixa({
      min: tabelaSelecionada.faixa_min,
      max: tabelaSelecionada.faixa_max,
    });
    if (forma === "Reduzida 25%" && !tabelaSelecionada.contrata_reduzida_25)
      setForma("Parcela Cheia");
    if (forma === "Reduzida 50%" && !tabelaSelecionada.contrata_reduzida_50)
      setForma("Parcela Cheia");
  }, [tabelaSelecionada]); // eslint-disable-line

  // valida % embutido
  const lanceEmbutPctValid = clamp(lanceEmbutPct, 0, 0.25);
  useEffect(() => {
    if (lanceEmbutPct !== lanceEmbutPctValid)
      setLanceEmbutPct(lanceEmbutPctValid);
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
      lanceOfertPct,
      lanceEmbutPct: lanceEmbutPctValid,
      parcContemplacao,
    };
    setCalc(calcularSimulacao(inp));
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPctValid,
    parcContemplacao,
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

    const parcelaRestanteValor = brMoney(calc.parcelaEscolhida);
    const segundaParcExtra =
      calc.has2aAntecipDepois && calc.segundaParcelaComAntecipacao
        ? ` (2ª parcela com antecipação: ${brMoney(
            calc.segundaParcelaComAntecipacao
          )})`
        : "";

    const telDigits = (userPhone || "").replace(/\D/g, "");
    const wa = `https://wa.me/${telDigits || ""}`;

    return (
`🎯 Com a estratégia certa, você conquista seu ${bem} sem pagar juros, sem entrada e ainda economiza!

📌 Confira essa simulação real:

💰 Crédito contratado: ${brMoney(credito)}

💳 ${primeiraParcelaLabel}: ${brMoney(calc.parcelaAte)} (Primeira parcela em até 3x sem juros no cartão)

💵 Demais parcelas até a contemplação: ${brMoney(calc.parcelaDemais)}

📈 Após a contemplação (prevista em ${parcContemplacao} meses):

🏦 Lance próprio: ${brMoney(calc.lanceProprioValor)}

✅ Crédito líquido liberado: ${brMoney(calc.novoCredito)}

📆 Parcelas restantes (valor): ${parcelaRestanteValor}${segundaParcExtra}

⏳ Prazo restante: ${calc.novoPrazo} meses

💡 Um planejamento inteligente que cabe no seu bolso e acelera a realização do seu sonho!

👉 Quer simular com o valor do seu ${bem} dos sonhos?
Me chama aqui e eu te mostro o melhor caminho 👇
${wa}`
    );
  }, [tabelaSelecionada, calc, podeCalcular, segmento, credito, parcContemplacao, userPhone]);

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(resumoTexto);
      alert("Resumo copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
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
                onClick={() =>
                  alert("Em breve: adicionar administradora.")
                }
                className="h-10 rounded-2xl px-4"
              >
                <Plus className="h-4 w-4 mr-1" /> Add Administradora
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
                    setSegmento={(v) => {
                      setSegmento(v);
                      setNomeTabela("");
                      setTabelaId("");
                    }}
                    nomeTabela={nomeTabela}
                    setNomeTabela={(v) => {
                      setNomeTabela(v);
                      setTabelaId("");
                    }}
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
                <div className="text-sm text-muted-foreground">
                  Nenhuma administradora encontrada.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* coluna direita: memória + resumo + arte */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Memória de Cálculo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!tabelaSelecionada ? (
                <div className="text-muted-foreground">
                  Selecione uma tabela para ver os detalhes.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Crédito</div>
                    <div className="text-right font-medium">
                      {brMoney(credito || 0)}
                    </div>
                    <div>Prazo da Venda</div>
                    <div className="text-right">{prazoVenda || "-"}</div>
                    <div>Forma</div>
                    <div className="text-right">{forma}</div>
                    <div>Seguro / parcela</div>
                    <div className="text-right">
                      {seguroPrest
                        ? pctHuman(tabelaSelecionada.seguro_prest_pct)
                        : "—"}
                    </div>
                  </div>
                  <hr className="my-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>Fundo Comum (fator)</div>
                    <div className="text-right">
                      {calc
                        ? (calc.fundoComumFactor * 100).toFixed(0) + "%"
                        : "—"}
                    </div>
                    <div>Taxa Adm (total)</div>
                    <div className="text-right">
                      {pctHuman(tabelaSelecionada.taxa_adm_pct)}
                    </div>
                    <div>TA efetiva</div>
                    <div className="text-right">
                      {calc ? pctHuman(calc.TA_efetiva) : "—"}
                    </div>
                    <div>Fundo Reserva</div>
                    <div className="text-right">
                      {pctHuman(tabelaSelecionada.fundo_reserva_pct)}
                    </div>
                    <div>Antecipação Adm</div>
                    <div className="text-right">
                      {pctHuman(tabelaSelecionada.antecip_pct)} •{" "}
                      {tabelaSelecionada.antecip_parcelas}x
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
                    <div>Valor de Categoria</div>
                    <div className="text-right">
                      {calc ? brMoney(calc.valorCategoria) : "—"}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo da Proposta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <textarea
                className="w-full h-96 border rounded-md p-3 text-sm leading-relaxed"
                style={{ lineHeight: "1.6" }}
                readOnly
                value={resumoTexto}
                placeholder="Preencha os campos da simulação para gerar o resumo."
              />
              <div className="flex items-center justify-end">
                <Button onClick={copiarResumo} disabled={!resumoTexto}>
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ======= Arte para Stories ======= */}
          <Card>
            <CardHeader>
              <CardTitle>Arte Para Stories (1080×1920)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StoriesArt
                canRender={!!(calc && tabelaSelecionada)}
                segmento={tabelaSelecionada?.segmento || segmento}
                grupo={grupo}
                calc={calc}
                telefone={userPhone}
                avatarUrl={userAvatar}
                userName={userName}
                credito={credito} // <— NOVO: mantém visual correto quando ainda não há novoCredito
              />
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
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============== Modal: Gerenciar Tabelas (com paginação) ============== */
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
  const pageItems = useMemo(
    () => grouped.slice((page - 1) * pageSize, page * pageSize),
    [grouped, page]
  );

  async function deletar(id: string) {
    if (!confirm("Confirmar exclusão desta tabela? (As simulações vinculadas a ela também serão excluídas)")) return;
    setBusyId(id);

    // 1) Exclui simulações dependentes (evita erro de FK)
    const delSims = await supabase.from("sim_simulations").delete().eq("table_id", id);
    if (delSims.error) {
      setBusyId(null);
      alert("Erro ao excluir simulações vinculadas: " + delSims.error.message);
      return;
    }

    // 2) Exclui a tabela
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
          <div className="text-sm text-muted-foreground">
            Admin ativa: <strong>{admin.name}</strong>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="h-10 rounded-2xl px-4"
          >
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(t);
                          setShowForm(true);
                        }}
                        className="h-9 rounded-xl px-3"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === t.id}
                        onClick={() => deletar(t.id)}
                        className="h-9 rounded-xl px-3"
                      >
                        {busyId === t.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Sem tabelas para esta administradora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3 text-sm">
          <div>
            {grouped.length > 0 && (
              <>
                Mostrando{" "}
                <strong>
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, grouped.length)}
                </strong>{" "}
                de <strong>{grouped.length}</strong>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-xl px-3"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <span>
              Página {page} de {totalPages}
            </span>
            <Button
              variant="secondary"
              className="h-9 rounded-xl px-3"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>

      {showForm && (
        <TableFormOverlay
          adminId={admin.id}
          initial={editing || undefined}
          onClose={() => setShowForm(false)}
          onSaved={(t) => {
            onCreatedOrUpdated(t);
            setShowForm(false);
          }}
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
              <select
                className="w-full h-10 border rounded-md px-3"
                value={p.leadId}
                onChange={(e) => p.setLeadId(e.target.value)}
              >
                <option value="">Escolha um lead</option>
                {p.leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
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
              <Input
                value={p.grupo}
                onChange={(e) => p.setGrupo(e.target.value)}
                placeholder="ex.: 9957"
              />
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
                  {Array.from(new Set(p.adminTables.map((t) => t.segmento))).map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
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
                    <option key={n} value={n}>
                      {n}
                    </option>
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
                      {t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR{" "}
                      {pctHuman(t.fundo_reserva_pct)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Faixa de Crédito</Label>
                <Input
                  value={p.faixa ? `${brMoney(p.faixa.min)} a ${brMoney(p.faixa.max)}` : ""}
                  readOnly
                />
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
                <Input
                  type="number"
                  value={p.prazoVenda || ""}
                  onChange={(e) => p.setPrazoVenda(Number(e.target.value))}
                />
                {p.prazoAviso && (
                  <p className="text-xs text-yellow-600 mt-1">{p.prazoAviso}</p>
                )}
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
                    className={
                      p.seguroPrest
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-muted text-foreground/60 hover:bg-muted"
                    }
                    onClick={() => p.setSeguroPrest(true)}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    className={
                      !p.seguroPrest
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-muted text-foreground/60 hover:bg-muted"
                    }
                    onClick={() => p.setSeguroPrest(false)}
                  >
                    Não
                  </Button>
                </div>
              </div>

              {p.tabelaSelecionada && (
                <div className="md:col-span-4 grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                  <div>
                    % Taxa de Adm:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.taxa_adm_pct)}</strong>
                  </div>
                  <div>
                    % Fundo Reserva:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.fundo_reserva_pct)}</strong>
                  </div>
                  <div>
                    % Antecipação:{" "}
                    <strong>{pctHuman(p.tabelaSelecionada.antecip_pct)}</strong> •
                    Parcelas: <strong>{p.tabelaSelecionada.antecip_parcelas}</strong>
                  </div>
                  <div>
                    Limitador de Parcela:{" "}
                    <strong>
                      {pctHuman(
                        resolveLimitadorPct(
                          p.tabelaSelecionada.limitador_parcela_pct,
                          p.tabelaSelecionada.segmento,
                          p.credito || 0
                        )
                      )}
                    </strong>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Até a contemplação */}
          <Card>
            <CardHeader>
              <CardTitle>Plano de Pagamento até a Contemplação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>
                  {p.tabelaSelecionada?.antecip_parcelas === 2
                    ? "Parcelas 1 e 2"
                    : p.tabelaSelecionada?.antecip_parcelas === 1
                    ? "Parcela 1"
                    : "Parcela Inicial"}
                </Label>
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
            <CardHeader>
              <CardTitle>Configurações do Lance</CardTitle>
            </CardHeader>
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
                  onChange={(e) =>
                    p.setParcContemplacao(Math.max(1, Number(e.target.value)))
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deve ser menor que o Prazo da Venda.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pós */}
          <Card>
            <CardHeader>
              <CardTitle>Plano de Pagamento após a Contemplação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Lance Ofertado</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.lanceOfertadoValor) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Lance Embutido</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.lanceEmbutidoValor) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Lance Próprio</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.lanceProprioValor) : ""}
                  readOnly
                />
              </div>

              <div>
                <Label>Lance Percebido (%)</Label>
                <Input
                  value={p.calc ? pctHuman(p.calc.lancePercebidoPct) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Novo Crédito</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.novoCredito) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Nova Parcela (sem limite)</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.novaParcelaSemLimite) : ""}
                  readOnly
                />
              </div>

              <div>
                <Label>Parcela Limitante</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.parcelaLimitante) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Parcela Escolhida</Label>
                <Input
                  value={p.calc ? brMoney(p.calc.parcelaEscolhida) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Novo Prazo (meses)</Label>
                <Input value={p.calc ? String(p.calc.novoPrazo) : ""} readOnly />
              </div>

              {p.calc?.has2aAntecipDepois && p.calc?.segundaParcelaComAntecipacao != null && (
                <div className="md:col-span-3">
                  <Label>2ª parcela (com antecipação)</Label>
                  <Input value={brMoney(p.calc.segundaParcelaComAntecipacao)} readOnly />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex items-center gap-3">
            <Button disabled={!p.calc || p.salvando} onClick={p.salvar} className="h-10 rounded-2xl px-4">
              {p.salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Simulação
            </Button>
            {p.simCode && (
              <span className="text-sm">
                ✅ Salvo como <strong>Simulação #{p.simCode}</strong>
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          Selecione um lead para abrir o simulador.
        </div>
      )}
    </div>
  );
}

/* ====================== Arte para Stories (Canvas) ====================== */

type StoriesArtProps = {
  canRender: boolean;
  segmento: string;
  grupo: string;
  calc: ReturnType<typeof calcularSimulacao> | null;
  telefone: string;
  avatarUrl: string | null;
  userName: string;
  credito: number; // NOVO: para exibir crédito contratado quando ainda não há novoCredito
};

function StoriesArt(props: StoriesArtProps) {
  const { canRender, segmento, grupo, calc, telefone, avatarUrl, userName, credito } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [seed, setSeed] = useState(Math.floor(Math.random() * 1e9));
  const [downloading, setDownloading] = useState(false);

  // Paleta (fixa)
  const colors = {
    white: "#FFFFFF",
    gray: "#F3F4F6",
    blue: "#172135",  // azul escuro
    red: "#A11C27",   // vinho Consulmax
    textMuted: "#6B7280"
  };

  /* ===== util ===== */
  function rngFactory(s: number) {
    let x = s || 1234567;
    return () => {
      x ^= x << 13; x ^= x >> 17; x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function hexToRgba(hex: string, alpha: number) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, baseSize: number, minSize = 16) {
    let size = baseSize;
    do {
      ctx.font = `600 ${size}px 'Inter', system-ui, -apple-system, Arial`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    } while (size > minSize);
    return size;
  }

  function drawLabelValueCard(
    ctx: CanvasRenderingContext2D,
    title: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    style: { border?: string; fill?: string; titleColor?: string; valueColor?: string } = {}
  ) {
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = style.fill || colors.white;
    ctx.fill();
    if (style.border) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = style.border;
      ctx.stroke();
    }

    // título
    ctx.fillStyle = style.titleColor || colors.textMuted;
    ctx.font = `600 26px 'Inter', system-ui, -apple-system, Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(title, x + 16, y + 12);

    // valor
    ctx.fillStyle = style.valueColor || colors.blue;
    ctx.font = `800 34px 'Inter', system-ui, -apple-system, Arial`;
    ctx.textBaseline = "alphabetic";
    const display = value || "—";
    ctx.fillText(display, x + 16, y + h - 16);
    ctx.restore();
  }

  async function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 1080, H = 1920;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    /* ===== background ===== */
    ctx.fillStyle = colors.white;
    ctx.fillRect(0, 0, W, H);

    const rnd = rngFactory(seed);
    const shapeCount = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < shapeCount; i++) {
      const isCircle = rnd() > 0.5;
      const alpha = 0.07 + rnd() * 0.05;
      const palette = [colors.gray, colors.blue, colors.red];
      ctx.fillStyle = hexToRgba(palette[Math.floor(rnd() * palette.length)], alpha);
      const cx = rnd() * W, cy = rnd() * H;

      if (isCircle) {
        const r = 120 + rnd() * 260;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const ww = 260 + rnd() * 420;
        const hh = 140 + rnd() * 280;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((rnd() - 0.5) * 0.7);
        drawRoundedRect(ctx, -ww / 2, -hh / 2, ww, hh, 40);
        ctx.fill();
        ctx.restore();
      }
    }

    /* ===== Header: pill + barra Consórcio [SEGMENTO] ===== */
    // Pill "Cartas de Crédito"
    const pillX = 80, pillY = 80;
    const pillPadX = 28, pillPadY = 14;
    const pillText = "Cartas de Crédito";
    ctx.font = `700 34px 'Inter', system-ui, -apple-system, Arial`;
    const pillW = ctx.measureText(pillText).width + pillPadX * 2;
    const pillH = 46 + pillPadY;
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 999);
    ctx.fillStyle = colors.red;
    ctx.fill();
    ctx.fillStyle = colors.white;
    ctx.textBaseline = "middle";
    ctx.fillText(pillText, pillX + pillPadX, pillY + pillH / 2);

    // Barra "Consórcio [SEGMENTO]"
    const barX = 80, barY = pillY + pillH + 28, barW = W - 160, barH = 64;
    drawRoundedRect(ctx, barX, barY, barW, barH, 18);
    ctx.fillStyle = colors.blue;
    ctx.fill();
    ctx.fillStyle = colors.white;
    ctx.font = `700 34px 'Inter', system-ui, -apple-system, Arial`;
    const seg = (segmento || "").toUpperCase().split(" ")[0] || "—";
    const label = `Consórcio ${seg}`;
    const labelSize = fitText(ctx, label, barW - 32, 34, 22);
    ctx.font = `700 ${labelSize}px 'Inter', system-ui, -apple-system, Arial`;
    ctx.fillText(label, barX + 16, barY + barH / 2 + labelSize * 0.36);

    /* ===== Cards ===== */
    const gridX = 80;
    let y = barY + barH + 40;

    // CARD 1 (DESTACADO): Crédito
    const creditW = W - gridX * 2;
    const creditH = 110;
    drawRoundedRect(ctx, gridX, y, creditW, creditH, 14);
    ctx.fillStyle = colors.blue;
    ctx.fill();
    ctx.fillStyle = colors.white;
    ctx.font = `600 24px 'Inter', system-ui, -apple-system, Arial`;
    ctx.fillText("Crédito", gridX + 16, y + 12);

    const creditoVal = calc ? (calc.novoCredito > 0 ? calc.novoCredito : credito) : credito;
    ctx.font = `800 36px 'Inter', system-ui, -apple-system, Arial`;
    ctx.fillText(brMoney(creditoVal || 0), gridX + 16, y + creditH - 16);
    // borda vermelha
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.red;
    drawRoundedRect(ctx, gridX, y, creditW, creditH, 14);
    ctx.stroke();

    // grid 2 colunas x 2 linhas
    y += creditH + 24;
    const colW = (W - gridX * 2 - 24) / 2;
    const rowH = 100;

    // Primeira parcela
    drawLabelValueCard(ctx, "Primeira Parcela", calc ? brMoney(calc.parcelaAte) : "", gridX, y, colW, rowH);

    // Parcela 2 (se existir)
    const showP2 = !!(calc?.has2aAntecipDepois && calc.segundaParcelaComAntecipacao != null);
    drawLabelValueCard(
      ctx,
      showP2 ? "Parcela 2" : " ",
      showP2 ? brMoney(calc!.segundaParcelaComAntecipacao as number) : "",
      gridX + colW + 24, y, colW, rowH
    );

    // Demais parcelas
    y += rowH + 16;
    drawLabelValueCard(ctx, "Demais Parcelas", calc ? brMoney(calc.parcelaEscolhida) : "", gridX, y, colW, rowH);

    // Lance próprio (destaque com fundo vermelho 6%)
    drawLabelValueCard(
      ctx,
      "Lance Próprio",
      calc ? brMoney(calc.lanceProprioValor) : "",
      gridX + colW + 24, y, colW, rowH,
      { fill: hexToRgba(colors.red, 0.06), titleColor: colors.textMuted, valueColor: colors.blue }
    );

    // Nova linha: Novo Prazo | Grupo
    y += rowH + 16;
    drawLabelValueCard(ctx, "Novo Prazo", calc ? `${calc.novoPrazo} meses` : "", gridX, y, colW, rowH);
    drawLabelValueCard(ctx, "Grupo", grupo || "—", gridX + colW + 24, y, colW, rowH);

    /* ===== Chip WhatsApp ===== */
    const chipY = y + rowH + 24;
    const chipH = 72;
    const chipW = W - gridX * 2;
    drawRoundedRect(ctx, gridX, chipY, chipW, chipH, 999);
    ctx.fillStyle = colors.white;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexToRgba(colors.blue, 0.12);
    ctx.stroke();

    // avatar
    const avatarSize = 56;
    const avatarCX = gridX + 16 + avatarSize / 2;
    const avatarCY = chipY + chipH / 2;

    if (avatarUrl) {
      try {
        const img = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, avatarCX - avatarSize / 2, avatarCY - avatarSize / 2, avatarSize, avatarSize);
        ctx.restore();
      } catch {
        drawInitial(ctx, userName, avatarCX, avatarCY, avatarSize, colors.blue);
      }
    } else {
      drawInitial(ctx, userName, avatarCX, avatarCY, avatarSize, colors.blue);
    }

    ctx.fillStyle = colors.blue;
    ctx.font = `800 26px 'Inter', system-ui, -apple-system, Arial`;
    const phoneTxt = `WhatsApp: ${formatPhone(telefone) || "—"}`;
    ctx.textBaseline = "middle";
    ctx.fillText(phoneTxt, gridX + 16 + avatarSize + 16, chipY + chipH / 2);

    /* ===== Rodapé: logo e site ===== */
    try {
      const logo = await loadImage("/logo-consulmax.png");
      const logoTargetW = 240;
      const scale = logoTargetW / logo.width;
      const logoTargetH = logo.height * scale;
      ctx.drawImage(logo, (W - logoTargetW) / 2, H - 180, logoTargetW, logoTargetH);
    } catch {
      ctx.fillStyle = colors.blue;
      ctx.font = `900 32px 'Inter', system-ui, -apple-system, Arial`;
      const txt = "CONSULMAX";
      ctx.fillText(txt, (W - ctx.measureText(txt).width) / 2, H - 160);
    }

    ctx.fillStyle = colors.textMuted;
    ctx.font = `600 22px 'Inter', system-ui, -apple-system, Arial`;
    const site = "consulmaxconsorcios.com.br";
    ctx.fillText(site, (W - ctx.measureText(site).width) / 2, H - 48);
  }

  useEffect(() => {
    if (canRender) render(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRender, calc, segmento, grupo, telefone, avatarUrl, seed, credito]);

  function onShuffle() {
    setSeed(Math.floor(Math.random() * 1e9));
  }

  function onDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    try {
      const link = document.createElement("a");
      link.download = `consulmax-stories-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3">
      {!canRender ? (
        <div className="text-sm text-muted-foreground">
          Preencha a simulação para liberar a prévia da arte.
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-white p-2">
            {/* preview responsivo (canvas real 1080x1920) */}
            <div className="w-full">
              <div className="mx-auto" style={{ maxWidth: 320 }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    borderRadius: 16,
                  }}
                />
              </div>
              <div className="text-center text-xs text-muted-foreground mt-1">
                Prévia escalada para caber (tamanho real 1080×1920).
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onShuffle}>
              Atualizar Prévia
            </Button>
            <Button onClick={onDownload} disabled={downloading}>
              {downloading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Baixar PNG 1080×1920
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== helpers visuais da arte ===== */
function drawInitial(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  ctx.fillStyle = `rgba(23, 33, 53, 0.08)`;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const initial = (name || "U").trim().charAt(0).toUpperCase();
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.round(size * 0.48)}px 'Inter', system-ui, -apple-system, Arial`;
  ctx.textBaseline = "middle";
  const w = ctx.measureText(initial).width;
  ctx.fillText(initial, cx - w / 2, cy);
}

function formatPhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    const dd = d.slice(2);
    return `(${dd.slice(0,2)}) ${dd.slice(2,7)}-${dd.slice(7)}`;
  }
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return d;
}
