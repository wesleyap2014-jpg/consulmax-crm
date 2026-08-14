import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { GOOGLE_REVIEW_URL, normalizeCs, waNumber } from "./customerSuccessModel";
import type { CsRecord, CustomerSuccessReport, WorkItem } from "./customerSuccessModel";
import { loadCustomerSuccess, saveCustomerSuccess } from "./customerSuccessRepository";
import { formatFollowUpDateBR, scheduleCustomerSuccessFollowUp } from "./customerSuccessFollowUp";

async function requestCustomerSuccessReport(item: WorkItem): Promise<CustomerSuccessReport> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão inválida ou expirada.");
  const response = await fetch("/api/clientes/customer-success-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ venda_id: item.venda.id }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok || !payload?.report) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Não foi possível gerar o relatório do atendimento.");
  }
  return payload.report as CustomerSuccessReport;
}

export function useCustomerSuccess() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<WorkItem | null>(null);
  const [form, setForm] = useState<CsRecord | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  async function load() {
    setLoading(true);
    try {
      const a = await supabase.auth.getUser();
      const id = a.data.user?.id || null;
      setUserId(id);
      if (id) {
        const { data } = await supabase.from("users").select("nome").eq("auth_user_id", id).maybeSingle();
        setUserName(String((data as any)?.nome || a.data.user?.email || ""));
      }
      setItems(await loadCustomerSuccess());
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar Sucesso do Cliente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  function open(i: WorkItem) { setActive(i); setForm(normalizeCs(i.cs)); }
  function close() { if (!saving) { setActive(null); setForm(null); } }

  async function persist(r: CsRecord) {
    if (!active) return;
    await saveCustomerSuccess(active, r);
    setItems((current) => current.map((i) => i.venda.id === active.venda.id ? { ...i, cs: normalizeCs(r) } : i));
    setActive({ ...active, cs: normalizeCs(r) });
    setForm(normalizeCs(r));
  }

  async function attempt() {
    if (!active || !form) return;
    try {
      setSaving(true);
      const now = new Date().toISOString();
      const attemptNumber = Number(form.tentativas || 0) + 1;
      const baseRecord: CsRecord = {
        ...form,
        status: form.status === "pendente" || form.status === "agendado" ? "em_validacao" : form.status,
        tentativas: attemptNumber,
        contato_em: now,
        responsavel_id: userId,
        responsavel_nome: userName,
        updated_at: now,
      };
      await persist(baseRecord);
      try {
        const followUp = await scheduleCustomerSuccessFollowUp(active, userId, attemptNumber);
        const updatedRecord = { ...baseRecord, proximo_contato_em: followUp.startIso, updated_at: new Date().toISOString() };
        await persist(updatedRecord);
        alert(`Tentativa registrada. Follow-up agendado para ${formatFollowUpDateBR(followUp.dueYmd)}.`);
      } catch (scheduleError: any) {
        console.error("Erro ao criar follow-up do Sucesso do Cliente:", scheduleError);
        alert(`Tentativa registrada, mas não foi possível criar o follow-up automático. ${scheduleError?.message || ""}`.trim());
      }
    } catch (e: any) {
      alert(e?.message || "Erro ao registrar tentativa.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!active || !form) return;
    try {
      setSaving(true);
      const savedRecord: CsRecord = {
        ...form,
        responsavel_id: form.responsavel_id || userId,
        responsavel_nome: form.responsavel_nome || userName,
        updated_at: new Date().toISOString(),
      };
      await persist(savedRecord);
      try {
        const report = await requestCustomerSuccessReport(active);
        await persist({ ...savedRecord, report, updated_at: new Date().toISOString() });
        alert("Atendimento salvo e relatório da venda gerado pela IA.");
      } catch (reportError: any) {
        console.error("Erro ao gerar relatório do Sucesso do Cliente:", reportError);
        alert(`Atendimento salvo, mas o relatório não pôde ser gerado agora. ${reportError?.message || ""}`.trim());
      }
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar atendimento.");
    } finally {
      setSaving(false);
    }
  }

  async function review() {
    if (!active || !form) return;
    if (!GOOGLE_REVIEW_URL) return alert("Configure VITE_GOOGLE_REVIEW_URL no Vercel.");
    const tel = waNumber(active.cliente?.telefone || active.lead?.telefone || active.venda.telefone);
    if (!tel) return alert("Cliente sem telefone para WhatsApp.");
    const n = String(active.cliente?.nome || active.lead?.nome || "").split(/\s+/)[0] || "Olá";
    const msg = `Olá, ${n}! Como combinamos, sua opinião é muito importante para nós. Se puder, deixe uma avaliação sobre sua experiência com a Consulmax no Google: ${GOOGLE_REVIEW_URL}`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, "_blank");
    const now = new Date().toISOString();
    await persist({ ...form, google_review: true, google_review_em: now, updated_at: now });
  }

  return { items, loading, saving, active, form, setForm, userName, load, open, close, attempt, save, review };
}
