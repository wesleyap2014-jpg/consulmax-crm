import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, Settings2, ShieldCheck } from "lucide-react";

type Group = { id: string; administradora: string; segmento: string; codigo: string };
type Modality = { key: string; label: string; percentage: number | null; notes: string };
type Rule = {
  id: string; administradora: string; scope: "administradora" | "segmento" | "grupo";
  segmento: string; group_id: string | null; modalities: Modality[];
};
const defaults: Modality[] = [
  { key: "livre", label: "Lance Livre", percentage: null, notes: "" },
  { key: "fixo_25", label: "Lance Fixo 25%", percentage: 25, notes: "" },
  { key: "fixo_50", label: "Lance Fixo 50%", percentage: 50, notes: "" },
];
const normalize = (value: string) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const normAdmin = (value: string) => {
  const s = normalize(value).replace(/consorcios?|consorcio|holding|s\/?a|s\.?a\.?/g, "").replace(/[^a-z0-9]/g, "");
  if (s.includes("embracon")) return "Embracon";
  if (s === "hs" || s.startsWith("hs")) return "HS";
  if (s.includes("maggi")) return "Maggi";
  if (s.includes("bancodobrasil") || s === "bb" || s.startsWith("bbcons")) return "Banco do Brasil";
  return value.trim();
};
const sameAdmin = (a: string, b: string) => normAdmin(a) === normAdmin(b);
const validModalities = (raw: unknown): Modality[] => Array.isArray(raw) ? raw.filter(
  (r: any) => r && typeof r.key === "string" && typeof r.label === "string"
).map((r: any) => ({
  key: String(r.key), label: String(r.label),
  percentage: r.percentage === null || r.percentage === undefined ? null : Number(r.percentage),
  notes: String(r.notes || ""),
})) : [];

export default function GroupBidModalitySettings({ groups, onSaved }: { groups: Group[]; onSaved?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [adm, setAdm] = useState("");
  const [scope, setScope] = useState<Rule["scope"]>("administradora");
  const [segment, setSegment] = useState("");
  const [groupId, setGroupId] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const admins = useMemo(() => Array.from(new Set(groups.map(g => normAdmin(g.administradora)).filter(Boolean))).sort(), [groups]);
  const segments = useMemo(() => Array.from(new Set(groups.filter(g => sameAdmin(g.administradora, adm)).map(g => g.segmento).filter(Boolean))).sort(), [groups, adm]);
  const matchingGroups = useMemo(() => groups.filter(g => sameAdmin(g.administradora, adm) && (!segment || normalize(g.segmento) === normalize(segment))).sort((a,b)=>a.codigo.localeCompare(b.codigo)), [groups, adm, segment]);
  const findRule = useCallback((level: Rule["scope"]) => rules.find(r =>
    r.scope === level && sameAdmin(r.administradora, adm) &&
    (level === "administradora" || (level === "segmento" ? normalize(r.segmento) === normalize(segment) : r.group_id === groupId))
  ), [rules, adm, segment, groupId]);
  const exactRule = findRule(scope);
  const inherited = scope === "grupo" ? (findRule("segmento") || findRule("administradora")) :
    scope === "segmento" ? findRule("administradora") : undefined;
  const load = useCallback(async () => {
    const { data, error: requestError } = await supabase.from("group_bid_modality_rules").select("*");
    if (requestError) { setError("Não foi possível ler as configurações. Confira se a migração do Supabase foi aplicada."); return; }
    setRules((data || []).map((r: any) => ({ ...r, modalities: validModalities(r.modalities) })));
    setError("");
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => { if (!adm && admins.length) setAdm(admins[0]); }, [admins, adm]);
  useEffect(() => { if (segment && !segments.includes(segment)) setSegment(""); }, [segments, segment]);
  useEffect(() => { if (groupId && !matchingGroups.some(g => g.id === groupId)) setGroupId(""); }, [matchingGroups, groupId]);
  useEffect(() => { setModalities(exactRule ? validModalities(exactRule.modalities) : inherited ? validModalities(inherited.modalities) : []); setSuccess(""); }, [exactRule, inherited, adm, scope, segment, groupId]);
  const active = scope === "administradora" || (scope === "segmento" ? Boolean(segment) : Boolean(groupId));
  const toggle = (candidate: Modality) => setModalities(previous => previous.some(m => m.key === candidate.key) ? previous.filter(m => m.key !== candidate.key) : [...previous, candidate]);
  const save = async () => {
    if (!adm || !active) return;
    if (!modalities.length) { setError("Selecione pelo menos uma modalidade."); return; }
    if (modalities.some(m => !m.label.trim() || (m.percentage != null && (!Number.isFinite(m.percentage) || m.percentage < 0 || m.percentage > 100)))) { setError("Revise nomes e percentuais das modalidades."); return; }
    const keys = modalities.map(m=>m.key);
    if (new Set(keys).size !== keys.length) { setError("Há modalidades duplicadas."); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = { administradora: adm, scope, segmento: scope === "administradora" ? "" : segment, group_id: scope === "grupo" ? groupId : null, modalities };
      const request = exactRule ? supabase.from("group_bid_modality_rules").update(payload).eq("id", exactRule.id)
        : supabase.from("group_bid_modality_rules").insert(payload);
      const { error: saveError } = await request;
      if (saveError) throw saveError;
      await load();
      await onSaved?.();
      setSuccess("Modalidades salvas. Os resultados históricos e o lançamento atual não foram modificados.");
    } catch (e: any) { setError(e?.message || "Erro ao salvar modalidades."); }
    finally { setSaving(false); }
  };
  return <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-rose-50 p-2.5"><Settings2 className="h-5 w-5 text-rose-700" /></span>
        <div>
          <CardTitle className="text-base text-slate-900">Modalidades de lance</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">Configure as regras sem alterar resultados históricos.</p>
        </div>
      </div>
      <Button type="button" variant="outline" className="gap-2 rounded-lg border-slate-200" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {open ? "Recolher" : "Gerenciar regras"} <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
      </Button>
    </CardHeader>
    <CardContent>
      {!open ? <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Administradoras, segmentos e grupos com configurações independentes e dados preservados.</p> :
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-3">
          <div><Label>Administradora</Label><select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-rose-300" value={adm} onChange={e => {setAdm(e.target.value); setSegment(""); setGroupId("");}}><option value="">Selecione</option>{admins.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
          <div><Label>Abrangência</Label><select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-rose-300" value={scope} onChange={e => setScope(e.target.value as Rule["scope"])}><option value="administradora">Toda administradora</option><option value="segmento">Segmento</option><option value="grupo">Grupo específico</option></select></div>
          {scope !== "administradora" && <div><Label>Segmento {scope === "grupo" ? "(filtro)" : ""}</Label><select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-rose-300" value={segment} onChange={e=>{setSegment(e.target.value);setGroupId("");}}><option value="">Selecione</option>{segments.map(s=><option key={s} value={s}>{s}</option>)}</select></div>}
          {scope === "grupo" && <div><Label>Grupo</Label><select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-rose-300" value={groupId} onChange={e => setGroupId(e.target.value)}><option value="">Selecione</option>{matchingGroups.map(g=><option key={g.id} value={g.id}>{g.codigo} — {g.segmento}</option>)}</select></div>}
        </div>
        <p className="text-xs text-muted-foreground">{exactRule ? "Configuração específica salva neste nível." : inherited ? "Modalidades herdadas do nível superior; ao salvar, será criada uma exceção." : "Nenhuma configuração anterior neste nível. Selecione as modalidades permitidas."}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {defaults.map(d => <label key={d.key} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700 transition-colors hover:border-rose-300"><input type="checkbox" checked={modalities.some(m => m.key === d.key)} onChange={() => toggle(d)}/>{d.label}</label>)}
        </div>
        {modalities.filter(m => !defaults.some(d => d.key === m.key)).map(m=>
          <div key={m.key} className="grid grid-cols-1 items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-4">
            <div><Label>Modalidade</Label><Input value={m.label} onChange={e=>setModalities(a=>a.map(x=>x.key===m.key?{...x,label:e.target.value}:x))}/></div>
            <div><Label>Percentual fixo (opcional)</Label><Input type="number" min="0" max="100" step="0.01" value={m.percentage ?? ""} onChange={e=>setModalities(a=>a.map(x=>x.key===m.key?{...x,percentage:e.target.value===""?null:Number(e.target.value)}:x))}/></div>
            <div><Label>Observação</Label><Input value={m.notes} onChange={e=>setModalities(a=>a.map(x=>x.key===m.key?{...x,notes:e.target.value}:x))}/></div>
            <Button variant="outline" type="button" onClick={()=>toggle(m)}>Remover</Button>
          </div>)}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]"><Label>Outra modalidade</Label><Input placeholder="Ex.: Lance fidelidade" value={customLabel} onChange={e=>setCustomLabel(e.target.value)}/></div>
          <Button variant="outline" type="button" disabled={!customLabel.trim()} onClick={() => {const key="custom_"+Date.now().toString(36);setModalities(a=>[...a,{key,label:customLabel.trim(),percentage:null,notes:""}]);setCustomLabel("");}}>Adicionar modalidade</Button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {success && <p role="status" className="text-sm text-green-700">{success}</p>}
        <div className="flex justify-end"><Button className="rounded-xl bg-rose-700 px-6 text-white hover:bg-rose-800" onClick={save} disabled={saving || !adm || !active}>{saving ? "Salvando..." : "Salvar configuração"}</Button></div>
        <p className="text-xs text-muted-foreground">Nesta etapa, as modalidades são apenas cadastradas. O lançamento de resultados permanece inalterado até a etapa de compatibilidade e testes.</p>
      </div>}
    </CardContent>
  </Card>;
}
