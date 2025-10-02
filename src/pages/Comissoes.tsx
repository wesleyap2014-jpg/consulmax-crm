// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2,
  Filter as FilterIcon,
  Settings,
  Save,
  DollarSign,
  FileText,
  PlusCircle,
  RotateCcw,
  Pencil,
  Trash,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  RefreshCw,
  Info,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { format } from "date-fns";

/******************************************************
 * TIPOS & MODELOS
 ******************************************************/
type UUID = string;

export type Vendedor = {
  id: UUID;
  nome: string;
};

export type ParcelaComissao = {
  id: UUID;
  venda_id: UUID;
  numero: number; // 1..n
  valor_bruto: number;
  imposto_pct: number; // % no momento do recibo
  valor_liquido: number; // calculado: bruto - imposto
  vencimento: string; // ISO
  paga_em?: string | null;
  recibo_id?: UUID | null;
  selecionada?: boolean; // UI somente
};

export type Venda = {
  id: UUID;
  proposta: string; // número da proposta
  cliente_nome: string;
  vendedor_id: UUID;
  created_at: string;
  comissoes: ParcelaComissao[];
  total_bruto?: number;
  total_liquido?: number;
  total_pago?: number;
  total_pago_liquido?: number;
};

export type Recibo = {
  id: UUID;
  vendedor_id: UUID;
  data_recibo: string; // ISO DATE
  imposto_pct: number;
  observacoes?: string | null;
};

export type Estorno = {
  id: UUID;
  venda_id: UUID;
  recibo_id?: UUID | null;
  valor_bruto: number;
  valor_liquido: number;
  criado_em: string;
};

/******************************************************
 * HELPERS
 ******************************************************/
function currency(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(n: number) {
  return `${(n ?? 0).toFixed(2)}%`;
}

function calcLiquido(valor_bruto: number, imposto_pct: number) {
  const imposto = (valor_bruto * (imposto_pct || 0)) / 100;
  return Math.max(0, +(valor_bruto - imposto).toFixed(2));
}

/******************************************************
 * CONSTANTES DE UI
 ******************************************************/
const PAGE_SIZE = 10;

/******************************************************
 * COMPONENTE PRINCIPAL
 ******************************************************/
export default function ComissoesPage() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"a_pagar" | "pagas">("a_pagar");

  // Filtros globais (ordem solicitada):
  // "Filtro do Vendedor - Data do Recibo - Imposto (%) - Chip Ocultar/expandir - Chip Recibo - Chip Estorno"
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState<string | undefined>();

  const [dataRecibo, setDataRecibo] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [impostoPct, setImpostoPct] = useState<number>(0);

  const [colapsado, setColapsado] = useState<boolean>(false); // Chip Ocultar/expandir
  const [reciboAberto, setReciboAberto] = useState<boolean>(false); // Chip Recibo
  const [estornoAberto, setEstornoAberto] = useState<boolean>(false); // Chip Estorno

  // Dados
  const [aPagar, setAPagar] = useState<Venda[]>([]);
  const [pagas, setPagas] = useState<Venda[]>([]);

  // Pesquisa e paginação (Comissões Pagas)
  const [searchPago, setSearchPago] = useState("");
  const [pagePago, setPagePago] = useState(1);

  // Dialogos e estados auxiliares
  const [dlgPagamentoOpen, setDlgPagamentoOpen] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);
  const [dlgEstornoOpen, setDlgEstornoOpen] = useState(false);
  const [estornoProposta, setEstornoProposta] = useState("");
  const [estornoBuscaVenda, setEstornoBuscaVenda] = useState<Venda | null>(null);
  const [estornoValorBruto, setEstornoValorBruto] = useState<number>(0);

  const carregarVendedores = useCallback(async () => {
    const { data, error } = await supabase
      .from("vendedores")
      .select("id, nome")
      .order("nome", { ascending: true });
    if (!error) setVendedores(data || []);
  }, []);

  const carregarAPagar = useCallback(async () => {
    setLoading(true);
    // Exemplo de view/edge simplificada: traga vendas com parcelas não pagas
    const { data, error } = await supabase.rpc("crm_listar_comissoes_a_pagar", {
      p_vendedor_id: vendedorId || null,
    });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const vendas: Venda[] = (data || []).map((v: any) => ({
      id: v.id,
      proposta: v.proposta,
      cliente_nome: v.cliente_nome,
      vendedor_id: v.vendedor_id,
      created_at: v.created_at,
      comissoes: (v.parcelas || []).map((p: any) => ({
        id: p.id,
        venda_id: p.venda_id,
        numero: p.numero,
        valor_bruto: p.valor_bruto,
        imposto_pct: impostoPct || 0,
        valor_liquido: calcLiquido(p.valor_bruto, impostoPct || 0),
        vencimento: p.vencimento,
        paga_em: p.paga_em,
        recibo_id: p.recibo_id,
        selecionada: false, // NÃO pré-selecionar as parcelas (pedido do Wesley)
      })),
    }));

    setAPagar(vendas);
    setLoading(false);
  }, [vendedorId, impostoPct]);

  const carregarPagas = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("crm_listar_comissoes_pagas", {
      p_vendedor_id: vendedorId || null,
    });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const vendas: Venda[] = (data || []).map((v: any) => ({
      id: v.id,
      proposta: v.proposta,
      cliente_nome: v.cliente_nome,
      vendedor_id: v.vendedor_id,
      created_at: v.created_at,
      comissoes: (v.parcelas || []).map((p: any) => ({
        id: p.id,
        venda_id: p.venda_id,
        numero: p.numero,
        valor_bruto: p.valor_bruto,
        imposto_pct: p.imposto_pct ?? impostoPct ?? 0,
        valor_liquido: calcLiquido(p.valor_bruto, p.imposto_pct ?? impostoPct ?? 0),
        vencimento: p.vencimento,
        paga_em: p.paga_em,
        recibo_id: p.recibo_id,
        selecionada: false,
      })),
    }));

    setPagas(vendas);
    setLoading(false);
  }, [vendedorId, impostoPct]);

  useEffect(() => {
    carregarVendedores();
  }, [carregarVendedores]);

  useEffect(() => {
    carregarAPagar();
  }, [carregarAPagar]);

  useEffect(() => {
    carregarPagas();
  }, [carregarPagas]);

  // KPI helpers
  const kpisAPagar = useMemo(() => {
    const totalBruto = aPagar.flatMap(v => v.comissoes).reduce((acc, p) => acc + (p.paga_em ? 0 : p.valor_bruto), 0);
    const totalLiquido = aPagar.flatMap(v => v.comissoes).reduce((acc, p) => acc + (p.paga_em ? 0 : p.valor_liquido), 0);
    const qtdParcelas = aPagar.flatMap(v => v.comissoes).filter(p => !p.paga_em).length;
    return { totalBruto, totalLiquido, qtdParcelas };
  }, [aPagar]);

  const kpisPagas = useMemo(() => {
    const todas = pagas.flatMap(v => v.comissoes).filter(p => !!p.paga_em);
    const totalBruto = todas.reduce((acc, p) => acc + p.valor_bruto, 0);
    const totalLiquido = todas.reduce((acc, p) => acc + p.valor_liquido, 0);
    const qtdParcelas = todas.length;
    return { totalBruto, totalLiquido, qtdParcelas };
  }, [pagas]);

  // Pesquisa e paginação de "Comissões Pagas"
  const filtradasPagas = useMemo(() => {
    const q = searchPago.trim().toLowerCase();
    if (!q) return pagas;
    return pagas.filter(v =>
      v.proposta.toLowerCase().includes(q) ||
      (v.cliente_nome || "").toLowerCase().includes(q)
    );
  }, [pagas, searchPago]);

  const totalPages = Math.max(1, Math.ceil(filtradasPagas.length / PAGE_SIZE));
  const pageData = useMemo(() => {
    const start = (pagePago - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    // Mostrar mais recentes primeiro
    const ordered = [...filtradasPagas].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return ordered.slice(start, end);
  }, [filtradasPagas, pagePago]);

  useEffect(() => {
    // reset paginação quando pesquisa muda
    setPagePago(1);
  }, [searchPago]);

  // Seleções de parcelas para pagamento
  function toggleParcela(vendaId: UUID, parcelaId: UUID, checked: boolean) {
    setAPagar(prev => prev.map(v => {
      if (v.id !== vendaId) return v;
      return {
        ...v,
        comissoes: v.comissoes.map(p => p.id === parcelaId ? { ...p, selecionada: checked } : p),
      };
    }));
  }

  // Abrir diálogo de pagamento (por venda)
  function abrirPagamento(v: Venda) {
    setVendaSelecionada(v);
    setDlgPagamentoOpen(true);
  }

  async function confirmarPagamento() {
    if (!vendaSelecionada) return;
    setLoading(true);

    try {
      // Criar recibo (se "reciboAberto" estiver ativo, vamos criar/associar)
      let reciboId: string | null = null;
      if (reciboAberto) {
        const { data: rec, error: er } = await supabase
          .from("recibos")
          .insert({
            vendedor_id: vendedorId || vendaSelecionada.vendedor_id,
            data_recibo: dataRecibo,
            imposto_pct: impostoPct || 0,
          })
          .select()
          .single();
        if (er) throw er;
        reciboId = rec.id;
      }

      // Pagar parcelas selecionadas
      const selecionadas = vendaSelecionada.comissoes.filter(p => p.selecionada && !p.paga_em);
      if (selecionadas.length === 0) throw new Error("Selecione ao menos uma parcela para pagar.");

      const updates = selecionadas.map(p => ({
        id: p.id,
        paga_em: new Date().toISOString(),
        recibo_id: reciboId,
        imposto_pct: impostoPct || 0,
      }));

      const { error: upErr } = await supabase.from("parcelas_comissao").upsert(updates);
      if (upErr) throw upErr;

      setDlgPagamentoOpen(false);
      setVendaSelecionada(null);

      // recarregar
      await carregarAPagar();
      await carregarPagas();
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ESTORNO
  function abrirEstornoOverlay() {
    setDlgEstornoOpen(true);
    setEstornoAberto(true);
  }

  async function buscarVendaPorProposta() {
    if (!estornoProposta.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("crm_buscar_venda_por_proposta", {
        p_proposta: estornoProposta.trim(),
      });
      if (error) throw error;
      if (!data) throw new Error("Proposta não encontrada.");

      const v: Venda = {
        id: data.id,
        proposta: data.proposta,
        cliente_nome: data.cliente_nome,
        vendedor_id: data.vendedor_id,
        created_at: data.created_at,
        comissoes: (data.parcelas || []).map((p: any) => ({
          id: p.id,
          venda_id: p.venda_id,
          numero: p.numero,
          valor_bruto: p.valor_bruto,
          imposto_pct: p.imposto_pct ?? impostoPct ?? 0,
          valor_liquido: calcLiquido(p.valor_bruto, p.imposto_pct ?? impostoPct ?? 0),
          vencimento: p.vencimento,
          paga_em: p.paga_em,
          recibo_id: p.recibo_id,
        })),
      };
      setEstornoBuscaVenda(v);

      // Sugerir valor de estorno padrão = soma das parcelas pagas (bruto)
      const totalPagoBruto = v.comissoes.filter(p => !!p.paga_em).reduce((acc, p) => acc + p.valor_bruto, 0);
      setEstornoValorBruto(+totalPagoBruto.toFixed(2));
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmarEstorno() {
    if (!estornoBuscaVenda) return;
    const bruto = Number(estornoValorBruto || 0);
    if (bruto <= 0) return alert("Informe um valor de estorno válido.");

    setLoading(true);
    try {
      // Calcular líquido com base no imposto atual na UI
      const liquido = calcLiquido(bruto, impostoPct || 0);
      const payload = {
        venda_id: estornoBuscaVenda.id,
        valor_bruto: bruto,
        valor_liquido: liquido,
      };

      const { error } = await supabase.from("estornos").insert(payload);
      if (error) throw error;

      // Atualizar KPIs/dados
      await carregarAPagar();
      await carregarPagas();

      setDlgEstornoOpen(false);
      setEstornoBuscaVenda(null);
      setEstornoProposta("");
      setEstornoValorBruto(0);
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // RENDERIZAÇÃO
  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <Card className="w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Comissões</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="cursor-pointer" onClick={() => setColapsado(v => !v)}>
                  {colapsado ? "Expandir" : "Ocultar"}
                </Badge>
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setReciboAberto(v => !v)}>
                  {reciboAberto ? "Recibo: Ativo" : "Recibo: Inativo"}
                </Badge>
                <Badge variant="destructive" className="cursor-pointer" onClick={abrirEstornoOverlay}>
                  Estorno
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* Filtro do Vendedor */}
            <div>
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={(v) => setVendedorId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {vendedores.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data do Recibo */}
            <div>
              <Label>Data do Recibo</Label>
              <Input type="date" value={dataRecibo} onChange={e => setDataRecibo(e.target.value)} />
            </div>

            {/* Imposto (%) */}
            <div>
              <Label>Imposto (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={impostoPct}
                onChange={e => setImpostoPct(Number(e.target.value))}
              />
            </div>

            {/* Chip Ocultar/Expandir - já no header */}
            <div className="flex items-end">
              <Badge variant="outline" className="cursor-pointer" onClick={() => setColapsado(v => !v)}>
                {colapsado ? "Expandir" : "Ocultar"}
              </Badge>
            </div>

            {/* Chip Recibo - já no header */}
            <div className="flex items-end">
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setReciboAberto(v => !v)}>
                {reciboAberto ? "Recibo: Ativo" : "Recibo: Inativo"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4"/> A pagar (Bruto)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{currency(kpisAPagar.totalBruto)}</div>
            <div className="text-xs text-muted-foreground">{kpisAPagar.qtdParcelas} parcelas</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> A pagar (Líquido)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{currency(kpisAPagar.totalLiquido)}</div>
            <div className="text-xs text-muted-foreground">Base: imposto {pct(impostoPct)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Pagas (Líquido)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{currency(kpisPagas.totalLiquido)}</div>
            <div className="text-xs text-muted-foreground">{kpisPagas.qtdParcelas} parcelas quitadas</div>
          </CardContent>
        </Card>
      </section>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="a_pagar">Detalhamento de Comissões (a pagar)</TabsTrigger>
          <TabsTrigger value="pagas">Comissões Pagas</TabsTrigger>
        </TabsList>

        {/* A PAGAR */}
        <TabsContent value="a_pagar">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4"/> Vendas com parcelas a pagar</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3"><Loader2 className="w-4 h-4 animate-spin"/> Carregando…</div>
              )}

              {!loading && aPagar.length === 0 && (
                <div className="text-sm text-muted-foreground">Nenhum registro encontrado.</div>
              )}

              <div className="space-y-3">
                {aPagar.map((venda) => (
                  <div key={venda.id} className="border rounded-xl p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="font-semibold">Proposta {venda.proposta}</div>
                        <div className="text-xs text-muted-foreground">{venda.cliente_nome}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          className="bg-blue-600 hover:bg-blue-700" // Confirmar Pagamento AZUL (pedido do Wesley)
                          onClick={() => abrirPagamento(venda)}
                        >
                          Confirmar Pagamento
                        </Button>
                      </div>
                    </div>

                    {!colapsado && (
                      <div className="mt-3">
                        <div className="grid grid-cols-12 text-xs font-medium text-muted-foreground px-2">
                          <div className="col-span-1">#</div>
                          <div className="col-span-3">Vencimento</div>
                          <div className="col-span-3">Bruto</div>
                          <div className="col-span-3">Líquido</div>
                          <div className="col-span-2">Pagar</div>
                        </div>
                        <Separator className="my-2"/>
                        <div className="space-y-2">
                          {venda.comissoes.filter(p => !p.paga_em).map(par => (
                            <div key={par.id} className="grid grid-cols-12 items-center px-2">
                              <div className="col-span-1">{par.numero}</div>
                              <div className="col-span-3">{format(new Date(par.vencimento), "dd/MM/yyyy")}</div>
                              <div className="col-span-3">{currency(par.valor_bruto)}</div>
                              <div className="col-span-3">{currency(calcLiquido(par.valor_bruto, impostoPct))}</div>
                              <div className="col-span-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={!!par.selecionada}
                                    onCheckedChange={(ck: any) => toggleParcela(venda.id, par.id, !!ck)}
                                  />
                                  <span className="text-xs text-muted-foreground">Selecionar</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAGAS */}
        <TabsContent value="pagas">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Comissões Pagas</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                    <Input
                      className="pl-8 w-64"
                      placeholder="Pesquisar por proposta ou cliente…"
                      value={searchPago}
                      onChange={e => setSearchPago(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3"><Loader2 className="w-4 h-4 animate-spin"/> Carregando…</div>
              )}

              {!loading && pageData.length === 0 && (
                <div className="text-sm text-muted-foreground">Nenhuma comissão paga encontrada.</div>
              )}

              <div className="space-y-3">
                {pageData.map(venda => (
                  <div key={venda.id} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">Proposta {venda.proposta}</div>
                        <div className="text-xs text-muted-foreground">{venda.cliente_nome}</div>
                      </div>
                      {/* Em "Comissões pagas" tirar o pacote, deixar somente os links dos arquivos ->
                          Supondo que haja colunas com URLs dos comprovantes no backend; aqui placeholders */}
                      <div className="flex items-center gap-2 text-sm">
                        {/* Links (placeholders) */}
                        <a className="underline" href={`#/comprovante/${venda.id}`} target="_blank" rel="noreferrer">Comprovante</a>
                        <a className="underline" href={`#/recibo/${venda.id}`} target="_blank" rel="noreferrer">Recibo</a>
                      </div>
                    </div>

                    {!colapsado && (
                      <div className="mt-3">
                        <div className="grid grid-cols-12 text-xs font-medium text-muted-foreground px-2">
                          <div className="col-span-1">#</div>
                          <div className="col-span-3">Vencimento</div>
                          <div className="col-span-3">Bruto</div>
                          <div className="col-span-3">Líquido</div>
                          <div className="col-span-2">Pago em</div>
                        </div>
                        <Separator className="my-2"/>
                        <div className="space-y-2">
                          {venda.comissoes.filter(p => !!p.paga_em).map(par => (
                            <div key={par.id} className="grid grid-cols-12 items-center px-2">
                              <div className="col-span-1">{par.numero}</div>
                              <div className="col-span-3">{format(new Date(par.vencimento), "dd/MM/yyyy")}</div>
                              <div className="col-span-3">{currency(par.valor_bruto)}</div>
                              <div className="col-span-3">{currency(par.valor_liquido)}</div>
                              <div className="col-span-2">{par.paga_em ? format(new Date(par.paga_em), "dd/MM/yyyy") : "-"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Paginação 10 por página, mais recentes na página 1 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-xs text-muted-foreground">
                    Página {pagePago} de {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPagePago(p => Math.max(1, p - 1))} disabled={pagePago === 1}>
                      <ChevronLeft className="w-4 h-4"/>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPagePago(p => Math.min(totalPages, p + 1))} disabled={pagePago === totalPages}>
                      <ChevronRight className="w-4 h-4"/>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG: Confirmar Pagamento */}
      <Dialog open={dlgPagamentoOpen} onOpenChange={setDlgPagamentoOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          {vendaSelecionada ? (
            <div className="space-y-3">
              <div className="text-sm">
                <div><span className="font-medium">Proposta:</span> {vendaSelecionada.proposta}</div>
                <div className="text-muted-foreground">{vendaSelecionada.cliente_nome}</div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Data do Recibo</Label>
                  <Input type="date" value={dataRecibo} onChange={e => setDataRecibo(e.target.value)} />
                </div>
                <div>
                  <Label>Imposto (%)</Label>
                  <Input type="number" step="0.01" value={impostoPct} onChange={e => setImpostoPct(Number(e.target.value))} />
                </div>
                <div className="flex items-end gap-2">
                  <Checkbox checked={reciboAberto} onCheckedChange={(ck: any) => setReciboAberto(!!ck)} />
                  <span className="text-sm">Gerar Recibo</span>
                </div>
              </div>

              <div className="border rounded-xl p-2">
                <div className="grid grid-cols-12 text-xs font-medium text-muted-foreground px-2">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">Vencimento</div>
                  <div className="col-span-3">Bruto</div>
                  <div className="col-span-3">Líquido</div>
                  <div className="col-span-2">Selecionar</div>
                </div>
                <Separator className="my-2"/>
                <div className="max-h-64 overflow-auto space-y-2">
                  {vendaSelecionada.comissoes.filter(p => !p.paga_em).map(par => (
                    <div key={par.id} className="grid grid-cols-12 items-center px-2">
                      <div className="col-span-1">{par.numero}</div>
                      <div className="col-span-3">{format(new Date(par.vencimento), "dd/MM/yyyy")}</div>
                      <div className="col-span-3">{currency(par.valor_bruto)}</div>
                      <div className="col-span-3">{currency(calcLiquido(par.valor_bruto, impostoPct))}</div>
                      <div className="col-span-2">
                        <Checkbox
                          checked={!!par.selecionada}
                          onCheckedChange={(ck: any) => toggleParcela(vendaSelecionada.id, par.id, !!ck)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-sm text-muted-foreground">Nenhuma venda selecionada.</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgPagamentoOpen(false)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={confirmarPagamento} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : "Confirmar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Estorno */}
      <Dialog open={dlgEstornoOpen} onOpenChange={setDlgEstornoOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar Estorno</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 items-end">
              <div className="col-span-2">
                <Label>Nº da Proposta</Label>
                <Input
                  placeholder="Digite o nº da proposta"
                  value={estornoProposta}
                  onChange={e => setEstornoProposta(e.target.value)}
                />
              </div>
              <div>
                <Button variant="secondary" onClick={buscarVendaPorProposta} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : "Buscar"}
                </Button>
              </div>
            </div>

            {estornoBuscaVenda && (
              <div className="border rounded-xl p-3 space-y-2">
                <div className="text-sm">
                  <div><span className="font-medium">Proposta:</span> {estornoBuscaVenda.proposta}</div>
                  <div className="text-muted-foreground">{estornoBuscaVenda.cliente_nome}</div>
                </div>

                {/* Resumo: Proposta - Total Pago - Imposto - Pago Líquido - Estorno (Bruto) - Estorno (Líquido) */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                  <div className="p-2 bg-muted rounded">
                    <div className="text-xs text-muted-foreground">Total Pago</div>
                    <div className="font-medium">{currency(estornoBuscaVenda.comissoes.filter(p => !!p.paga_em).reduce((a, b) => a + b.valor_bruto, 0))}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="text-xs text-muted-foreground">Imposto</div>
                    <div className="font-medium">{pct(impostoPct)}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="text-xs text-muted-foreground">Pago Líquido</div>
                    <div className="font-medium">{currency(estornoBuscaVenda.comissoes.filter(p => !!p.paga_em).reduce((a, b) => a + calcLiquido(b.valor_bruto, impostoPct), 0))}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="text-xs text-muted-foreground">Estorno (Bruto)</div>
                    <Input
                      type="number"
                      step="0.01"
                      value={estornoValorBruto}
                      onChange={e => setEstornoValorBruto(Number(e.target.value))}
                    />
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="text-xs text-muted-foreground">Estorno (Líquido)</div>
                    <div className="font-medium">{currency(calcLiquido(Number(estornoValorBruto || 0), impostoPct))}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgEstornoOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarEstorno} disabled={loading || !estornoBuscaVenda}>Confirmar Estorno</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
