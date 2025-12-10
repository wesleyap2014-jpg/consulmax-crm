// src/pages/Planejamento.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Send, MessageCircle, Dog, X } from "lucide-react";

/* ========================= Tipos ========================= */

type UUID = string;

type UserProfile = {
  id: UUID;
  auth_user_id: UUID;
  nome: string;
  email: string;
  user_role: "admin" | "vendedor" | "gestor" | string;
  is_active?: boolean;
};

type WeeklyPlan = {
  id: UUID;
  user_id: UUID;
  role: string;
  date_start: string;
  date_end: string;
  theme: string | null;
  main_goal: string | null;
};

type WeeklyPlanItem = {
  id: UUID;
  plan_id: UUID;
  date_start: string;
  date_end: string;
  what: string | null;
  why: string | null;
  where_: string | null;
  when_: string | null;
  who: string | null;
  how: string | null;
  how_much: string | null;
  status: string;
};

type SalesPlaybook = {
  id: UUID;
  plan_id: UUID;
  segmento: string | null;
  produto: string | null;
  persona: string | null;
  dor_principal: string | null;
  big_idea: string | null;
  promessa: string | null;
  garantia: string | null;
  cta_principal: string | null;
  script_abertura: string | null;
  script_quebra_gelo: string | null;
  script_diagnostico: string | null;
  script_apresentacao: string | null;
  script_oferta: string | null;
  script_fechamento: string | null;
  script_followup: string | null;
};

type SalesObjection = {
  id: UUID;
  playbook_id: UUID;
  tag: string | null;
  objection_text: string | null;
  answer_text: string | null;
  next_step: string | null;
  priority: number;
};

type MaxMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/* ========================= Componente ========================= */

const Planejamento: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("vendedor");

  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");

  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [items, setItems] = useState<WeeklyPlanItem[]>([]);
  const [playbook, setPlaybook] = useState<SalesPlaybook | null>(null);
  const [objections, setObjections] = useState<SalesObjection[]>([]);

  const [maxMessages, setMaxMessages] = useState<MaxMessage[]>([]);
  const [maxInput, setMaxInput] = useState("");
  const [maxLoading, setMaxLoading] = useState(false);
  const [maxOpen, setMaxOpen] = useState(false); // controle do widget flutuante

  const isAdmin = useMemo(
    () => currentUser?.user_role === "admin",
    [currentUser]
  );

  /* ========================= Load user & collaborators ========================= */

  useEffect(() => {
    const loadUserAndUsers = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user)
          throw userError || new Error("Usuário não autenticado");

        const { data: profiles, error: profilesError } = await supabase
          .from("users")
          .select("id, auth_user_id, nome, email, user_role, is_active")
          .eq("auth_user_id", user.id)
          .limit(1);

        if (profilesError || !profiles || profiles.length === 0)
          throw profilesError || new Error("Perfil não encontrado");

        const me = profiles[0] as UserProfile;
        setCurrentUser(me);
        setSelectedUserId(me.id);

        if (me.user_role === "admin") {
          const { data: allUsers, error: allUsersError } = await supabase
            .from("users")
            .select("id, auth_user_id, nome, email, user_role, is_active")
            .eq("is_active", true)
            .order("nome", { ascending: true });

          if (allUsersError) throw allUsersError;
          setUsers((allUsers || []) as UserProfile[]);
        } else {
          setUsers([me]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadUserAndUsers();
  }, []);

  /* ========================= Carregar ou criar plano ========================= */

  const handleLoadOrCreatePlan = async () => {
    if (!selectedUserId || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const { data: existingPlans, error: planError } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("role", role)
        .eq("date_start", dateStart)
        .eq("date_end", dateEnd)
        .limit(1);

      if (planError) throw planError;

      let currentPlan: WeeklyPlan;

      if (existingPlans && existingPlans.length > 0) {
        currentPlan = existingPlans[0] as WeeklyPlan;
      } else {
        const { data: newPlanData, error: insertError } = await supabase
          .from("weekly_plans")
          .insert({
            user_id: selectedUserId,
            role,
            date_start: dateStart,
            date_end: dateEnd,
            theme: null,
            main_goal: null,
          })
          .select("*")
          .single();

        if (insertError) throw insertError;
        currentPlan = newPlanData as WeeklyPlan;
      }

      setPlan(currentPlan);

      const { data: planItems, error: itemsError } = await supabase
        .from("weekly_plan_items")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .order("date_start", { ascending: true });

      if (itemsError) throw itemsError;
      setItems((planItems || []) as WeeklyPlanItem[]);

      const { data: playbooks, error: pbError } = await supabase
        .from("sales_playbooks")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .limit(1);

      if (pbError) throw pbError;
      if (playbooks && playbooks.length > 0) {
        setPlaybook(playbooks[0] as SalesPlaybook);

        const { data: objData, error: objError } = await supabase
          .from("sales_objections")
          .select("*")
          .eq("playbook_id", playbooks[0].id)
          .order("priority", { ascending: true });

        if (objError) throw objError;
        setObjections((objData || []) as SalesObjection[]);
      } else {
        setPlaybook(null);
        setObjections([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ========================= Save plano / itens / playbook ========================= */

  const handleSavePlanHeader = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const { id, ...payload } = plan;
      const { error } = await supabase
        .from("weekly_plans")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = () => {
    if (!plan) return;
    const today = dateStart || new Date().toISOString().slice(0, 10);
    const newItem: WeeklyPlanItem = {
      id: `temp-${Math.random()}`,
      plan_id: plan.id,
      date_start: today,
      date_end: dateEnd || today,
      what: "",
      why: "",
      where_: "",
      when_: "",
      who: "",
      how: "",
      how_much: "",
      status: "planejado",
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleUpdateItemField = (
    id: string,
    field: keyof WeeklyPlanItem,
    value: any
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSaveItems = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const toInsert = items.filter((i) => i.id.startsWith("temp-"));
      const toUpdate = items.filter((i) => !i.id.startsWith("temp-"));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("weekly_plan_items")
          .insert(
            toInsert.map((i) => ({
              plan_id: plan.id,
              date_start: i.date_start,
              date_end: i.date_end,
              what: i.what,
              why: i.why,
              where_: i.where_,
              when_: i.when_,
              who: i.who,
              how: i.how,
              how_much: i.how_much,
              status: i.status,
            }))
          );
        if (insertError) throw insertError;
      }

      for (const item of toUpdate) {
        const { id, ...payload } = item;
        const { error: updateError } = await supabase
          .from("weekly_plan_items")
          .update(payload)
          .eq("id", id);
        if (updateError) throw updateError;
      }

      await handleLoadOrCreatePlan();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleEnsurePlaybook = async (): Promise<SalesPlaybook | null> => {
    if (!plan) return null;
    if (playbook) return playbook;

    try {
      const { data, error } = await supabase
        .from("sales_playbooks")
        .insert({
          plan_id: plan.id,
        })
        .select("*")
        .single();

      if (error) throw error;
      setPlaybook(data as SalesPlaybook);
      return data as SalesPlaybook;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const handleSavePlaybook = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const pb = await handleEnsurePlaybook();
      if (!pb && !playbook) return;

      const finalPb = playbook || pb!;
      const { id, ...payload } = finalPb;

      const { error } = await supabase
        .from("sales_playbooks")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveObjections = async () => {
    if (!playbook) return;
    setSaving(true);
    try {
      const toInsert = objections.filter((o) => o.id.startsWith("temp-"));
      const toUpdate = objections.filter((o) => !o.id.startsWith("temp-"));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("sales_objections")
          .insert(
            toInsert.map((o) => ({
              playbook_id: playbook.id,
              tag: o.tag,
              objection_text: o.objection_text,
              answer_text: o.answer_text,
              next_step: o.next_step,
              priority: o.priority,
            }))
          );
        if (insertError) throw insertError;
      }

      for (const obj of toUpdate) {
        const { id, ...payload } = obj;
        const { error: updateError } = await supabase
          .from("sales_objections")
          .update(payload)
          .eq("id", id);
        if (updateError) throw updateError;
      }

      await handleLoadOrCreatePlan();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddObjection = () => {
    if (!playbook) return;
    const newObj: SalesObjection = {
      id: `temp-${Math.random()}`,
      playbook_id: playbook.id,
      tag: "",
      objection_text: "",
      answer_text: "",
      next_step: "",
      priority: objections.length + 1,
    };
    setObjections((prev) => [...prev, newObj]);
  };

  /* ========================= Max - IA Consulmax ========================= */

  const pushMaxMessage = (role: "user" | "assistant", content: string) => {
    setMaxMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, content },
    ]);
  };

  const callMax = async (
    prompt: string,
    mode: "livre" | "estrategia" | "objeções" = "livre"
  ) => {
    if (!prompt.trim()) return;
    setMaxLoading(true);

    try {
      const context = {
        plan,
        items,
        playbook,
        objections,
        mode,
      };

      const res = await fetch("/api/max-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, mode, context }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Erro ao chamar /api/max-chat:", text);
        pushMaxMessage(
          "assistant",
          "Max não conseguiu responder agora. Verifique a chave de API na Vercel ou tente novamente em alguns instantes."
        );
        return;
      }

      const data = await res.json();
      const answer =
        (data as any)?.answer ||
        "Max pensou, mas não conseguiu responder agora. Tenta de novo?";

      pushMaxMessage("assistant", answer);
    } catch (err) {
      console.error("Erro inesperado ao falar com Max:", err);
      pushMaxMessage(
        "assistant",
        "Ops, algo deu errado na conversa com o Max. Tenta novamente em alguns segundos."
      );
    } finally {
      setMaxLoading(false);
    }
  };

  const handleSendToMax = async () => {
    if (!maxInput.trim()) return;
    const message = maxInput.trim();
    pushMaxMessage("user", message);
    setMaxInput("");
    await callMax(message, "livre");
  };

  /* ========================= Render ========================= */

  return (
    <div className="relative flex gap-4 h-full">
      {/* Coluna principal */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pb-4">
        {/* Filtros topo */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Dog className="w-6 h-6 text-red-600" />
              <CardTitle>
                Planejamento &amp; Playbook – Max, o mascote da Consulmax 🐶
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {isAdmin && (
              <div>
                <Label>Colaborador</Label>
                <Select
                  value={selectedUserId || ""}
                  onValueChange={(val) => setSelectedUserId(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isAdmin && currentUser && (
              <div>
                <Label>Colaborador</Label>
                <Input value={currentUser.nome} disabled />
              </div>
            )}

            <div>
              <Label>Cargo</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sdr">SDR</SelectItem>
                  <SelectItem value="vendedor">
                    Vendedor / Especialista
                  </SelectItem>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="pos_venda">Pós-venda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>De</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Até</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleLoadOrCreatePlan}
                disabled={loading || !selectedUserId || !dateStart || !dateEnd}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Carregar / Criar planejamento
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cabeçalho do plano */}
        {plan && (
          <Card>
            <CardHeader>
              <CardTitle>
                Resumo do plano ({plan.date_start} a {plan.date_end})
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tema da semana</Label>
                <Input
                  value={plan.theme || ""}
                  onChange={(e) => setPlan({ ...plan, theme: e.target.value })}
                  placeholder="Ex.: Semana da Frota Agro, Semana dos Médicos, etc."
                />
              </div>
              <div>
                <Label>Meta principal</Label>
                <Input
                  value={plan.main_goal || ""}
                  onChange={(e) =>
                    setPlan({ ...plan, main_goal: e.target.value })
                  }
                  placeholder="Ex.: Agendar 15 reuniões, fechar 300k em vendas..."
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={handleSavePlanHeader} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar resumo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5W2H */}
        {plan && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Planejamento 5W2H</CardTitle>
              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar ação
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Cada linha é uma ação com intervalo: <b>De / Até</b> + 5W2H.
              </div>
              <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-xl p-3 grid md:grid-cols-4 gap-3 bg-background/40"
                  >
                    <div>
                      <Label>De</Label>
                      <Input
                        type="date"
                        value={item.date_start || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "date_start",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Até</Label>
                      <Input
                        type="date"
                        value={item.date_end || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "date_end",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>O que? (What)</Label>
                      <Input
                        value={item.what || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "what",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Por quê? (Why)</Label>
                      <Input
                        value={item.why || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "why",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Onde? (Where)</Label>
                      <Input
                        value={item.where_ || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "where_",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Quando? (When)</Label>
                      <Input
                        value={item.when_ || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "when_",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Quem? (Who)</Label>
                      <Input
                        value={item.who || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "who",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Como? (How)</Label>
                      <Input
                        value={item.how || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "how",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Quanto? (How much)</Label>
                      <Input
                        value={item.how_much || ""}
                        onChange={(e) =>
                          handleUpdateItemField(
                            item.id,
                            "how_much",
                            e.target.value
                          )
                        }
                        placeholder="Ex.: 30 ligações, 10 reuniões..."
                      />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select
                        value={item.status || "planejado"}
                        onValueChange={(val) =>
                          handleUpdateItemField(item.id, "status", val)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planejado">Planejado</SelectItem>
                          <SelectItem value="em_andamento">
                            Em andamento
                          </SelectItem>
                          <SelectItem value="concluido">Concluído</SelectItem>
                          <SelectItem value="adiado">Adiado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Nenhuma ação ainda. Clique em “Adicionar ação” para começar
                    o planejamento da semana.
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveItems} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar 5W2H
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Playbook da semana */}
        {plan && (
          <Card>
            <CardHeader>
              <CardTitle>Playbook de Vendas da Semana</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>Segmento</Label>
                  <Input
                    value={playbook?.segmento || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || {
                          id: "" as UUID,
                          plan_id: plan.id,
                        }),
                        segmento: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Produto</Label>
                  <Input
                    value={playbook?.produto || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        produto: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Persona</Label>
                  <Input
                    value={playbook?.persona || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        persona: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Dor principal</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.dor_principal || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        dor_principal: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Big Idea / Promessa</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.big_idea || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        big_idea: e.target.value,
                      }))
                    }
                    placeholder="Ex.: Renovar a frota pagando juros médios de 1% ao ano..."
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Garantia</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.garantia || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        garantia: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>CTA principal</Label>
                  <Textarea
                    rows={2}
                    value={playbook?.cta_principal || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        cta_principal: e.target.value,
                      }))
                    }
                    placeholder="Ex.: Você consegue 15 min hoje às 14h ou às 15h pra alinharmos isso?"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Abertura</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_abertura || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        script_abertura: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Quebra-gelo</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_quebra_gelo || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        script_quebra_gelo: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Diagnóstico (perguntas)</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_diagnostico || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        script_diagnostico: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Apresentação</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_apresentacao || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        script_apresentacao: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Oferta</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_oferta || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        script_oferta: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Fechamento</Label>
                  <Textarea
                    rows={3}
                    value={playbook?.script_fechamento || ""}
                    onChange={(e) =>
                      setPlaybook((prev) => ({
                        ...(prev || { id: "" as UUID, plan_id: plan.id }),
                        script_fechamento: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Follow-up</Label>
                <Textarea
                  rows={3}
                  value={playbook?.script_followup || ""}
                  onChange={(e) =>
                    setPlaybook((prev) => ({
                      ...(prev || { id: "" as UUID, plan_id: plan.id }),
                      script_followup: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    callMax(
                      "Max, sugira uma estratégia completa de abordagem da abertura ao fechamento para esta semana.",
                      "estrategia"
                    )
                  }
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Pedir estratégia pro Max
                </Button>

                <Button onClick={handleSavePlaybook} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar playbook
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Objeções */}
        {plan && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Objeções &amp; Contornos</CardTitle>
              <Button variant="outline" size="sm" onClick={handleAddObjection}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar objeção
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-[280px] overflow-y-auto pr-1 space-y-3">
                {objections.map((obj) => (
                  <div
                    key={obj.id}
                    className="border rounded-xl p-3 grid md:grid-cols-2 gap-3 bg-background/40"
                  >
                    <div>
                      <Label>Tag</Label>
                      <Input
                        value={obj.tag || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) =>
                              o.id === obj.id ? { ...o, tag: e.target.value } : o
                            )
                          )
                        }
                        placeholder="Ex.: sem_dinheiro, falar_com_esposa..."
                      />
                    </div>
                    <div>
                      <Label>Prioridade</Label>
                      <Input
                        type="number"
                        value={obj.priority}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, priority: Number(e.target.value) }
                                : o
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Como o cliente fala</Label>
                      <Textarea
                        rows={2}
                        value={obj.objection_text || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, objection_text: e.target.value }
                                : o
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Resposta recomendada</Label>
                      <Textarea
                        rows={2}
                        value={obj.answer_text || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, answer_text: e.target.value }
                                : o
                            )
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Próximo passo</Label>
                      <Input
                        value={obj.next_step || ""}
                        onChange={(e) =>
                          setObjections((prev) =>
                            prev.map((o) =>
                              o.id === obj.id
                                ? { ...o, next_step: e.target.value }
                                : o
                            )
                          )
                        }
                        placeholder="Ex.: reagendar, enviar proposta, marcar call com sócio..."
                      />
                    </div>
                  </div>
                ))}

                {objections.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Nenhuma objeção mapeada ainda. Você pode pedir sugestões
                    para o Max ou ir registrando conforme os clientes forem
                    falando.
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    callMax(
                      "Max, sugira as principais 10 objeções que esse tipo de cliente pode ter e como contornar.",
                      "objeções"
                    )
                  }
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Pedir objeções pro Max
                </Button>

                <Button onClick={handleSaveObjections} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar objeções
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ========================= Widget flutuante do Max ========================= */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
        {maxOpen && (
          <div className="w-80 sm:w-96 bg-background border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gradient-to-r from-[#1E293F] to-[#A11C27] text-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/40">
                  <Dog className="w-5 h-5 text-white" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">
                    Max – IA da Consulmax
                  </span>
                  <span className="text-[11px] text-white/80">
                    Seu mascote ajudante de scripts 🐶
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMaxOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 transition"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="flex-1 px-3 py-2 overflow-y-auto space-y-2 text-sm bg-background">
              {maxMessages.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  Fale com o Max! Você pode pedir:
                  <ul className="list-disc list-inside mt-1">
                    <li>“Max, melhora minha abertura pra médicos.”</li>
                    <li>“Simula um cliente difícil com essa objeção.”</li>
                    <li>“Transforma meu playbook em bullets pra eu treinar.”</li>
                  </ul>
                </div>
              )}
              {maxMessages.map((m) => (
                <div
                  key={m.id}
                  className={`p-2 rounded-lg max-w-full whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-muted mr-auto"
                  }`}
                >
                  {m.content}
                </div>
              ))}
            </div>

            <div className="px-3 py-2 border-t bg-background flex items-center gap-2">
              <Input
                placeholder="Pergunte algo pro Max..."
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendToMax();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={handleSendToMax}
                disabled={maxLoading || !maxInput.trim()}
              >
                {maxLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Botão flutuante redondinho com carinha do Max */}
        <Button
          type="button"
          size="icon"
          onClick={() => setMaxOpen((prev) => !prev)}
          className="h-14 w-14 rounded-full shadow-2xl bg-[#1E293F] text-white border-4 border-white flex items-center justify-center hover:scale-105 transition-transform"
        >
          <Dog className="w-7 h-7" />
        </Button>
      </div>
    </div>
  );
};

export default Planejamento;
