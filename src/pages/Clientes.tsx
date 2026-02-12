// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, CalendarPlus, Eye, Send, Download, X, Loader2 } from "lucide-react";

type ClienteRow = {
  id: string;
  lead_id: string | null;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null; // date YYYY-MM-DD
  endereco_cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;

  // Campos extras (podem existir no seu schema novo). Mantemos como opcionais via "any" no payload.
  vendedor_auth_user_id?: string | null;
  vendedor_nome?: string | null;

  tipo?: "pf" | "pj" | null; // PF/PJ
  segmento_pf?: string | null;
  segmento_pj?: string | null;
  perfil?: "pf_geral" | "pf_agro" | "pj" | null;

  como_chamar?: string | null;

  emergencia_nome?: string | null;
  emergencia_telefone?: string | null;

  renda?: number | null;

  pai_mae_vivos?: boolean | null;
  pai_nome?: string | null;
  pai_nascimento?: string | null;
  mae_nome?: string | null;
  mae_nascimento?: string | null;

  possui_filhos?: boolean | null;
  filhos_json?: any; // array
  autoriza_publicar?: boolean | null;
  autoriza_homenagem?: boolean | null;

  feedback?: string | null;
  obs_internas?: string | null;

  conteudo_prefs?: string[] | null; // ["dicas_rapidas","explicacoes_completas",...]
  prefere_educativo?: "educativo" | "ofertas" | null;

  como_conheceu?: string | null; // enum textual

  // Foto
  foto_url?: string | null;  // url pública ou signed
  foto_path?: string | null; // path no bucket
};

type LeadLite = { id: string; nome: string; telefone?: string | null; email?: string | null };
type VendaLite = {
  id: string;
  lead_id: string;
  vendedor_id: string | null; // auth_user_id
  vendedor_nome?: string | null;
  cpf?: string | null;
  nascimento?: string | null;
  email?: string | null;
  telefone?: string | null;
  grupo?: string | null;
  created_at?: string | null;
};

const PF_SEGMENTOS = [
  "Assalariado",
  "Autônomo",
  "Aposentado",
  "Empresário",
  "Funcionário Público",
  "Motorista",
  "Produtor Rural",
  "Profissional Liberal",
  "Locador ou Proprietário",
];

const PERFIS = [
  { v: "pf_geral", label: "PF Geral" },
  { v: "pf_agro", label: "PF Agro" },
  { v: "pj", label: "PJ" },
] as const;

const CONTEUDOS = [
  { v: "dicas_rapidas", label: "Dicas rápidas" },
  { v: "explicacoes_completas", label: "Explicações completas" },
  { v: "promocoes", label: "Promoções" },
  { v: "novidades", label: "Novidades" },
] as const;

const COMO_CONHECEU = [
  "Instagram",
  "Google",
  "Indicação",
  "Anúncio",
  "Relacionamento com o Vendedor",
  "Outro",
];

const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
const maskPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 2),
    p2 = d.slice(2, 3),
    p3 = d.slice(3, 7),
    p4 = d.slice(7, 11);
  let out = "";
  if (p1) out += `(${p1}) `;
  if (p2) out += p2 + (p3 ? " " : "");
  if (p3) out += p3;
  if (p4) out += "-" + p4;
  return out.trim();
};

const formatBRDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const initialsFromName = (name?: string | null) => {
  const s = (name || "").trim();
  if (!s) return "C";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "C";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
};

function moneyToNumberBR(input: string) {
  // "R$ 1.234,56" -> 1234.56
  const s = (input || "").replace(/[^\d,]/g, "").replace(/\./g, "");
  if (!s) return null;
  const parts = s.split(",");
  const int = parts[0] || "0";
  const dec = (parts[1] || "").padEnd(2, "0").slice(0, 2);
  const n = Number(`${int}.${dec}`);
  return isNaN(n) ? null : n;
}

function formatMoneyBR(n?: number | null) {
  if (n == null || isNaN(Number(n))) return "R$ 0,00";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function fetchViaCEP(cepDigits: string) {
  const cep = onlyDigits(cepDigits).slice(0, 8);
  if (cep.length !== 8) return null;
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const j = await r.json();
  if (!j || j.erro) return null;
  return {
    endereco_cep: cep,
    logradouro: j.logradouro || "",
    bairro: j.bairro || "",
    cidade: j.localidade || "",
    uf: j.uf || "",
  };
}

export default function ClientesPage() {
  const PAGE = 10;

  const [tab, setTab] = useState<"cadastro" | "demografia">("cadastro");

  const [loading, setLoading] = useState(false);

  // Confirmados (tabela clientes)
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Novos (leads com venda e sem linha em clientes)
  const [novos, setNovos] = useState<
    Array<{
      lead: LeadLite;
      venda: VendaLite | null; // venda mais recente
      cpf_dig?: string | null;
    }>
  >([]);

  // Busca
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // Modal
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit" | "view">("create");
  const [activeLead, setActiveLead] = useState<LeadLite | null>(null);
  const [activeVenda, setActiveVenda] = useState<VendaLite | null>(null);
  const [activeCliente, setActiveCliente] = useState<ClienteRow | null>(null);

  // Form (usado no create/edit/view)
  const [form, setForm] = useState<any>({});
  const readOnly = mode === "view";

  // carrega
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (tab === "cadastro") load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, tab]);

  // ======= Busca inteligente (nome / cpf/cnpj / grupo) =======
  function classifySearch(term: string) {
    const t = term.trim();
    const d = onlyDigits(t);
    // se digitar só números (11 ou 14) -> cpf/cnpj
    if (d.length === 11 || d.length === 14) return { kind: "doc" as const, value: d };
    // se parece grupo: só números e pequeno (3-6)
    if (d.length >= 3 && d.length <= 6 && d === t.replace(/\s/g, "")) return { kind: "grupo" as const, value: d };
    // se usuário escreveu "grupo 9671" etc
    const m = t.match(/grupo\s*[:#-]?\s*(\d{3,6})/i);
    if (m?.[1]) return { kind: "grupo" as const, value: m[1] };
    return { kind: "nome" as const, value: t };
  }

  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      const criteria = classifySearch(term);

      // 1) achar lead_ids candidatos (por nome OU por vendas cpf/grupo)
      let leadIds: string[] = [];

      if (!term || criteria.kind === "nome") {
        let leadsQ = supabase.from("leads").select("id,nome,telefone,email").order("nome", { ascending: true });
        if (term) leadsQ = leadsQ.ilike("nome", `%${criteria.value}%`);
        const { data: leads, error } = await leadsQ.range(0, 5000);
        if (error) throw error;
        leadIds = (leads || []).map((l: any) => String(l.id));
      } else {
        // doc ou grupo -> buscar em vendas e pegar lead_id
        let vq = supabase.from("vendas").select("id,lead_id,created_at").order("created_at", { ascending: false });
        if (criteria.kind === "doc") {
          vq = vq.eq("cpf", criteria.value);
        } else {
          vq = vq.eq("grupo", criteria.value);
        }
        const { data: vrows, error: ev } = await vq.range(0, 5000);
        if (ev) throw ev;
        leadIds = Array.from(new Set((vrows || []).map((v: any) => String(v.lead_id)).filter(Boolean)));
      }

      if (leadIds.length === 0) {
        setNovos([]);
        setClientes([]);
        setTotal(0);
        setPage(1);
        return;
      }

      // 2) buscar leads desses ids (para montar "Novos" e enrich)
      const { data: leads2, error: eLeads2 } = await supabase
        .from("leads")
        .select("id,nome,telefone,email,owner_id")
        .in("id", leadIds)
        .range(0, 5000);
      if (eLeads2) throw eLeads2;

      const leadsById = new Map<string, any>();
      (leads2 || []).forEach((l: any) => leadsById.set(String(l.id), l));

      // 3) vendas dos leads (mais recentes primeiro)
      const { data: vendas, error: eVend } = await supabase
        .from("vendas")
        .select("id,lead_id,created_at,cpf,nascimento,descricao,telefone,email,grupo,vendedor_id")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .range(0, 20000);
      if (eVend) throw eVend;

      // 3.1) enriquecer vendedor_nome (users.auth_user_id -> users.nome)
      const vendedorIds = Array.from(
        new Set((vendas || []).map((v: any) => v.vendedor_id).filter(Boolean))
      ).map(String);

      const vendedoresByAuth = new Map<string, string>();
      if (vendedorIds.length) {
        const { data: us, error: eu } = await supabase
          .from("users")
          .select("auth_user_id,nome")
          .in("auth_user_id", vendedorIds)
          .range(0, 2000);
        if (eu) throw eu;
        (us || []).forEach((u: any) => vendedoresByAuth.set(String(u.auth_user_id), String(u.nome)));
      }

      // agrupar vendas por lead
      const vendasByLead = new Map<string, VendaLite[]>();
      (vendas || []).forEach((v: any) => {
        const lid = v.lead_id ? String(v.lead_id) : "";
        if (!lid) return;
        if (!vendasByLead.has(lid)) vendasByLead.set(lid, []);
        vendasByLead.get(lid)!.push({
          id: String(v.id),
          lead_id: String(v.lead_id),
          vendedor_id: v.vendedor_id ? String(v.vendedor_id) : null,
          vendedor_nome: v.vendedor_id ? vendedoresByAuth.get(String(v.vendedor_id)) || null : null,
          cpf: v.cpf ? onlyDigits(String(v.cpf)) : null,
          nascimento: v.nascimento ?? null,
          email: v.email ?? null,
          telefone: v.telefone ?? null,
          grupo: v.grupo ?? null,
          created_at: v.created_at ?? null,
        });
      });

      // 4) buscar clientes confirmados por lead_id
      const { data: cliRows, error: eCli } = await supabase.from("clientes").select("*").in("lead_id", leadIds);
      if (eCli) throw eCli;

      const confirmedByLead = new Map<string, ClienteRow>();
      (cliRows || []).forEach((c: any) => {
        if (c.lead_id) confirmedByLead.set(String(c.lead_id), c);
      });

      // 5) montar "Novos": leads com venda + sem registro em clientes
      const pendingList: Array<{ lead: LeadLite; venda: VendaLite | null; cpf_dig?: string | null }> = [];
      for (const lid of leadIds) {
        const l = leadsById.get(lid);
        if (!l) continue;
        const arr = (vendasByLead.get(lid) || []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        const latest = arr[0] || null;

        // Regra: só entra se houver cpf (text) ou cpf_cnpj (não estamos consultando cpf_cnpj aqui)
        // Como você já usa CPF em vendas, mantemos critério: precisa ter cpf no registro mais recente ou em algum.
        const hasCpfAny = arr.some((x) => (x.cpf && x.cpf.length > 0));
        if (!hasCpfAny) continue;

        if (!confirmedByLead.has(lid)) {
          pendingList.push({
            lead: { id: lid, nome: l.nome, telefone: l.telefone, email: l.email },
            venda: latest,
            cpf_dig: latest?.cpf || null,
          });
        }
      }

      pendingList.sort((a, b) => (a.lead.nome || "").localeCompare(b.lead.nome || "", "pt-BR"));
      setNovos(pendingList);

      // 6) lista clientes confirmados (paginado)
      const confirmedAll = Array.from(confirmedByLead.values()).sort((a, b) =>
        (a.nome || "").localeCompare(b.nome || "", "pt-BR")
      );

      const from = (target - 1) * PAGE;
      const to = from + PAGE;
      setClientes(confirmedAll.slice(from, to));
      setTotal(confirmedAll.length);
      setPage(target);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  }

  // ======= Foto: upload e signed url =======
  async function tryGetSignedUrl(bucket: string, path: string) {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60); // 1h
      if (error) return null;
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  }

  async function uploadClientePhoto(file: File, clienteId: string) {
    const bucket = "clientes_photos";
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
    const path = `${clienteId}/${Date.now()}_${safeName}.${ext}`;

    // upload
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });

    if (upErr) {
      // 403/401 = policy/perm
      throw upErr;
    }

    // tenta URL pública
    const pub = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = pub?.data?.publicUrl || null;

    // se bucket for privado, gerar signed
    const signed = publicUrl ? null : await tryGetSignedUrl(bucket, path);

    return { foto_path: path, foto_url: publicUrl || signed || null };
  }

  // ======= Abrir modal =======
  function openCreateFromNovo(n: { lead: LeadLite; venda: VendaLite | null; cpf_dig?: string | null }) {
    setMode("create");
    setActiveLead(n.lead);
    setActiveVenda(n.venda);
    setActiveCliente(null);

    // prefill
    setForm({
      vendedor_auth_user_id: n.venda?.vendedor_id || null,
      vendedor_nome: n.venda?.vendedor_nome || "",
      perfil: "pf_geral",
      tipo: "pf",

      nome: n.lead.nome || "",
      como_chamar: "",
      cpf: n.cpf_dig || "",
      data_nascimento: n.venda?.nascimento || null,

      endereco_cep: "",
      logradouro: "",
      numero: "",
      bairro: "",
      cidade: "",
      uf: "",

      telefone: n.lead.telefone ? maskPhone(n.lead.telefone) : "",
      email: n.lead.email || n.venda?.email || "",

      emergencia_nome: "",
      emergencia_telefone: "",

      renda_text: "R$ 0,00",

      pai_mae_vivos: null,
      pai_nome: "",
      pai_nascimento: "",
      mae_nome: "",
      mae_nascimento: "",

      possui_filhos: null,
      filhos: [] as Array<{ nome: string; nascimento: string; sexo: "F" | "M" | "" }>,

      autoriza_publicar: null,
      autoriza_homenagem: null,

      feedback: "",
      obs_internas: "",

      conteudo_prefs: [] as string[],
      prefere_educativo: null,

      como_conheceu: "",
      foto_url: "",
      foto_path: "",
      fotoFile: null as File | null,

      segmento_pf: PF_SEGMENTOS[0],
      segmento_pj: "",
    });

    setOpen(true);
  }

  async function openEditCliente(c: ClienteRow, mode_: "edit" | "view") {
    setMode(mode_);
    setActiveCliente(c);
    setActiveLead(null);
    setActiveVenda(null);

    let fotoUrl = (c as any).foto_url || null;
    const fotoPath = (c as any).foto_path || null;

    // se não tem foto_url mas tem path -> tenta signed
    if (!fotoUrl && fotoPath) {
      fotoUrl = await tryGetSignedUrl("clientes_photos", fotoPath);
    }

    setForm({
      ...c,
      foto_url: fotoUrl || "",
      foto_path: fotoPath || "",
      fotoFile: null,

      // inputs controlados auxiliares:
      renda_text: formatMoneyBR((c as any).renda ?? 0),
      telefone: c.telefone ? maskPhone(c.telefone) : "",
      emergencia_telefone: (c as any).emergencia_telefone ? maskPhone((c as any).emergencia_telefone) : "",
      filhos: Array.isArray((c as any).filhos_json) ? (c as any).filhos_json : [],
      conteudo_prefs: Array.isArray((c as any).conteudo_prefs) ? (c as any).conteudo_prefs : [],
    });

    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setActiveLead(null);
    setActiveVenda(null);
    setActiveCliente(null);
    setForm({});
  }

  // ======= Salvar (create/edit) =======
  async function confirmCadastro() {
    if (readOnly) return;

    const nome = String(form.nome || "").trim();
    const cpf = onlyDigits(String(form.cpf || ""));
    if (!nome) return alert("Informe o nome.");
    if (!cpf) return alert("Informe o CPF/CNPJ.");

    setLoading(true);
    try {
      // 1) Upload foto (se houver)
      let foto_url = String(form.foto_url || "").trim() || null;
      let foto_path = String(form.foto_path || "").trim() || null;

      if (form.fotoFile instanceof File) {
        try {
          const up = await uploadClientePhoto(form.fotoFile, activeCliente?.id || activeLead?.id || cpf);
          foto_url = up.foto_url;
          foto_path = up.foto_path;
        } catch (e: any) {
          // melhora a mensagem, mas deixa seguir com URL manual
          const msg =
            e?.message ||
            "Não consegui subir a foto no Storage (bucket 'clientes_photos'). Verifique as policies do bucket.";
          alert(msg);
        }
      }

      const renda_num = moneyToNumberBR(String(form.renda_text || ""));

      // payload clientes (usa lead_id quando tiver)
      const payload: any = {
        nome,
        cpf,
        telefone: onlyDigits(String(form.telefone || "")) || null,
        email: String(form.email || "").trim() || null,
        data_nascimento: form.data_nascimento || null,

        endereco_cep: onlyDigits(String(form.endereco_cep || "")) || null,
        logradouro: String(form.logradouro || "").trim() || null,
        numero: String(form.numero || "").trim() || null,
        bairro: String(form.bairro || "").trim() || null,
        cidade: String(form.cidade || "").trim() || null,
        uf: String(form.uf || "").trim() || null,

        observacoes: String(form.observacoes || "").trim() || null,
        lead_id: activeCliente?.lead_id || activeLead?.id || null,

        // extras
        vendedor_auth_user_id: form.vendedor_auth_user_id || null,
        vendedor_nome: form.vendedor_nome || null,

        tipo: form.tipo || null,
        perfil: form.perfil || null,
        segmento_pf: form.tipo === "pf" ? (form.segmento_pf || null) : null,
        segmento_pj: form.tipo === "pj" ? (String(form.segmento_pj || "").trim() || null) : null,

        como_chamar: String(form.como_chamar || "").trim() || null,

        emergencia_nome: String(form.emergencia_nome || "").trim() || null,
        emergencia_telefone: onlyDigits(String(form.emergencia_telefone || "")) || null,

        renda: renda_num,

        pai_mae_vivos: form.pai_mae_vivos ?? null,
        pai_nome: form.pai_mae_vivos ? (String(form.pai_nome || "").trim() || null) : null,
        pai_nascimento: form.pai_mae_vivos ? (form.pai_nascimento || null) : null,
        mae_nome: form.pai_mae_vivos ? (String(form.mae_nome || "").trim() || null) : null,
        mae_nascimento: form.pai_mae_vivos ? (form.mae_nascimento || null) : null,

        possui_filhos: form.possui_filhos ?? null,
        filhos_json: form.possui_filhos ? (Array.isArray(form.filhos) ? form.filhos : []) : [],

        autoriza_publicar: form.autoriza_publicar ?? null,
        autoriza_homenagem: form.autoriza_homenagem ?? null,

        feedback: String(form.feedback || "").trim() || null,
        obs_internas: String(form.obs_internas || "").trim() || null,

        conteudo_prefs: Array.isArray(form.conteudo_prefs) ? form.conteudo_prefs : [],
        prefere_educativo: form.prefere_educativo || null,
        como_conheceu: String(form.como_conheceu || "").trim() || null,

        foto_url,
        foto_path,
      };

      // 2) Atualiza lead também (se tiver lead)
      const leadId = activeCliente?.lead_id || activeLead?.id || null;
      if (leadId) {
        const { error: eLead } = await supabase
          .from("leads")
          .update({
            nome,
            telefone: onlyDigits(String(form.telefone || "")) || null,
            email: String(form.email || "").trim() || null,
          })
          .eq("id", leadId);
        if (eLead) throw eLead;
      }

      // 3) Insert/Update clientes
      if (mode === "edit" && activeCliente?.id) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", activeCliente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clientes").insert(payload);
        if (error) throw error;
      }

      // 4) (Opcional) Atualiza venda mais recente com nascimento/obs/cpf/email
      // Mantemos compatível com seu fluxo anterior: se veio de "novo", atualiza a venda mais recente do lead.
      if (activeLead?.id) {
        const { data: latest, error: eLatest } = await supabase
          .from("vendas")
          .select("id,created_at")
          .eq("lead_id", activeLead.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!eLatest && latest?.[0]?.id) {
          await supabase
            .from("vendas")
            .update({
              nascimento: form.data_nascimento || null,
              descricao: String(form.observacoes || "").trim() || null,
              cpf: cpf || null,
              email: String(form.email || "").trim() || null,
            })
            .eq("id", latest[0].id);
        }
      }

      closeModal();
      await load(page, debounced);
    } catch (e: any) {
      alert("Erro ao salvar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // ======= Ações =======
  function goAgenda(leadId?: string | null, clienteId?: string | null) {
    // abre agenda já filtrada via querystring (você pode usar no /agenda se quiser implementar lá)
    const qs = new URLSearchParams();
    if (leadId) qs.set("lead_id", leadId);
    if (clienteId) qs.set("cliente_id", clienteId);
    window.location.href = `/agenda?${qs.toString()}`;
  }

  function downloadPlaceholder() {
    alert("Em breve: Download do Perfil do Cliente (PDF).");
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE)), [total]);

  // ======= UI helpers =======
  function ToggleYesNo({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: boolean | null;
    onChange: (v: boolean) => void;
  }) {
    return (
      <div className="row">
        <div className="lbl">{label}</div>
        <div className="tog">
          <button type="button" className={`pill ${value === true ? "on" : ""}`} onClick={() => onChange(true)} disabled={readOnly}>
            Sim
          </button>
          <button type="button" className={`pill ${value === false ? "on" : ""}`} onClick={() => onChange(false)} disabled={readOnly}>
            Não
          </button>
        </div>
      </div>
    );
  }

  // ======= Modal Layout (mais horizontal) =======
  function ModalCadastro() {
    if (!open) return null;

    const displayName = String(form.nome || "").trim();
    const avatarUrl = String(form.foto_url || "").trim() || null;
    const vendedorNome = form.vendedor_nome || activeVenda?.vendedor_nome || "—";
    const doc = onlyDigits(String(form.cpf || "")) || "—";
    const nasc = form.data_nascimento ? formatBRDate(form.data_nascimento) : "—";

    return (
      <>
        <div className="ov-backdrop" onClick={closeModal} />
        <div className="ov-wrap" role="dialog" aria-modal="true">
          <div className="ov-card">
            <div className="ov-top">
              <div className="ov-top-left">
                <div className="avatar">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Foto do cliente" />
                  ) : (
                    <span>{initialsFromName(displayName)}</span>
                  )}
                </div>
                <div className="ov-title">
                  <div className="h1">{mode === "view" ? "Visualizar Cadastro do Cliente" : mode === "edit" ? "Editar Cadastro do Cliente" : "Preencher Cadastro do Cliente"}</div>
                  <div className="sub">
                    <strong>{displayName || "—"}</strong>
                    <span className="dot">•</span>
                    <span>Vendedor: {vendedorNome}</span>
                    <span className="dot">•</span>
                    <span>CPF/CNPJ: {doc}</span>
                    <span className="dot">•</span>
                    <span>Nasc./Const.: {nasc}</span>
                  </div>
                </div>
              </div>

              <button className="icon-x" onClick={closeModal} title="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="ov-body">
              {/* GRID 12 colunas, mais horizontal */}
              <div className="grid12">
                {/* COLUNA 1 (Identidade) */}
                <section className="sec span4">
                  <h4>Identidade</h4>

                  <div className="grid2">
                    <div>
                      <label>Vendedor (auto)</label>
                      <input className="input" value={vendedorNome} disabled />
                      <small className="hint">Capturado da venda mais recente.</small>
                    </div>

                    <div>
                      <label>Perfil do Cliente</label>
                      <select
                        className="input"
                        value={form.perfil || "pf_geral"}
                        onChange={(e) => setForm((s: any) => ({ ...s, perfil: e.target.value }))}
                        disabled={readOnly}
                      >
                        {PERFIS.map((p) => (
                          <option key={p.v} value={p.v}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label>Tipo</label>
                      <select
                        className="input"
                        value={form.tipo || "pf"}
                        onChange={(e) => setForm((s: any) => ({ ...s, tipo: e.target.value }))}
                        disabled={readOnly}
                      >
                        <option value="pf">PF</option>
                        <option value="pj">PJ</option>
                      </select>
                    </div>

                    <div>
                      <label>Segmento</label>
                      {form.tipo === "pj" ? (
                        <input
                          className="input"
                          placeholder="Ex.: Padaria, Transporte, Agricultura..."
                          value={form.segmento_pj || ""}
                          onChange={(e) => setForm((s: any) => ({ ...s, segmento_pj: e.target.value }))}
                          disabled={readOnly}
                        />
                      ) : (
                        <select
                          className="input"
                          value={form.segmento_pf || PF_SEGMENTOS[0]}
                          onChange={(e) => setForm((s: any) => ({ ...s, segmento_pf: e.target.value }))}
                          disabled={readOnly}
                        >
                          {PF_SEGMENTOS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="grid2 mt">
                    <div className="span2">
                      <label>Nome</label>
                      <input className="input" value={form.nome || ""} onChange={(e) => setForm((s: any) => ({ ...s, nome: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div className="span2">
                      <label>Como você gostaria de ser chamado?</label>
                      <input
                        className="input"
                        placeholder="Nome, apelido, diminutivo, nome social..."
                        value={form.como_chamar || ""}
                        onChange={(e) => setForm((s: any) => ({ ...s, como_chamar: e.target.value }))}
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label>CPF/CNPJ</label>
                      <input className="input" value={form.cpf || ""} onChange={(e) => setForm((s: any) => ({ ...s, cpf: onlyDigits(e.target.value) }))} disabled={readOnly} />
                    </div>

                    <div>
                      <label>Data Nascimento/Constituição</label>
                      <input className="input" type="date" value={form.data_nascimento || ""} onChange={(e) => setForm((s: any) => ({ ...s, data_nascimento: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div>
                      <label>Telefone</label>
                      <input
                        className="input"
                        value={form.telefone || ""}
                        onChange={(e) => setForm((s: any) => ({ ...s, telefone: e.target.value }))}
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <label>E-mail</label>
                      <input className="input" value={form.email || ""} onChange={(e) => setForm((s: any) => ({ ...s, email: e.target.value }))} disabled={readOnly} />
                    </div>
                  </div>

                  <div className="mt">
                    <label>Observações (cliente)</label>
                    <textarea className="textarea" value={form.observacoes || ""} onChange={(e) => setForm((s: any) => ({ ...s, observacoes: e.target.value }))} disabled={readOnly} />
                  </div>
                </section>

                {/* COLUNA 2 (Contato & Endereço) */}
                <section className="sec span4">
                  <h4>Contato & Endereço</h4>

                  <div className="grid2">
                    <div>
                      <label>CEP</label>
                      <div className="inline">
                        <input
                          className="input"
                          placeholder="Somente números"
                          value={form.endereco_cep || ""}
                          onChange={(e) => setForm((s: any) => ({ ...s, endereco_cep: e.target.value }))}
                          disabled={readOnly}
                        />
                        <button
                          type="button"
                          className="btn"
                          onClick={async () => {
                            try {
                              const j = await fetchViaCEP(form.endereco_cep || "");
                              if (!j) return alert("CEP inválido ou não encontrado.");
                              setForm((s: any) => ({ ...s, ...j }));
                            } catch {
                              alert("Não foi possível buscar o CEP.");
                            }
                          }}
                          disabled={readOnly}
                        >
                          Buscar
                        </button>
                      </div>
                    </div>

                    <div>
                      <label>Número</label>
                      <input className="input" value={form.numero || ""} onChange={(e) => setForm((s: any) => ({ ...s, numero: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div className="span2">
                      <label>Logradouro</label>
                      <input className="input" value={form.logradouro || ""} onChange={(e) => setForm((s: any) => ({ ...s, logradouro: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div>
                      <label>Bairro</label>
                      <input className="input" value={form.bairro || ""} onChange={(e) => setForm((s: any) => ({ ...s, bairro: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div>
                      <label>Cidade/UF</label>
                      <div className="inline">
                        <input className="input" value={form.cidade || ""} onChange={(e) => setForm((s: any) => ({ ...s, cidade: e.target.value }))} disabled={readOnly} />
                        <input className="input uf" value={form.uf || ""} onChange={(e) => setForm((s: any) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))} disabled={readOnly} />
                      </div>
                    </div>

                    <div>
                      <label>Contato de emergência (Nome)</label>
                      <input className="input" value={form.emergencia_nome || ""} onChange={(e) => setForm((s: any) => ({ ...s, emergencia_nome: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div>
                      <label>Contato de emergência (Telefone)</label>
                      <input
                        className="input"
                        value={form.emergencia_telefone || ""}
                        onChange={(e) => setForm((s: any) => ({ ...s, emergencia_telefone: e.target.value }))}
                        disabled={readOnly}
                      />
                    </div>
                  </div>

                  <div className="grid2 mt">
                    <div>
                      <label>Renda/Faturamento</label>
                      <input
                        className="input"
                        value={form.renda_text || "R$ 0,00"}
                        onChange={(e) => setForm((s: any) => ({ ...s, renda_text: e.target.value }))}
                        disabled={readOnly}
                      />
                      <small className="hint">Salva como número no banco (numérico).</small>
                    </div>

                    <div>
                      <label>Foto (anexar)</label>
                      <div className="inline">
                        <input
                          className="input file"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setForm((s: any) => ({ ...s, fotoFile: f }));
                          }}
                          disabled={readOnly}
                        />
                      </div>
                      <small className="hint">Se não subir agora, use o campo abaixo.</small>
                    </div>

                    <div className="span2">
                      <label>Foto (URL)</label>
                      <input
                        className="input"
                        placeholder="https://..."
                        value={form.foto_url || ""}
                        onChange={(e) => setForm((s: any) => ({ ...s, foto_url: e.target.value }))}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                </section>

                {/* COLUNA 3 (Família + Autorizações/Feedback) */}
                <section className="sec span4">
                  <h4>Família</h4>

                  <ToggleYesNo
                    label="Possui pai e mãe vivos?"
                    value={form.pai_mae_vivos ?? null}
                    onChange={(v) => setForm((s: any) => ({ ...s, pai_mae_vivos: v }))}
                  />

                  {form.pai_mae_vivos === true && (
                    <div className="grid2 mt">
                      <div>
                        <label>Pai (Nome)</label>
                        <input className="input" value={form.pai_nome || ""} onChange={(e) => setForm((s: any) => ({ ...s, pai_nome: e.target.value }))} disabled={readOnly} />
                      </div>
                      <div>
                        <label>Pai (Nascimento)</label>
                        <input className="input" type="date" value={form.pai_nascimento || ""} onChange={(e) => setForm((s: any) => ({ ...s, pai_nascimento: e.target.value }))} disabled={readOnly} />
                      </div>
                      <div>
                        <label>Mãe (Nome)</label>
                        <input className="input" value={form.mae_nome || ""} onChange={(e) => setForm((s: any) => ({ ...s, mae_nome: e.target.value }))} disabled={readOnly} />
                      </div>
                      <div>
                        <label>Mãe (Nascimento)</label>
                        <input className="input" type="date" value={form.mae_nascimento || ""} onChange={(e) => setForm((s: any) => ({ ...s, mae_nascimento: e.target.value }))} disabled={readOnly} />
                      </div>
                    </div>
                  )}

                  <ToggleYesNo
                    label="Possui filhos?"
                    value={form.possui_filhos ?? null}
                    onChange={(v) =>
                      setForm((s: any) => ({
                        ...s,
                        possui_filhos: v,
                        filhos: v ? (Array.isArray(s.filhos) && s.filhos.length ? s.filhos : [{ nome: "", nascimento: "", sexo: "" }]) : [],
                      }))
                    }
                  />

                  {form.possui_filhos === true && (
                    <div className="mt">
                      {(Array.isArray(form.filhos) ? form.filhos : []).map((f: any, idx: number) => (
                        <div key={idx} className="childRow">
                          <input
                            className="input"
                            placeholder="Nome"
                            value={f.nome || ""}
                            onChange={(e) => {
                              const next = [...form.filhos];
                              next[idx] = { ...next[idx], nome: e.target.value };
                              setForm((s: any) => ({ ...s, filhos: next }));
                            }}
                            disabled={readOnly}
                          />
                          <input
                            className="input"
                            type="date"
                            value={f.nascimento || ""}
                            onChange={(e) => {
                              const next = [...form.filhos];
                              next[idx] = { ...next[idx], nascimento: e.target.value };
                              setForm((s: any) => ({ ...s, filhos: next }));
                            }}
                            disabled={readOnly}
                          />
                          <div className="sexTog">
                            <button
                              type="button"
                              className={`pill sm ${f.sexo === "F" ? "on" : ""}`}
                              onClick={() => {
                                const next = [...form.filhos];
                                next[idx] = { ...next[idx], sexo: "F" };
                                setForm((s: any) => ({ ...s, filhos: next }));
                              }}
                              disabled={readOnly}
                            >
                              F
                            </button>
                            <button
                              type="button"
                              className={`pill sm ${f.sexo === "M" ? "on" : ""}`}
                              onClick={() => {
                                const next = [...form.filhos];
                                next[idx] = { ...next[idx], sexo: "M" };
                                setForm((s: any) => ({ ...s, filhos: next }));
                              }}
                              disabled={readOnly}
                            >
                              M
                            </button>
                          </div>

                          {!readOnly && (
                            <button
                              type="button"
                              className="btn"
                              title="Adicionar filho"
                              onClick={() => setForm((s: any) => ({ ...s, filhos: [...(s.filhos || []), { nome: "", nascimento: "", sexo: "" }] }))}
                            >
                              +
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <h4 className="mt2">Autorizações & Feedback</h4>

                  <ToggleYesNo
                    label="Autoriza publicar quando contemplar?"
                    value={form.autoriza_publicar ?? null}
                    onChange={(v) => setForm((s: any) => ({ ...s, autoriza_publicar: v }))}
                  />

                  <ToggleYesNo
                    label="Autoriza usar nome/foto em homenagens?"
                    value={form.autoriza_homenagem ?? null}
                    onChange={(v) => setForm((s: any) => ({ ...s, autoriza_homenagem: v }))}
                  />

                  <div className="mt">
                    <label>Feedback (percepção sobre Consulmax e vendedor)</label>
                    <textarea className="textarea" value={form.feedback || ""} onChange={(e) => setForm((s: any) => ({ ...s, feedback: e.target.value }))} disabled={readOnly} />
                  </div>

                  <div className="mt">
                    <label>Obs. Internas</label>
                    <textarea className="textarea" value={form.obs_internas || ""} onChange={(e) => setForm((s: any) => ({ ...s, obs_internas: e.target.value }))} disabled={readOnly} />
                  </div>

                  <div className="mt">
                    <label>Que tipo de conteúdo você mais gosta de receber?</label>
                    <div className="chips">
                      {CONTEUDOS.map((c) => {
                        const on = Array.isArray(form.conteudo_prefs) && form.conteudo_prefs.includes(c.v);
                        return (
                          <button
                            key={c.v}
                            type="button"
                            className={`chip ${on ? "on" : ""}`}
                            onClick={() => {
                              if (readOnly) return;
                              const cur = Array.isArray(form.conteudo_prefs) ? [...form.conteudo_prefs] : [];
                              const next = on ? cur.filter((x) => x !== c.v) : [...cur, c.v];
                              setForm((s: any) => ({ ...s, conteudo_prefs: next }));
                            }}
                            disabled={readOnly}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid2 mt">
                    <div>
                      <label>Quer educativo ou ofertas pontuais?</label>
                      <select
                        className="input"
                        value={form.prefere_educativo || ""}
                        onChange={(e) => setForm((s: any) => ({ ...s, prefere_educativo: e.target.value }))}
                        disabled={readOnly}
                      >
                        <option value="">—</option>
                        <option value="educativo">Conteúdos educativos</option>
                        <option value="ofertas">Só ofertas pontuais</option>
                      </select>
                    </div>

                    <div>
                      <label>Como nos conheceu?</label>
                      <select
                        className="input"
                        value={form.como_conheceu || ""}
                        onChange={(e) => setForm((s: any) => ({ ...s, como_conheceu: e.target.value }))}
                        disabled={readOnly}
                      >
                        <option value="">—</option>
                        {COMO_CONHECEU.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="ov-footer">
              <button className="btn" onClick={closeModal}>
                Fechar
              </button>

              {mode !== "view" && (
                <button className="btn-primary" onClick={confirmCadastro} disabled={loading}>
                  {loading ? (
                    <span className="inline gap2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </span>
                  ) : (
                    "Confirmar"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ======= Render principal =======
  return (
    <div className="space-y-4">
      {/* Tabs topo */}
      <div className="topTabs">
        <button className={`tbtn ${tab === "cadastro" ? "on" : ""}`} onClick={() => setTab("cadastro")}>
          Cadastro
        </button>
        <button className={`tbtn ${tab === "demografia" ? "on" : ""}`} onClick={() => setTab("demografia")}>
          Demografia
        </button>
      </div>

      {tab === "demografia" ? (
        <div className="rounded-2xl bg-white p-5 shadow">
          <h3 className="m-0 font-semibold">Demografia</h3>
          <p className="text-slate-600 mt-2">Em breve: gráficos e dados demográficos da carteira de clientes.</p>
        </div>
      ) : (
        <>
          {/* NOVOS (lista simples) */}
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0 font-semibold">
                Novos <span className="text-slate-500 text-sm">({novos.length})</span>
              </h3>
            </div>

            {novos.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum novo cliente no momento.</div>
            ) : (
              <div className="novoList">
                {novos.map((n) => {
                  const phone = n.lead.telefone ? maskPhone(n.lead.telefone) : "—";
                  const wa = n.lead.telefone ? `https://wa.me/55${onlyDigits(n.lead.telefone)}` : "";
                  return (
                    <div key={n.lead.id} className="novoItem">
                      <div className="novoLeft">
                        <div className="novoNome">{n.lead.nome}</div>
                        <div className="novoSub">
                          <span>{phone}</span>
                          {wa && (
                            <a href={wa} target="_blank" rel="noreferrer" className="waMini" title="Abrir WhatsApp">
                              <Send className="h-3.5 w-3.5" /> WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="novoRight">
                        <button className="btn-primary" onClick={() => openCreateFromNovo(n)}>
                          Preencher Cadastro
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* LISTA CLIENTES */}
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="m-0 font-semibold">Lista de Clientes</h3>

              <div className="searchWrap">
                <div className="searchPill">
                  <span className="sIcon">🔎</span>
                  <input
                    className="searchInput"
                    placeholder="Buscar por nome, CPF/CNPJ ou grupo (ex.: 9671)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <small className="text-slate-500">
                  Mostrando {clientes.length ? (page - 1) * PAGE + 1 : 0}-{Math.min(page * PAGE, total)} de {total}
                </small>
              </div>
            </div>

            <div className="rounded-xl border overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Nascimento</th>
                    <th className="p-2 text-left">Vendedor</th>
                    <th className="p-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={4}>
                        Carregando…
                      </td>
                    </tr>
                  )}
                  {!loading && clientes.length === 0 && (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={4}>
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  )}

                  {clientes.map((c, i) => {
                    const phone = c.telefone ? maskPhone(c.telefone) : "";
                    const wa = c.telefone ? `https://wa.me/55${onlyDigits(c.telefone)}` : "";
                    const fotoUrl = (c as any).foto_url || null;

                    return (
                      <tr key={c.id} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
                        <td className="p-2">
                          <div className="cliCell">
                            <div className="cliAvatar">
                              {fotoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={fotoUrl} alt="Foto" />
                              ) : (
                                <span>{initialsFromName(c.nome)}</span>
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{c.nome}</div>
                              <div className="text-xs text-slate-500">
                                CPF: {c.cpf || "—"} • {phone || "—"}
                                {wa && (
                                  <a href={wa} target="_blank" rel="noreferrer" className="waMini2" title="Abrir WhatsApp">
                                    <Send className="h-3.5 w-3.5" /> WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="p-2">{formatBRDate(c.data_nascimento)}</td>

                        <td className="p-2">{(c as any).vendedor_nome || "—"}</td>

                        <td className="p-2">
                          <div className="flex items-center justify-center gap-2">
                            <button className="icon-btn" title="Editar" onClick={() => openEditCliente(c, "edit")}>
                              <Pencil className="h-4 w-4" />
                            </button>

                            <button className="icon-btn" title="Visualizar" onClick={() => openEditCliente(c, "view")}>
                              <Eye className="h-4 w-4" />
                            </button>

                            <button
                              className="icon-btn"
                              title="+ Evento na Agenda"
                              onClick={() => goAgenda(c.lead_id, c.id)}
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </button>

                            <button className="icon-btn" title="Download" onClick={downloadPlaceholder}>
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* paginação */}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button className="btn" disabled={page <= 1 || loading} onClick={() => load(page - 1, debounced)}>
                ‹ Anterior
              </button>
              <span className="text-xs text-slate-600">
                Página {page} de {totalPages}
              </span>
              <button className="btn" disabled={page >= totalPages || loading} onClick={() => load(page + 1, debounced)}>
                Próxima ›
              </button>
            </div>
          </div>

          {/* Modal */}
          <ModalCadastro />
        </>
      )}

      {/* estilos locais */}
      <style>{`
        /* Tabs */
        .topTabs{
          display:flex; gap:10px; align-items:center;
          background:transparent;
        }
        .tbtn{
          padding:10px 14px;
          border-radius:999px;
          border:1px solid #e2e8f0;
          background:#fff;
          font-weight:800;
          color:#1E293F;
          box-shadow:0 6px 18px rgba(15,23,42,.06);
        }
        .tbtn.on{
          background:#1E293F;
          color:#fff;
          border-color:#1E293F;
        }

        /* Inputs/Botões */
        .input{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none;width:100%}
        .textarea{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none;width:100%;min-height:84px;resize:vertical}
        .btn{padding:8px 12px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700}
        .btn-primary{padding:10px 16px;border-radius:12px;background:#A11C27;color:#fff;font-weight:900}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px}
        .icon-btn:hover{background:#eef2ff}
        label{display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:6px}
        .hint{display:block;margin-top:6px;font-size:11px;color:#64748b}

        /* Busca melhor */
        .searchWrap{display:flex; align-items:center; gap:12px}
        .searchPill{
          display:flex; align-items:center; gap:8px;
          border:1px solid #e2e8f0; border-radius:999px;
          padding:8px 12px;
          background:#fff;
          box-shadow:0 8px 24px rgba(15,23,42,.06);
          width:min(520px, 70vw);
        }
        .sIcon{opacity:.7}
        .searchInput{
          border:none; outline:none; width:100%;
          font-size:14px;
        }

        /* Novos lista */
        .novoList{display:flex; flex-direction:column; gap:10px}
        .novoItem{
          display:flex; align-items:center; justify-content:space-between; gap:12px;
          border:1px solid #e2e8f0; border-radius:16px;
          padding:12px 14px;
          background:linear-gradient(180deg,#fff, #fbfbfd);
        }
        .novoLeft{min-width:0}
        .novoNome{font-weight:900; color:#0f172a}
        .novoSub{display:flex; gap:10px; align-items:center; font-size:12px; color:#64748b; flex-wrap:wrap}
        .waMini{
          display:inline-flex; gap:6px; align-items:center;
          border:1px solid #bbf7d0; background:#f0fdf4;
          padding:4px 8px; border-radius:999px; font-weight:800; color:#065f46;
        }

        /* Cliente cell */
        .cliCell{display:flex; align-items:center; gap:10px}
        .cliAvatar{
          width:34px; height:34px; border-radius:999px;
          border:1px solid #e2e8f0; background:#0f172a;
          display:flex; align-items:center; justify-content:center;
          color:#fff; font-weight:900; overflow:hidden;
          flex:0 0 auto;
        }
        .cliAvatar img{width:100%; height:100%; object-fit:cover}
        .waMini2{
          display:inline-flex; gap:6px; align-items:center;
          margin-left:8px;
          border:1px solid #bbf7d0; background:#f0fdf4;
          padding:2px 8px; border-radius:999px; font-weight:800; color:#065f46;
        }

        /* Overlay */
        .ov-backdrop{position:fixed; inset:0; background:rgba(2,6,23,.50); z-index:80}
        .ov-wrap{
          position:fixed; inset:0; z-index:90;
          display:flex; align-items:center; justify-content:center;
          padding:16px;
        }
        .ov-card{
          width:min(1400px, 96vw);
          max-height:92vh;
          background:#fff;
          border-radius:18px;
          box-shadow:0 30px 90px rgba(0,0,0,.25);
          display:flex; flex-direction:column;
          overflow:hidden;
        }
        .ov-top{
          display:flex; align-items:center; justify-content:space-between;
          padding:14px 16px;
          border-bottom:1px solid #e2e8f0;
          background:linear-gradient(90deg, rgba(30,41,63,.06), rgba(161,28,39,.06));
        }
        .ov-top-left{display:flex; align-items:center; gap:12px; min-width:0}
        .avatar{
          width:44px; height:44px; border-radius:999px;
          background:#1E293F;
          color:#fff; font-weight:900;
          display:flex; align-items:center; justify-content:center;
          overflow:hidden;
          border:2px solid rgba(181,165,115,.35);
          flex:0 0 auto;
        }
        .avatar img{width:100%; height:100%; object-fit:cover}
        .ov-title{min-width:0}
        .h1{font-weight:950; color:#0f172a; font-size:15px}
        .sub{
          margin-top:2px;
          display:flex; flex-wrap:wrap;
          gap:8px;
          font-size:12px;
          color:#334155;
        }
        .dot{opacity:.5}
        .icon-x{
          width:40px; height:40px;
          border-radius:12px;
          border:1px solid #e2e8f0;
          background:#fff;
          display:flex; align-items:center; justify-content:center;
        }
        .icon-x:hover{background:#f1f5f9}

        .ov-body{
          padding:14px 16px;
          overflow:auto;
        }
        .ov-footer{
          padding:12px 16px;
          border-top:1px solid #e2e8f0;
          display:flex; justify-content:flex-end; gap:10px;
          background:#fff;
        }

        /* Grid 12 */
        .grid12{display:grid; grid-template-columns:repeat(12, minmax(0,1fr)); gap:12px}
        .sec{
          border:1px solid #e2e8f0;
          border-radius:16px;
          padding:12px;
          background:#fff;
        }
        .sec h4{
          margin:0 0 10px 0;
          font-size:13px;
          font-weight:950;
          color:#0f172a;
        }
        .span4{grid-column:span 4 / span 4}
        .grid2{display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px}
        .span2{grid-column:span 2 / span 2}
        .mt{margin-top:10px}
        .mt2{margin-top:14px}

        .inline{display:flex; gap:8px; align-items:center}
        .uf{width:72px}
        .file{padding:8px}

        /* toggles */
        .row{display:flex; align-items:center; justify-content:space-between; gap:10px}
        .lbl{font-size:12px; color:#0f172a; font-weight:800}
        .tog{display:flex; gap:8px}
        .pill{
          padding:6px 10px;
          border-radius:999px;
          border:1px solid #e2e8f0;
          background:#fff;
          font-weight:900;
          font-size:12px;
        }
        .pill.on{
          background:#1E293F;
          color:#fff;
          border-color:#1E293F;
        }
        .pill.sm{padding:6px 10px}

        .chips{display:flex; flex-wrap:wrap; gap:8px; margin-top:8px}
        .chip{
          padding:8px 10px;
          border-radius:999px;
          border:1px solid #e2e8f0;
          background:#fff;
          font-weight:900;
          font-size:12px;
        }
        .chip.on{
          background:#A11C27;
          color:#fff;
          border-color:#A11C27;
        }

        .childRow{
          display:grid;
          grid-template-columns: 1.3fr 1fr auto auto;
          gap:8px;
          align-items:center;
          margin-bottom:8px;
        }
        .sexTog{display:flex; gap:6px}

        .gap2{gap:8px}
      `}</style>
    </div>
  );
}
