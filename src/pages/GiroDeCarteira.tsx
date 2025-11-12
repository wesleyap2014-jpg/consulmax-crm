// src/pages/GiroDeCarteira.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// UI (locais)
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Loader2, RefreshCcw, Phone, MessageCircle, Mail, CheckCircle2,
  CalendarClock, Users, ArrowRight, Info, Link as LinkIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* =============== Pill (substitui Badge) ================= */
function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        "bg-gray-100 text-gray-800 border-gray-200",
        className
      )}
    >
      {children}
    </span>
  );
}

/* =============== Tipos ================= */
type GiroTask = {
  id: string;
  cliente_id: string | null;
  lead_id: string | null;
  owner_auth_id: string | null;
  carteira_total: number | null;
  faixa: string;
  periodicidade_meses: number | null;
  due_date: string | null;
  last_done_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Cliente = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
};

/* =============== Helpers ================= */
function brMoney(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "R$ 0,00";
  try { return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  catch { return `R$ ${Number(n).toFixed(2)}`; }
}

function fmtDateISO(d?: string | null) {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "-";
  try { return dt.toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" }); }
  catch { return dt.toLocaleDateString("pt-BR"); }
}

function onlyDigits(s?: string | null) {
  return (s || "").replace(/\D+/g, "");
}

function waLink(phone?: string | null, text?: string) {
  const digits = onlyDigits(phone);
  if (!digits) return null;
  const encoded = encodeURIComponent(text || "");
  return `https://wa.me/55${digits}?text=${encoded}`;
}

const canalOptions = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "ligacao", label: "Ligação", icon: Phone },
  { key: "email", label: "E-mail", icon: Mail },
  { key: "presencial", label: "Presencial", icon: Users },
] as const;

/* =============== Error Boundary local ================= */
class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  constructor(props: any) { super(props); this.state = { error: undefined }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: any, info: any) {
    console.error("[GiroDeCarteira] runtime error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 md:p-6">
          <Card>
            <CardHeader>
              <CardTitle>Erro ao carregar “Giro de Carteira”</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-red-700">
              {String(this.state.error.message || this.state.error)}
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =============== Hook: dialog seguro (lazy + try/catch) ================= */
function useSafeDialog() {
  const [dlg, setDlg] = useState<null | {
    Dialog: any; DialogContent: any; DialogDescription: any; DialogFooter: any;
    DialogHeader: any; DialogTitle: any; DialogTrigger: any;
  }>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await import("@/components/ui/dialog");
        if (!alive) return;
        setDlg({
          Dialog: mod.Dialog,
          DialogContent: mod.DialogContent,
          DialogDescription: mod.DialogDescription,
          DialogFooter: mod.DialogFooter,
          DialogHeader: mod.DialogHeader,
          DialogTitle: mod.DialogTitle,
          DialogTrigger: mod.DialogTrigger,
        });
      } catch (e) {
        console.warn("[GiroDeCarteira] dialog não disponível, seguindo sem modal.", e);
      }
    })();
    return () => { alive = false; };
  }, []);
  return dlg;
}

/* =============== Componente ================= */
export default function GiroDeCarteira() {
  return (
    <PageErrorBoundary>
      <InnerGiroDeCarteira />
    </PageErrorBoundary>
  );
}

function InnerGiroDeCarteira() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<GiroTask[]>([]);
  const [clientes, setClientes] = useState<Record<string, Cliente>>({});
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [count, setCount] = useState<number>(0);
  const [search, setSearch] = useState<string>("");

  // Modal state
  const [openId, setOpenId] = useState<string | null>(null);
  const [canal, setCanal] = useState<typeof canalOptions[number]["key"]>("whatsapp");
  const [resumo, setResumo] = useState<string>("");
  const [pediuIndicacao, setPediuIndicacao] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const [lastError, setLastError] = useState<string | null>(null);

  const dlg = useSafeDialog();

  const openFor = (taskId: string) => {
    setOpenId(taskId);
    setCanal("whatsapp");
    setResumo("");
    setPediuIndicacao(true);
  };

  async function fetchAll() {
    setLoading(true);
    setLastError(null);
    try {
      const [adminRes, countRes, batchRes] = await Promise.allSettled([
        supabase.rpc("current_user_is_admin"),
        supabase.rpc("giro_due_count"),
        supabase.rpc("next_giro_batch"),
      ]);

      if (adminRes.status === "fulfilled") setIsAdmin(Boolean(adminRes.value.data));
      if (countRes.status === "fulfilled") setCount(Number(countRes.value.data || 0));

      let list: GiroTask[] = [];
      if (batchRes.status === "fulfilled" && Array.isArray(batchRes.value.data)) {
        list = batchRes.value.data as GiroTask[];
      }
      setTasks(list);

      // carregar clientes
      const ids = Array.from(new Set(list.map(t => t?.cliente_id).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: cls, error } = await supabase
          .from("clientes")
          .select("id,nome,telefone,email,observacoes")
          .in("id", ids);
        if (error) throw error;
        const map: Record<string, Cliente> = {};
        (cls || []).forEach((c: any) => { if (c?.id) map[c.id] = c; });
        setClientes(map);
      } else {
        setClientes({});
      }
    } catch (e: any) {
      console.error("[GiroDeCarteira] fetchAll error:", e);
      setLastError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function doRefresh() {
    setRefreshing(true);
    setLastError(null);
    try {
      const [countRes, batchRes] = await Promise.allSettled([
        supabase.rpc("giro_due_count"),
        supabase.rpc("next_giro_batch"),
      ]);
      if (countRes.status === "fulfilled") setCount(Number(countRes.value.data || 0));

      let list: GiroTask[] = [];
      if (batchRes.status === "fulfilled" && Array.isArray(batchRes.value.data)) {
        list = batchRes.value.data as GiroTask[];
      }
      setTasks(list);

      const ids = Array.from(new Set(list.map(t => t?.cliente_id).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: cls, error } = await supabase
          .from("clientes")
          .select("id,nome,telefone,email,observacoes")
          .in("id", ids);
        if (error) throw error;
        const map: Record<string, Cliente> = {};
        (cls || []).forEach((c: any) => { if (c?.id) map[c.id] = c; });
        setClientes(map);
      } else {
        setClientes({});
      }
    } catch (e: any) {
      console.error("[GiroDeCarteira] refresh error:", e);
      setLastError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => {
      const c = t?.cliente_id ? clientes[t.cliente_id] : undefined;
      const name = (c?.nome || "").toLowerCase();
      const tel = onlyDigits(c?.telefone);
      const faixa = (t?.faixa || "").toLowerCase();
      return name.includes(q) || tel.includes(q) || faixa.includes(q);
    });
  }, [tasks, search, clientes]);

  const handleSave = async () => {
    if (!openId) return;
    setSaving(true);
    setLastError(null);
    try {
      const { error } = await supabase.rpc("mark_giro_done", {
        p_task_id: openId,
        p_canal: canal,
        p_resumo: resumo || null,
        p_pediu_indicacao: pediuIndicacao,
      });
      if (error) throw error;
      setOpenId(null);
      await doRefresh();
    } catch (e: any) {
      console.error("[GiroDeCarteira] mark_giro_done error:", e);
      setLastError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Giro de Carteira</h1>
          <p className="text-sm text-gray-600">
            Recorrência de relacionamento com clientes e pedido de indicação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill className={count > 0 ? "bg-[#A11C27] text-white border-[#8f1822]" : ""}>
            🔔 Pendências de hoje: {count}
          </Pill>
          <Button variant="outline" onClick={doRefresh}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Aviso de erro leve */}
      {lastError && (
        <Card>
          <CardContent className="text-sm text-red-700">
            {lastError}
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="w-4 h-4" />
            Filtro rápido
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <Label htmlFor="q">Buscar por nome/telefone/faixa</Label>
            <Input
              id="q"
              placeholder="Ex.: Maria, 6999..., 300-600"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[220px]">
            <Label>Perfil</Label>
            <div className="mt-2">
              <Pill>{isAdmin ? "Admin — vê todas" : "Vendedor — só suas tarefas"}</Pill>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {loading ? (
          <Card className="col-span-1 xl:col-span-2 h-32 flex items-center justify-center">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Carregando tarefas…
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="col-span-1 xl:col-span-2">
            <CardContent className="py-10 text-center text-gray-500">
              Nenhuma pendência para hoje. 👌
            </CardContent>
          </Card>
        ) : (
          filtered.map((t, idx) => {
            const c = t?.cliente_id ? clientes[t.cliente_id] : undefined;
            const phoneClean = onlyDigits(c?.telefone);
            const msg = [
              `Olá, ${c?.nome || "tudo bem"}? Aqui é da Consulmax.`,
              `Estou acompanhando seu grupo e te trazendo um panorama rápido.`,
              `Quando puder, te explico as últimas contemplações e próximos passos 😉`,
            ].join(" ");
            const wa = waLink(c?.telefone, msg);

            const key = t?.id || `task-${idx}`;

            return (
              <Card key={key} className="relative overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {c?.nome || "Cliente sem cadastro"}
                      </CardTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <Pill>Faixa: {t?.faixa || "-"}</Pill>
                        <Pill>Carteira: {brMoney(t?.carteira_total)}</Pill>
                        <Pill>Periodicidade: {t?.periodicidade_meses || 0} meses</Pill>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Data</div>
                      <div className={cn(
                        "text-sm font-medium",
                        t?.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()
                          ? "text-[#A11C27]" : ""
                      )}>
                        {fmtDateISO(t?.due_date)}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium">Telefone:</span>{" "}
                      {phoneClean ? (
                        <a
                          href={wa || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#1E293F] hover:underline"
                          title="Abrir no WhatsApp"
                        >
                          {c?.telefone}
                          <LinkIcon className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">E-mail:</span>{" "}
                      {c?.email || <span className="text-gray-500">—</span>}
                    </div>
                    <div className="text-sm line-clamp-2">
                      <span className="font-medium">Observações:</span>{" "}
                      {c?.observacoes || <span className="text-gray-500">—</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex" title="WhatsApp com template">
                        <Button variant="secondary">
                          <MessageCircle className="w-4 h-4 mr-2" />
                          WhatsApp
                        </Button>
                      </a>
                    )}

                    {dlg ? (
                      <dlg.Dialog open={openId === t.id} onOpenChange={(v: boolean) => setOpenId(v ? (t.id as string) : null)}>
                        <dlg.DialogTrigger asChild>
                          <Button onClick={() => openFor(String(t.id))} className="bg-[#A11C27] hover:bg-[#8f1822]">
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Registrar Giro
                          </Button>
                        </dlg.DialogTrigger>
                        <dlg.DialogContent>
                          <dlg.DialogHeader>
                            <dlg.DialogTitle>Registrar Giro</dlg.DialogTitle>
                            <dlg.DialogDescription>
                              Confirme o contato realizado e agendaremos a próxima data automaticamente.
                            </dlg.DialogDescription>
                          </dlg.DialogHeader>

                          <div className="grid gap-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {canalOptions.map((opt) => {
                                const Icon = opt.icon;
                                const active = canal === opt.key;
                                return (
                                  <Button
                                    key={opt.key}
                                    variant={active ? "default" : "outline"}
                                    className={cn(active ? "bg-[#1E293F] hover:bg-[#1b2538]" : "")}
                                    onClick={() => setCanal(opt.key)}
                                  >
                                    <Icon className="w-4 h-4 mr-2" />
                                    {opt.label}
                                  </Button>
                                );
                              })}
                            </div>

                            <div className="space-y-1">
                              <Label>Resumo do contato</Label>
                              <Textarea
                                placeholder="Ex.: Acompanhei assembleia, posicionei cliente e pedi indicação."
                                value={resumo}
                                onChange={(e) => setResumo(e.target.value)}
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                id="ind"
                                type="checkbox"
                                className="h-4 w-4"
                                checked={pediuIndicacao}
                                onChange={(e) => setPediuIndicacao(e.target.checked)}
                              />
                              <Label htmlFor="ind">Pedi indicação</Label>
                            </div>
                          </div>

                          <dlg.DialogFooter className="mt-2">
                            <Button variant="outline" onClick={() => setOpenId(null)}>
                              Cancelar
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                              Confirmar
                            </Button>
                          </dlg.DialogFooter>
                        </dlg.DialogContent>
                      </dlg.Dialog>
                    ) : (
                      // fallback
                      <Button onClick={() => openFor(String(t.id))} className="bg-[#A11C27] hover:bg-[#8f1822]">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Registrar Giro
                      </Button>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-3.5 h-3.5" />
                    Criada em {fmtDateISO(t?.created_at)}
                  </div>
                  <div>
                    Último giro: {t?.last_done_at ? fmtDateISO(t.last_done_at) : "—"}
                  </div>
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>

      {/* Debug leve — remova quando estabilizar */}
      <div className="text-[11px] text-gray-500">
        debug: tasks={tasks.length} • admin={String(isAdmin)} • count={count}
      </div>
    </div>
  );
}
