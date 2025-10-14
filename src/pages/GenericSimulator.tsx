// src/pages/GenericSimulator.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ======================= Tipos compatíveis ======================= */
type UUID = string;

type Lead = { id: UUID; nome: string; telefone?: string | null };
type Admin = { id: UUID; name: string; rules?: any };

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
  antecip_parcelas: number;
  limitador_parcela_pct: number;
  seguro_prest_pct: number;
  contrata_parcela_cheia: boolean;
  contrata_reduzida_25: boolean;
  contrata_reduzida_50: boolean;
};

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

/* ======================= Helpers ======================= */
const brMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const pctHuman = (v: number) => (v * 100).toFixed(4) + "%";

function formatBRLInputFromNumber(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRLInputToNumber(s: string) {
  const digits = (s || "").replace(/\D/g, "");
  const cents = digits.length ? parseInt(digits, 10) : 0;
  return cents / 100;
}
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

/* ======================= Inputs com máscara ======================= */
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

/* ======================= Motor de cálculo ======================= */
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
  limitadorPct: number;       // pode vir da tabela ou das regras (adm)
  seguroPrestPct: number;
  parcContemplacao: number;

  // regras de lance
  baseLanceOfertado: "credito" | "categoria" | "parcelas";
  modeloLance: "percentual" | "parcela";
  parcelaBase?: "contratada" | "termo";
  prazoOriginalGrupo?: number; // exigido quando parcelaBase=termo

  // entradas de lance
  lanceOfertadoPct?: number;       // quando modelo = percentual
  lanceOfertadoQtdParcelas?: number; // quando modelo = parcela
  baseLanceEmbutido: "credito" | "categoria";
  lanceEmbutPct?: number;          // ou qtd de parcelas para embutido quando base=parcelas
  lanceEmbutQtdParcelas?: number;
};

function calcularParcelaBaseSemSeguro(C: number, prazo: number, forma: FormaContratacao, TA_full: number, fr: number, antecipPct: number) {
  const fundoComumFactor = forma === "Parcela Cheia" ? 1 : forma === "Reduzida 25%" ? 0.75 : 0.5;
  const TA_efetiva = Math.max(0, TA_full - antecipPct);
  return (C * fundoComumFactor + C * TA_efetiva + C * fr) / Math.max(1, prazo);
}

function calcularValorCategoria(C: number, taxaAdmFull: number, frPct: number) {
  return C * (1 + taxaAdmFull + frPct);
}

function resolveLimitadorPctAdmOuTabela(
  tabelaLimitPct: number,
  rules: any,
  segmento: string,
  credito: number
) {
  const origem = rules?.limitador_parcela?.pct_origem || "tabela";
  const basePctAdm = Number(rules?.limitador_parcela?.pct_padrao_adm || 0);
  let pct = origem === "adm" ? basePctAdm : tabelaLimitPct;

  // Regra especial do seu Simuladores.tsx (moto >= 20k => 1%)
  if ((segmento || "").toLowerCase().includes("motocicleta") && credito >= 20000) {
    pct = 0.01;
  }
  return pct;
}

function calcularSimulacaoGenerica(i: CalcInput) {
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
    seguroPrestPct,
    parcContemplacao,
    baseLanceOfertado,
    modeloLance,
    parcelaBase,
    prazoOriginalGrupo,
    lanceOfertadoPct = 0,
    lanceOfertadoQtdParcelas = 0,
    baseLanceEmbutido,
    lanceEmbutPct = 0,
    lanceEmbutQtdParcelas = 0,
    limitadorPct,
  } = i;

  const prazo = Math.max(1, Math.floor(prazoVenda));
  const parcelasPagas = Math.max(0, Math.min(parcContemplacao, prazo));
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

  const valorCategoria = calcularValorCategoria(C, taxaAdmFull, frPct);
  const seguroMensal = seguro ? valorCategoria * seguroPrestPct : 0;

  // parcela base (sem seguro) na venda
  const baseMensalSemSeguro = calcularParcelaBaseSemSeguro(C, prazoVenda, forma, taxaAdmFull, frPct, antecipPct);

  // ANTECIPAÇÃO (valor extra nas 1..X parcelas)
  const antecipAdicionalCada = antecipParcelas > 0 ? (C * antecipPct) / antecipParcelas : 0;

  // até contemplação (apresentação)
  const parcelaAte = baseMensalSemSeguro + (antecipParcelas > 0 ? antecipAdicionalCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalSemSeguro + seguroMensal;

  // TOTAL PAGO ATÉ A CONTEMPLAÇÃO (SEM seguro)
  const totalPagoSemSeguro =
    baseMensalSemSeguro * parcelasPagas +
    antecipAdicionalCada * Math.min(parcelasPagas, antecipParcelas);

  // === LANCE OFERTADO ===
  let baseOfert: number;
  if (baseLanceOfertado === "categoria") baseOfert = valorCategoria;
  else if (baseLanceOfertado === "parcelas") {
    // usa parcela base conforme regra
    let parcRef = baseMensalSemSeguro; // contratada
    if (parcelaBase === "termo") {
      const prazoTermo = Math.max(1, prazoOriginalGrupo || prazoVenda);
      parcRef = calcularParcelaBaseSemSeguro(C, prazoTermo, "Parcela Cheia", taxaAdmFull, frPct, antecipPct);
    }
    baseOfert = parcRef;
  } else baseOfert = C; // "credito"

  let lanceOfertadoValor = 0;
  if (modeloLance === "percentual") {
    lanceOfertadoValor = baseOfert * (lanceOfertPct || 0);
  } else {
    // modelo por quantidade de parcelas
    const qtd = Math.max(0, Math.floor(lanceOfertadoQtdParcelas || 0));
    lanceOfertadoValor = baseOfert * qtd;
  }

  // === LANCE EMBUTIDO ===
  let baseEmbut: number;
  if (baseLanceEmbutido === "categoria") baseEmbut = valorCategoria;
  else baseEmbut = C;

  let lanceEmbutidoValor = 0;
  if (modeloLance === "percentual") {
    lanceEmbutidoValor = baseEmbut * clamp(lanceEmbutPct || 0, 0, 0.25);
  } else {
    const qtdE = Math.max(0, Math.floor(lanceEmbutQtdParcelas || 0));
    // para embutido em "parcelas", convencionamos usar a MESMA base de oferta (parcela ref)
    let parcRef = baseMensalSemSeguro;
    if (parcelaBase === "termo") {
      const prazoTermo = Math.max(1, prazoOriginalGrupo || prazoVenda);
      parcRef = calcularParcelaBaseSemSeguro(C, prazoTermo, "Parcela Cheia", taxaAdmFull, frPct, antecipPct);
    }
    lanceEmbutidoValor = parcRef * qtdE;
  }

  const lanceProprioValor = Math.max(0, lanceOfertadoValor - lanceEmbutidoValor);
  const novoCredito = Math.max(0, C - lanceEmbutidoValor);
  const lancePercebidoPct = novoCredito > 0 ? lanceProprioValor / novoCredito : 0;

  // SALDO FINAL (sem seguro)
  const saldoDevedorFinal = Math.max(0, valorCategoria - totalPagoSemSeguro - lanceOfertadoValor);

  // NOVA PARCELA (sem limite; sem seguro)
  const novaParcelaSemLimite = saldoDevedorFinal / prazoRestante;

  // LIMITADOR (sobre valor de categoria, crédito, ou % parcela)
  let parcelaLimitante = 0;
  const baseLim = i["limitadorBase"] || "categoria"; // fallback
  const limBaseCfg = (i as any).limitadorBase || "categoria";
  if (limitadorPct > 0) {
    if (limBaseCfg === "credito") parcelaLimitante = C * limitadorPct;
    else if (limBaseCfg === "parcela_pct") parcelaLimitante = baseMensalSemSeguro * (1 + limitadorPct - 1); // % sobre parcela => parcela * pct
    else parcelaLimitante = valorCategoria * limitadorPct; // "categoria"
  }

  // Escolha de parcela (sem seguro)
  const parcelaEscolhida = parcelaLimitante > 0
    ? Math.max(novaParcelaSemLimite, parcelaLimitante)
    : novaParcelaSemLimite;

  // Novo prazo se limitador elevou a parcela
  let novoPrazo: number;
  if (parcelaEscolhida <= 0) novoPrazo = prazoRestante;
  else novoPrazo = Math.max(1, Math.ceil(saldoDevedorFinal / parcelaEscolhida));

  // 2ª parcela com antecipação (caso especial igual ao seu arquivo)
  const has2aAntecipDepois = antecipParcelas >= 2 && parcContemplacao === 1;
  const segundaParcelaComAntecipacao = has2aAntecipDepois
    ? parcelaEscolhida + antecipAdicionalCada
    : null;

  return {
    valorCategoria,
    parcelaAte,
    parcelaDemais,
    lanceOfertadoValor,
    lanceEmbutidoValor,
    lanceProprioValor,
    lancePercebidoPct,
    novoCredito,
    novaParcelaSemLimite,
    parcelaLimitante,
    parcelaEscolhida,
    saldoDevedorFinal,
    novoPrazo,
    segundaParcelaComAntecipacao,
    has2aAntecipDepois,
  };
}

/* ======================= Componente ======================= */
export default function GenericSimulator({
  admin,
  leads,
  adminTables,
}: {
  admin: Admin;
  leads: Lead[];
  adminTables: SimTable[];
}) {
  const rules = admin?.rules || {};

  // topo
  const [leadId, setLeadId] = useState<string>("");
  const [leadInfo, setLeadInfo] = useState<{ nome: string; telefone?: string | null } | null>(null);
  const [grupo, setGrupo] = useState<string>("");

  // plano
  const [segmento, setSegmento] = useState<string>("");
  const [nomeTabela, setNomeTabela] = useState<string>("");
  const [tabelaId, setTabelaId] = useState<string>("");

  // venda
  const [credito, setCredito] = useState<number>(0);
  const [prazoVenda, setPrazoVenda] = useState<number>(0);
  const [forma, setForma] = useState<FormaContratacao>("Parcela Cheia");
  const [seguroPrest, setSeguroPrest] = useState<boolean>(false);

  // regras de lance (dinâmico conforme rules)
  const modelo = (rules?.lance?.modelo as "percentual" | "parcela") || "percentual";
  const [lanceOfertPct, setLanceOfertPct] = useState<number>(0);
  const [lanceOfertQtd, setLanceOfertQtd] = useState<number>(0);
  const [lanceEmbutPct, setLanceEmbutPct] = useState<number>(0);
  const [lanceEmbutQtd, setLanceEmbutQtd] = useState<number>(0);
  const [parcContemplacao, setParcContemplacao] = useState<number>(1);
  const [prazoOriginalGrupo, setPrazoOriginalGrupo] = useState<number>(0);

  // derivadas
  const variantesDaTabela = useMemo(
    () => adminTables.filter((t) => t.segmento === segmento && t.nome_tabela === nomeTabela),
    [adminTables, segmento, nomeTabela]
  );
  const tabelaSelecionada = useMemo(
    () => adminTables.find((t) => t.id === tabelaId) || null,
    [adminTables, tabelaId]
  );
  const nomesTabelaSegmento = useMemo(() => {
    const list = adminTables
      .filter((t) => (segmento ? t.segmento === segmento : true))
      .map((t) => t.nome_tabela);
    return Array.from(new Set(list));
  }, [adminTables, segmento]);

  // leads
  useEffect(() => {
    const found = leads.find((x) => x.id === leadId);
    setLeadInfo(found ? { nome: found.nome, telefone: found.telefone } : null);
  }, [leadId, leads]);

  const prazoAviso =
    prazoVenda > 0 && tabelaSelecionada?.prazo_limite && prazoVenda > tabelaSelecionada.prazo_limite
      ? "⚠️ Prazo da venda ultrapassa o Prazo Até da tabela selecionada."
      : null;

  const podeCalcular =
    !!tabelaSelecionada &&
    credito > 0 &&
    prazoVenda > 0 &&
    parcContemplacao > 0 &&
    parcContemplacao < prazoVenda &&
    (rules?.lance?.parcela_base !== "termo" || prazoOriginalGrupo > 0);

  const [calc, setCalc] = useState<ReturnType<typeof calcularSimulacaoGenerica> | null>(null);

  useEffect(() => {
    if (!tabelaSelecionada || !podeCalcular) {
      setCalc(null);
      return;
    }

    // base do limitador: tabela ou adm
    const limitPct = resolveLimitadorPctAdmOuTabela(
      tabelaSelecionada.limitador_parcela_pct,
      rules,
      tabelaSelecionada.segmento,
      credito || 0
    );

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
      limitadorPct: limitPct,
      seguroPrestPct: tabelaSelecionada.seguro_prest_pct,
      parcContemplacao,

      baseLanceOfertado: rules?.lance?.base_ofertado || "credito",
      modeloLance: rules?.lance?.modelo || "percentual",
      parcelaBase: rules?.lance?.parcela_base,
      prazoOriginalGrupo: prazoOriginalGrupo || undefined,

      lanceOfertadoPct: modelo === "percentual" ? lanceOfertPct : undefined,
      lanceOfertadoQtdParcelas: modelo === "parcela" ? Math.max(0, Math.floor(lanceOfertQtd)) : undefined,

      baseLanceEmbutido: rules?.lance_embutido?.base || "credito",
      lanceEmbutPct: modelo === "percentual" ? clamp(lanceEmbutPct, 0, 0.25) : undefined,
      lanceEmbutQtdParcelas: modelo === "parcela" ? Math.max(0, Math.floor(lanceEmbutQtd)) : undefined,

      // para permitir escolher a base do limitador por regras (opcional):
      ...(rules?.limitador_parcela?.base ? { limitadorBase: rules.limitador_parcela.base } : {}),
    } as any;

    setCalc(calcularSimulacaoGenerica(inp));
  }, [
    tabelaSelecionada,
    credito,
    prazoVenda,
    forma,
    seguroPrest,
    lanceOfertPct,
    lanceEmbutPct,
    lanceOfertQtd,
    lanceEmbutQtd,
    parcContemplacao,
    prazoOriginalGrupo,
  ]); // eslint-disable-line

  return (
    <div className="space-y-6">
      {/* Topo */}
      <Card>
        <CardHeader><CardTitle>{admin?.name || "Administradora"}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Selecionar Lead</Label>
            <select
              className="w-full h-10 border rounded-md px-3"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
            {leadInfo && (
              <p className="text-xs text-muted-foreground mt-1">
                {leadInfo.nome} • {leadInfo.telefone || "sem telefone"}
              </p>
            )}
          </div>
          <div>
            <Label>Nº do Grupo (opcional)</Label>
            <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="ex.: 9957" />
          </div>
        </CardContent>
      </Card>

      {leadId ? (
        <>
          {/* Plano */}
          <Card>
            <CardHeader><CardTitle>Configurações do Plano</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Segmento</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={segmento}
                  onChange={(e) => { setSegmento(e.target.value); setNomeTabela(""); setTabelaId(""); }}
                >
                  <option value="">Selecione o segmento</option>
                  {Array.from(new Set(adminTables.map((t) => t.segmento))).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Tabela</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={nomeTabela}
                  disabled={!segmento}
                  onChange={(e) => { setNomeTabela(e.target.value); setTabelaId(""); }}
                >
                  <option value="">{segmento ? "Selecione a tabela" : "Selecione o segmento primeiro"}</option>
                  {nomesTabelaSegmento.map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>

              <div>
                <Label>Prazo Até</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={tabelaId}
                  disabled={!nomeTabela}
                  onChange={(e) => setTabelaId(e.target.value)}
                >
                  <option value="">{nomeTabela ? "Selecione o prazo" : "Selecione a tabela antes"}</option>
                  {variantesDaTabela.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prazo_limite} meses • Adm {pctHuman(t.taxa_adm_pct)} • FR {pctHuman(t.fundo_reserva_pct)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Faixa de Crédito</Label>
                <Input
                  value={
                    tabelaSelecionada
                      ? `${brMoney(tabelaSelecionada.faixa_min)} a ${brMoney(tabelaSelecionada.faixa_max)}`
                      : ""
                  }
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
                <MoneyInput value={credito || 0} onChange={setCredito} />
              </div>
              <div>
                <Label>Prazo da Venda (meses)</Label>
                <Input type="number" value={prazoVenda || ""} onChange={(e) => setPrazoVenda(Number(e.target.value))} />
                {prazoAviso && <p className="text-xs text-yellow-600 mt-1">{prazoAviso}</p>}
              </div>
              <div>
                <Label>Forma de Contratação</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={forma}
                  disabled={!tabelaSelecionada}
                  onChange={(e) => setForma(e.target.value as any)}
                >
                  <option value="">Selecione</option>
                  {tabelaSelecionada?.contrata_parcela_cheia && <option value="Parcela Cheia">Parcela Cheia</option>}
                  {tabelaSelecionada?.contrata_reduzida_25 && <option value="Reduzida 25%">Reduzida 25%</option>}
                  {tabelaSelecionada?.contrata_reduzida_50 && <option value="Reduzida 50%">Reduzida 50%</option>}
                </select>
              </div>
              <div>
                <Label>Seguro Prestamista</Label>
                <div className="flex gap-2">
                  <Button type="button"
                    className={seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"}
                    onClick={() => setSeguroPrest(true)}
                  >Sim</Button>
                  <Button type="button"
                    className={!seguroPrest ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground/60 hover:bg-muted"}
                    onClick={() => setSeguroPrest(false)}
                  >Não</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Até a contemplação */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento até a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Parcela inicial / 1..X</Label>
                <Input value={calc ? brMoney(calc.parcelaAte) : ""} readOnly />
              </div>
              <div>
                <Label>Demais Parcelas</Label>
                <Input value={calc ? brMoney(calc.parcelaDemais) : ""} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Lance */}
          <Card>
            <CardHeader><CardTitle>Configurações do Lance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              {modelo === "percentual" ? (
                <>
                  <div>
                    <Label>Lance Ofertado (%)</Label>
                    <PercentInput valueDecimal={lanceOfertPct} onChangeDecimal={setLanceOfertPct} />
                  </div>
                  <div>
                    <Label>Lance Embutido (%)</Label>
                    <PercentInput valueDecimal={lanceEmbutPct} onChangeDecimal={(d) => setLanceEmbutPct(clamp(d, 0, 0.25))} maxDecimal={0.25} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Lance Ofertado (qtd parcelas)</Label>
                    <Input type="number" value={lanceOfertQtd || ""} onChange={(e) => setLanceOfertQtd(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Lance Embutido (qtd parcelas)</Label>
                    <Input type="number" value={lanceEmbutQtd || ""} onChange={(e) => setLanceEmbutQtd(Number(e.target.value))} />
                  </div>
                  {rules?.lance?.parcela_base === "termo" && (
                    <div>
                      <Label>Prazo original do grupo (meses)</Label>
                      <Input type="number" value={prazoOriginalGrupo || ""} onChange={(e) => setPrazoOriginalGrupo(Number(e.target.value))} />
                      <p className="text-xs text-muted-foreground mt-1">Obrigatório para parcela termo.</p>
                    </div>
                  )}
                </>
              )}
              <div>
                <Label>Parcela da Contemplação</Label>
                <Input type="number" value={parcContemplacao} onChange={(e) => setParcContemplacao(Math.max(1, Number(e.target.value)))} />
                <p className="text-xs text-muted-foreground mt-1">Deve ser menor que o Prazo da Venda.</p>
              </div>
            </CardContent>
          </Card>

          {/* Pós contemplação */}
          <Card>
            <CardHeader><CardTitle>Plano de Pagamento após a Contemplação</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div><Label>Lance Ofertado</Label><Input value={calc ? brMoney(calc.lanceOfertadoValor) : ""} readOnly /></div>
              <div><Label>Lance Embutido</Label><Input value={calc ? brMoney(calc.lanceEmbutidoValor) : ""} readOnly /></div>
              <div><Label>Lance Próprio</Label><Input value={calc ? brMoney(calc.lanceProprioValor) : ""} readOnly /></div>

              <div><Label>Lance Percebido (%)</Label><Input value={calc ? pctHuman(calc.lancePercebidoPct) : ""} readOnly /></div>
              <div><Label>Novo Crédito</Label><Input value={calc ? brMoney(calc.novoCredito) : ""} readOnly /></div>
              <div><Label>Nova Parcela (sem limite)</Label><Input value={calc ? brMoney(calc.novaParcelaSemLimite) : ""} readOnly /></div>

              <div><Label>Parcela Limitante</Label><Input value={calc ? brMoney(calc.parcelaLimitante) : ""} readOnly /></div>
              <div><Label>Parcela Escolhida</Label><Input value={calc ? brMoney(calc.parcelaEscolhida) : ""} readOnly /></div>
              <div><Label>Novo Prazo (meses)</Label><Input value={calc ? String(calc.novoPrazo) : ""} readOnly /></div>

              {calc?.has2aAntecipDepois && calc?.segundaParcelaComAntecipacao != null && (
                <div className="md:col-span-3">
                  <Label>2ª parcela (com antecipação)</Label>
                  <Input value={brMoney(calc.segundaParcelaComAntecipacao)} readOnly />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Selecione um lead para abrir o simulador.</div>
      )}
    </div>
  );
}
