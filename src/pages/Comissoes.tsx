// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
  Trash2,
  Eye,
  Search,
  ChevronDown,
  ChevronUp,
  Receipt,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;
type User = {
  id: UUID;
  auth_user_id?: UUID | null;
  nome: string | null;
  email: string | null;
  role?: "admin" | "vendedor" | string | null;
};
type UserSecure = {
  id: UUID;
  nome: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  pix_key: string | null;
  cpf: string | null;
};
type SimTable = { id: UUID; segmento: string; nome_tabela: string; admin_id?: UUID | null };
type Venda = {
  id: UUID;
  data_venda: string;
  vendedor_id: UUID;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  valor_venda: number | null;
  numero_proposta?: string | null;
  status?: string | null; // Adicionado para filtro de canceladas
  encarteirada?: boolean | null; // Adicionado para filtro de encarteiradas
};
type Commission = {
  id: UUID;
  venda_id: UUID;
  vendedor_id: UUID;
  sim_table_id: UUID | null;
  data_venda: string | null;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  valor_venda: number | null;
  base_calculo: number | null;
  percent_aplicado: number | null;
  valor_total: number | null;
  status: "a_pagar" | "pago" | "estorno";
  data_pagamento: string | null;
  cliente_nome?: string | null;
  numero_proposta?: string | null;
  venda_status?: string | null;
};
type CommissionFlow = {
  id: UUID;
  commission_id: UUID;
  mes: number;
  percentual: number;
  valor_previsto: number | null;
  valor_pago_vendedor: number | null;
  data_pagamento_vendedor: string | null;
};
type CommissionRule = {
  id?: string;
  vendedor_id: string;
  sim_table_id: string;
  percent_padrao: number;
  fluxo_meses: number;
  fluxo_percentuais: number[];
  obs: string | null;
};

/* ========================= Helpers ========================= */
const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toDateInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatISODateBR = (iso?: string | null) => (!iso ? "—" : iso.split("-").reverse().join("/"));

/* ========================= Componente Principal ========================= */
export default function ComissoesPage() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Filtros e Dados
  const [loading, setLoading] = useState(false);
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">("all");
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  
  // Parâmetro de Imposto Fixo (Item 5)
  const [taxConfig, setTaxConfig] = useState<number>(6.0); 

  // Modal Regras (Item 6)
  const [openRules, setOpenRules] = useState(false);
  const [ruleRows, setRuleRows] = useState<any[]>([]);

  /* 1. Auth & Initial Load */
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setAuthUserId(auth?.user?.id ?? null);

      const [{ data: u }, { data: st }, { data: us }] = await Promise.all([
        supabase.from("users").select("*").order("nome"),
        supabase.from("sim_tables").select("*"),
        supabase.from("users_secure").select("*"),
      ]);

      setUsers(u || []);
      setSimTables(st || []);
      setUsersSecure(us || []);

      const current = (u || []).find((x: any) => x.auth_user_id === auth?.user?.id);
      if (current) {
        setCurrentUser(current);
        const isAdm = current.role === "admin";
        setIsAdmin(isAdm);
        if (!isAdm) setVendedorId(current.id);
      }
    })();
  }, []);

  useEffect(() => {
    if (authUserId) fetchData();
  }, [vendedorId, status, authUserId]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch Comissões
      let qb = supabase.from("commissions").select(`
        *,
        venda:vendas(status, numero_proposta, cliente_lead_id, lead_id)
      `);
      
      if (!isAdmin) qb = qb.eq("vendedor_id", currentUser?.id);
      else if (vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
      
      const { data: comms } = await qb;

      // Filtrar canceladas (Item 1)
      const activeComms = (comms || []).filter(c => (c.venda as any)?.status !== "cancelada");

      // Fetch Flows para cálculo de parcelas e % (Item 2 e 3)
      const ids = activeComms.map(c => c.id);
      const { data: flows } = await supabase
        .from("commission_flow")
        .select("*")
        .in("commission_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

      const flowMap: Record<string, CommissionFlow[]> = {};
      flows?.forEach(f => {
        if (!flowMap[f.commission_id]) flowMap[f.commission_id] = [];
        flowMap[f.commission_id].push(f);
      });

      setRows(activeComms.map(c => ({
        ...c,
        flow: flowMap[c.id] || [],
        venda_status: (c.venda as any)?.status,
        numero_proposta: (c.venda as any)?.numero_proposta
      })));

      // Vendas sem comissão - Apenas encarteiradas (Item 7)
      let qbV = supabase.from("vendas").select("*").eq("encarteirada", true);
      if (!isAdmin) qbV = qbV.eq("vendedor_id", currentUser?.id);
      const { data: vSem } = await qbV;
      
      // Filtrar as que já tem comissão
      const existingVendaIds = new Set(activeComms.map(c => c.venda_id));
      setVendasSemCom((vSem || []).filter(v => !existingVendaIds.has(v.id)));

    } finally {
      setLoading(false);
    }
  }

  /* 6. Agrupamento de Regras por Nome (Item 6) */
  const groupedTables = useMemo(() => {
    const uniqueNames = Array.from(new Set(simTables.map(t => t.nome_tabela)));
    return uniqueNames.map(name => {
      return simTables.find(t => t.nome_tabela === name);
    }).filter(Boolean);
  }, [simTables]);

  const saveCommissionRule = async (rule: CommissionRule) => {
    // Se salvar uma regra, aplica para todas as tabelas com mesmo nome (Item 6)
    const targetTable = simTables.find(t => t.id === rule.sim_table_id);
    const relatedTables = simTables.filter(t => t.nome_tabela === targetTable?.nome_tabela);
    
    const payloads = relatedTables.map(t => ({
      ...rule,
      sim_table_id: t.id
    }));

    const { error } = await supabase.from("commission_rules").upsert(payloads, { onConflict: "vendedor_id,sim_table_id" });
    if (!error) fetchData();
  };

  /* Geração de Recibo em PDF */
  const generatePDF = (comm: Commission, flows: CommissionFlow[]) => {
    const doc = new jsPDF();
    const vendor = usersSecure.find(u => u.id === comm.vendedor_id);
    const totalPago = flows.reduce((acc, f) => acc + (f.valor_pago_vendedor || 0), 0);
    const impostoValue = totalPago * (taxConfig / 100);
    const liquido = totalPago - impostoValue;

    doc.setFontSize(18);
    doc.text("RECIBO DE COMISSÃO", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Vendedor: ${vendor?.nome || 'Não identificado'}`, 20, 40);
    doc.text(`CPF: ${vendor?.cpf || '---'}`, 20, 48);
    doc.text(`Referente à Proposta: ${comm.numero_proposta || '---'}`, 20, 56);
    
    autoTable(doc, {
      startY: 70,
      head: [['Descrição', 'Valor Bruto', `Imposto (${taxConfig}%)`, 'Valor Líquido']],
      body: [[
        `Comissão - ${comm.tabela}`,
        BRL(totalPago),
        BRL(impostoValue),
        BRL(liquido)
      ]],
    });

    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 20, doc.lastAutoTable.finalY + 20);
    doc.save(`Recibo_${comm.numero_proposta}.pdf`);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50 min-h-screen">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão de Comissões</h1>
          <p className="text-slate-500 text-sm">Controle de pagamentos e fluxos</p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {isAdmin && (
            <Button variant="outline" onClick={() => setOpenRules(true)} className="flex-1 md:flex-none">
              <Settings className="w-4 h-4 mr-2" /> Regras
            </Button>
          )}
          <div className="flex items-center bg-white border rounded-md px-3 py-1 shadow-sm">
            <Label className="text-xs mr-2 text-slate-500">Imposto Fixo:</Label>
            <Input 
              type="number" 
              value={taxConfig} 
              onChange={(e) => setTaxConfig(Number(e.target.value))}
              className="w-16 h-8 border-none focus-visible:ring-0 font-bold"
              disabled={!isAdmin}
            />
            <span className="text-xs font-bold">%</span>
          </div>
        </div>
      </header>

      {/* Cards de Resumo - Adaptáveis Mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase font-semibold">Total a Receber</p>
            <p className="text-xl font-bold">{BRL(rows.reduce((acc, curr) => acc + (curr.valor_total || 0), 0))}</p>
          </CardContent>
        </Card>
        {/* ... outros cards ... */}
      </div>

      <Tabs defaultValue="commissions" className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-[400px]">
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="pending_vendas">Vendas s/ Com.</TabsTrigger>
        </TabsList>

        <TabsContent value="commissions" className="mt-4">
          <Card>
            <CardHeader className="px-4 py-3 border-b">
              <div className="flex flex-col md:flex-row gap-4 justify-between">
                <CardTitle className="text-lg">Relatório de Repasses</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {isAdmin && (
                    <Select value={vendedorId} onValueChange={setVendedorId}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="Vendedor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Vendedores</SelectItem>
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {/* Tabela Responsiva */}
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-4 py-3">Proposta / Cliente</th>
                    <th className="px-4 py-3">Pgto (Parcelas)</th>
                    <th className="px-4 py-3">% Pago</th>
                    <th className="px-4 py-3">Vl. Total</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="animate-spin mx-auto" /></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400">Nenhuma comissão encontrada.</td></tr>
                  ) : rows.map(row => {
                    // Item 2: Pgto (Parcelas pagas / totais)
                    const totalParcelas = row.flow?.length || 0;
                    const pagasParcelas = row.flow?.filter(f => (f.valor_pago_vendedor || 0) > 0).length || 0;

                    // Item 3: % Pago (Baseado no valor financeiro)
                    const totalPrevisto = row.valor_total || 1;
                    const totalRecebido = row.flow?.reduce((acc, f) => acc + (f.valor_pago_vendedor || 0), 0) || 0;
                    const percentPago = Math.min((totalRecebido / totalPrevisto) * 100, 100).toFixed(1);

                    return (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{row.numero_proposta}</div>
                          <div className="text-xs text-slate-500 truncate max-w-[150px]">{row.cliente_nome || "Cliente não informado"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pagasParcelas === totalParcelas ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {pagasParcelas}/{totalParcelas} Parc.
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1">
                            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${percentPago}%` }} />
                          </div>
                          <span className="text-[10px]">{percentPago}%</span>
                        </td>
                        <td className="px-4 py-3 font-semibold">{BRL(row.valor_total)}</td>
                        <td className="px-4 py-3 text-right space-x-1">
                          {/* Item 4: Vendedor só vê recibos, Admin faz tudo */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-blue-600"
                            onClick={() => generatePDF(row, row.flow || [])}
                          >
                            <Receipt className="w-4 h-4" />
                          </Button>
                          
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Item 7: Vendas sem Comissão (Apenas Encarteiradas) */}
        <TabsContent value="pending_vendas">
          <Card>
            <CardHeader><CardTitle className="text-lg">Vendas Aguardando Configuração de Comissão</CardTitle></CardHeader>
            <CardContent className="p-0">
               <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Proposta</th>
                    <th className="px-4 py-3">Valor Venda</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vendasSemCom.map(v => (
                    <tr key={v.id}>
                      <td className="px-4 py-3">{formatISODateBR(v.data_venda)}</td>
                      <td className="px-4 py-3">{v.numero_proposta}</td>
                      <td className="px-4 py-3">{BRL(v.valor_venda)}</td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin && (
                          <Button size="sm" variant="outline">
                            <PlusCircle className="w-3 h-3 mr-1" /> Gerar Comissão
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Item 6: Modal de Regras com agrupamento */}
      <Dialog open={openRules} onOpenChange={setOpenRules}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Regras de Comissionamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-md overflow-hidden">
               <div className="max-h-[400px] overflow-y-auto">
                  {groupedTables.map(table => (
                    <div key={table.id} className="p-3 border-b hover:bg-slate-50 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold">{table.nome_tabela}</p>
                        <p className="text-xs text-slate-500">{table.segmento}</p>
                      </div>
                      <Button size="sm" variant="ghost">Configurar</Button>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
