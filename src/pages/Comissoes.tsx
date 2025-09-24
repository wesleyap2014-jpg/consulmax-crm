// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

/* ========================= Tipos ========================= */
type UUID = string;

type Vendedor = { id: UUID; nome: string };
type Cliente = { id: UUID; nome: string };
type Administradora = { id: UUID; nome: string };

type Venda = {
  id: UUID;
  vendedor_id: UUID;
  cliente_id: UUID;
  cliente_nome?: string;
  proposta: string;
  administradora_id: UUID;
  administradora_nome?: string;
  credito: number;
  created_at: string;
};

type Comissao = {
  id: UUID;
  venda_id: UUID;
  vendedor_id: UUID;
  mes: number;
  percentual: number;
  valor_previsto: number;
  valor_pago_vendedor: number | null;
  data_pagamento_vendedor: string | null;
};

/* ======================= Helpers ========================= */
const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct100 = (v: number) => (v * 100).toFixed(2) + "%";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("pt-BR", { timeZone: "UTC" });

/* ========================= Página ======================== */
export default function Comissoes() {
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [admins, setAdmins] = useState<Administradora[]>([]);

  // dialog pagamento
  const [openPay, setOpenPay] = useState(false);
  const [payFlow, setPayFlow] = useState<Comissao[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: vds }, { data: cls }, { data: ads }, { data: vdsAll }, { data: cms }] =
        await Promise.all([
          supabase.from("vendedores").select("id,nome"),
          supabase.from("clientes").select("id,nome"),
          supabase.from("administradoras").select("id,nome"),
          supabase.from("vendas").select("*"),
          supabase.from("comissoes").select("*"),
        ]);

      setVendedores(vds ?? []);
      setClientes(cls ?? []);
      setAdmins(ads ?? []);
      setVendas(vdsAll ?? []);
      setComissoes(cms ?? []);
      setLoading(false);
    })();
  }, []);

  const vendasSemComissao = useMemo(() => {
    return vendas.filter((v) => !comissoes.find((c) => c.venda_id === v.id));
  }, [vendas, comissoes]);

  /* ========== Ações ========== */
  function gerarComissao(venda: Venda) {
    // simulação: apenas abre o diálogo com fluxo fictício
    const fluxo: Comissao[] = [
      {
        id: "temp1",
        venda_id: venda.id,
        vendedor_id: venda.vendedor_id,
        mes: 1,
        percentual: 0.0075,
        valor_previsto: venda.credito * 0.0075,
        valor_pago_vendedor: null,
        data_pagamento_vendedor: null,
      },
      {
        id: "temp2",
        venda_id: venda.id,
        vendedor_id: venda.vendedor_id,
        mes: 2,
        percentual: 0.005,
        valor_previsto: venda.credito * 0.005,
        valor_pago_vendedor: null,
        data_pagamento_vendedor: null,
      },
    ];
    setPayFlow(fluxo);
    setPaySelected({});
    setOpenPay(true);
  }

  const paySelectedParcels = useMemo(
    () => payFlow.filter((f) => paySelected[f.id]),
    [payFlow, paySelected]
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vendas sem comissão</CardTitle>
        </CardHeader>
        <CardContent>
          {vendasSemComissao.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma venda pendente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[800px] text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 text-left">Vendedor</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Proposta</th>
                    <th className="p-2 text-left">Administradora</th>
                    <th className="p-2 text-right">Crédito</th>
                    <th className="p-2 text-right">Data</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {vendasSemComissao.map((v) => (
                    <tr key={v.id} className="border-b">
                      <td className="p-2">
                        {vendedores.find((vd) => vd.id === v.vendedor_id)?.nome ??
                          v.vendedor_id}
                      </td>
                      <td className="p-2">
                        {clientes.find((c) => c.id === v.cliente_id)?.nome ??
                          v.cliente_id}
                      </td>
                      <td className="p-2">{v.proposta}</td>
                      <td className="p-2">
                        {admins.find((a) => a.id === v.administradora_id)?.nome ??
                          v.administradora_id}
                      </td>
                      <td className="p-2 text-right">{BRL(v.credito)}</td>
                      <td className="p-2 text-right">{fmtDate(v.created_at)}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" onClick={() => gerarComissao(v)}>
                          Gerar Comissão
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Registrar Pagamento */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Registrar pagamento ao vendedor</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="selecionar">
            <TabsList className="mb-3">
              <TabsTrigger value="selecionar">Selecionar parcelas</TabsTrigger>
              <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
            </TabsList>

            <TabsContent value="selecionar" className="space-y-3">
              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="p-2 text-left">Sel.</th>
                      <th className="p-2 text-left">Mês</th>
                      <th className="p-2 text-left">% Parcela</th>
                      <th className="p-2 text-right">Valor Previsto</th>
                      <th className="p-2 text-right">Valor Pago</th>
                      <th className="p-2 text-left">Data Pagto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payFlow.map((f) => (
                      <tr key={f.id} className="border-b">
                        <td className="p-2">
                          <Checkbox
                            checked={!!paySelected[f.id]}
                            onCheckedChange={(v) =>
                              setPaySelected((s) => ({
                                ...s,
                                [f.id]: !!v,
                              }))
                            }
                          />
                        </td>
                        <td className="p-2">M{f.mes}</td>
                        <td className="p-2">{pct100(f.percentual)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_previsto)}</td>
                        <td className="p-2 text-right">
                          {f.valor_pago_vendedor
                            ? BRL(f.valor_pago_vendedor)
                            : "—"}
                        </td>
                        <td className="p-2">
                          {f.data_pagamento_vendedor
                            ? fmtDate(f.data_pagamento_vendedor)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="arquivos">
              <p>Upload de comprovantes (em breve).</p>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button onClick={() => setOpenPay(false)} variant="secondary">
              Fechar
            </Button>
            {paySelectedParcels.length > 0 && (
              <Button onClick={() => alert("Registrar pagamento!")}>
                Registrar {paySelectedParcels.length} parcelas
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
