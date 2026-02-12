// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, CalendarPlus, Eye, Send, Check, Loader2, X, Plus } from "lucide-react";

type ClienteRow = {
  id: string; // clientes.id
  lead_id: string | null;
  created_by: string;

  // básicos
  nome: string;
  data_nascimento: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;

  // endereço
  endereco_cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;

  // observações
  observacoes: string | null;

  // NOVOS CAMPOS (SQL que você rodou)
  vendedor_auth_user_id?: string | null;
  tipo?: string | null; // PF | PJ
  segmento_pf?: string | null;
  segmento_pj?: string | null;
  perfil_cliente?: string | null; // PF Geral | PF Agro | PJ
  como_chamar?: string | null;

  contato_emerg_nome?: string | null;
  contato_emerg_telefone?: string | null;

  renda_faturamento?: number | null;
  foto_url?: string | null;

  pai_mae_vivos?: boolean | null;
  pai_nome?: string | null;
  pai_nascimento?: string | null;
  mae_nome?: string | null;
  mae_nascimento?: string | null;

  autoriza_postar_contemplacao?: boolean | null;
  autoriza_homenagens?: boolean | null;

  feedback?: string | null;
  obs_internas?: string | null;

  conteudos_preferidos?: string[] | null;
  prefere_educativo?: boolean | null;
  como_conheceu?: string | null;

  created_at?: string;
  updated_at?: string;
};

type Lead = { id: string; nome: string; telefone?: string | null; email?: string | null; origem?: string | null; owner_id?: string | null };
type UserLite = { auth_user_id: string; nome: string; role?: string | null; is_active?: boolean | null };
type VendaLite = {
  id: string;
  lead_id: string | null;
  created_at: string | null;
  nascimento: string | null;
  descricao: string | null;
  cpf: string | null;
  cpf_cnpj: any | null;
  email: string | null;
  telefone: string | null;
  vendedor_id: string | null; // FK users.auth_user_id
};

type ClienteUI = {
  lead_id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;

  // da venda mais recente
  cpf_dig?: string | null;
  data_nascimento?: string | null; // vendas.nascimento
  observacoes?: string | null; // vendas.descricao
  vendas_ids?: string[];

  // vendedor
  vendedor_auth_user_id?: string | null;
  vendedor_nome?: string | null;

  // se confirmado
  cliente_row?: ClienteRow | null;
};

type FilhoRow = {
  id: string;
  cliente_id: string;
  nome: string;
  data_nascimento: string | null;
  sexo: string | null; // F | M
  created_at?: string;
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
] as const;

const PERFIS = ["PF Geral", "PF Agro", "PJ"] as const;

const CONTENT_PREFS = ["dicas rápidas", "explicações completas", "promoções", "novidades"] as const;

const COMO_CONHECEU = ["Instagram", "Google", "Indicação", "Anúncio", "Relacionamento com o Vendedor", "Outro"] as const;

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

const moneyBR = (n?: number | null) => {
  if (n == null || Number.isNaN(Number(n))) return "";
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const parseMoneyBR = (s: string) => {
  const raw = (s || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};

async function fetchViaCEP(cepDigits: string) {
  const cep = onlyDigits(cepDigits).slice(0, 8);
  if (cep.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!res.ok) return null;
  const j = await res.json();
  if (j?.erro) return null;
  return j as { logradouro?: string; bairro?: string; localidade?: string; uf?: string };
}

async function fetchCNPJBrasilAPI(cnpjDigits: string) {
  const cnpj = onlyDigits(cnpjDigits).slice(0, 14);
  if (cnpj.length !== 14) return null;
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!res.ok) return null;
  const j = await res.json();
  return j as any;
}

function Overlay({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(980px,92vw)] max-h-[88vh] overflow-auto bg-white rounded-2xl shadow-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold m-0">{title}</h3>
          <button className="icon-btn" onClick={onClose} title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export default function ClientesPage() {
  const PAGE = 10;

  const [loading, setLoading] = useState(false);

  // listas
  const [clientes, setClientes] = useState<ClienteUI[]>([]); // confirmados (paginados)
  const [novos, setNovos] = useState<ClienteUI[]>([]); // pendentes (lista simples)
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // busca
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // bases
  const [usersByAuth, setUsersByAuth] = useState<Map<string, UserLite>>(new Map());

  // overlay cadastro/edição/visualização
  type Mode = "create" | "edit" | "view";
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<Mode>("create");
  const [active, setActive] = useState<ClienteUI | null>(null);

  // auth user (created_by)
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  // state do formulário (usado em create/edit/view)
  const [form, setForm] = useState<Partial<ClienteRow>>({});
  const [filhos, setFilhos] = useState<Array<Partial<FilhoRow & { _tmpId?: string }>>>([]);
  const [hasFilhos, setHasFilhos] = useState<boolean>(false);
  const [paisVivos, setPaisVivos] = useState<boolean | null>(null);

  const [saving, setSaving] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [cnpjBusy, setCnpjBusy] = useState(false);

  // upload foto
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoUploading, setFotoUploading] = useState(false);

  // renda input (formatado)
  const [rendaInput, setRendaInput] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setAuthUserId(data?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      // 0) users (pra nome do vendedor)
      const { data: users, error: eUsers } = await supabase
        .from("users")
        .select("auth_user_id,nome,role,is_active")
        .eq("is_active", true);
      if (eUsers) throw eUsers;
      const um = new Map<string, UserLite>();
      (users || []).forEach((u: any) => {
        if (u?.auth_user_id) um.set(String(u.auth_user_id), { auth_user_id: String(u.auth_user_id), nome: u.nome, role: u.role, is_active: u.is_active });
      });
      setUsersByAuth(um);

      // 1) Leads (filtro por nome)
      let leadsQ = supabase.from("leads").select("id,nome,telefone,email,origem,descricao,owner_id").order("nome", { ascending: true });
      if (term) leadsQ = leadsQ.ilike("nome", `%${term}%`);
      const { data: leads, error: eLeads } = await leadsQ.range(0, 5000);
      if (eLeads) throw eLeads;

      const leadIds = (leads || []).map((l: any) => String(l.id));
      if (leadIds.length === 0) {
        setClientes([]);
        setNovos([]);
        setTotal(0);
        setPage(1);
        setLoading(false);
        return;
      }

      // 2) Vendas dos leads
      const { data: vendas, error: eVend } = await supabase
        .from("vendas")
        .select("id,lead_id,cpf,cpf_cnpj,nascimento,descricao,email,telefone,created_at,vendedor_id")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .range(0, 20000);
      if (eVend) throw eVend;

      const vendasByLead = new Map<string, VendaLite[]>();
      (vendas || []).forEach((v: any) => {
        const lid = v.lead_id ? String(v.lead_id) : "";
        if (!lid) return;
        if (!vendasByLead.has(lid)) vendasByLead.set(lid, []);
        vendasByLead.get(lid)!.push({
          id: String(v.id),
          lead_id: v.lead_id ? String(v.lead_id) : null,
          created_at: v.created_at ?? null,
          nascimento: v.nascimento ?? null,
          descricao: v.descricao ?? null,
          cpf: v.cpf ? onlyDigits(String(v.cpf)) : null,
          cpf_cnpj: v.cpf_cnpj ?? null,
          email: v.email ?? null,
          telefone: v.telefone ?? null,
          vendedor_id: v.vendedor_id ? String(v.vendedor_id) : null,
        });
      });

      // 3) Clientes confirmados (agora pegamos todas as colunas novas)
      const { data: cliRows, error: eCli } = await supabase
        .from("clientes")
        .select(
          [
            "id,lead_id,created_by,nome,data_nascimento,cpf,telefone,email,endereco_cep,logradouro,numero,bairro,cidade,uf,observacoes",
            "vendedor_auth_user_id,tipo,segmento_pf,segmento_pj,perfil_cliente,como_chamar,contato_emerg_nome,contato_emerg_telefone",
            "renda_faturamento,foto_url,pai_mae_vivos,pai_nome,pai_nascimento,mae_nome,mae_nascimento,autoriza_postar_contemplacao,autoriza_homenagens",
            "feedback,obs_internas,conteudos_preferidos,prefere_educativo,como_conheceu,created_at,updated_at",
          ].join(",")
        );
      if (eCli) throw eCli;

      const clienteByLead = new Map<string, ClienteRow>();
      (cliRows || []).forEach((c: any) => {
        const lid = c?.lead_id ? String(c.lead_id) : "";
        if (lid) clienteByLead.set(lid, c as ClienteRow);
      });

      // 4) Monta 1 linha por lead (apenas se tem cpf/cpf_cnpj em alguma venda)
      const base: ClienteUI[] = [];
      for (const l of leads || []) {
        const lid = String(l.id);
        const arr = (vendasByLead.get(lid) || []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        const hasCpfAny = arr.some((x) => (x.cpf && x.cpf.length > 0) || x.cpf_cnpj != null);
        if (!hasCpfAny) continue;

        const latest = arr[0];
        const vendAuth = latest?.vendedor_id || l.owner_id || null;
        const vendNome = vendAuth ? (um.get(String(vendAuth))?.nome ?? null) : null;

        base.push({
          lead_id: lid,
          nome: l.nome || "(Sem nome)",
          telefone: l.telefone || latest?.telefone || null,
          email: l.email || latest?.email || null,
          data_nascimento: latest?.nascimento || null,
          observacoes: latest?.descricao || null,
          cpf_dig: latest?.cpf || null,
          vendas_ids: arr.map((x) => x.id),
          vendedor_auth_user_id: vendAuth,
          vendedor_nome: vendNome,
          cliente_row: clienteByLead.get(lid) ?? null,
        });
      }

      const confirmed = base.filter((x) => !!x.cliente_row);
      const pending = base.filter((x) => !x.cliente_row);

      confirmed.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      const from = (target - 1) * PAGE;
      const to = from + PAGE;
      setClientes(confirmed.slice(from, to));
      setTotal(confirmed.length);
      setPage(target);

      pending.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      setNovos(pending);
    } catch (e: any) {
      alert(e.message || "Erro ao listar clientes.");
    } finally {
      setLoading(false);
    }
  }

  // ===== filhos =====
  async function loadFilhos(clienteId: string) {
    const { data, error } = await supabase.from("clientes_filhos").select("id,cliente_id,nome,data_nascimento,sexo,created_at").eq("cliente_id", clienteId);
    if (error) throw error;
    const rows = (data || []) as FilhoRow[];
    rows.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    setFilhos(rows);
    setHasFilhos(rows.length > 0);
  }

  function resetForm() {
    setForm({});
    setFilhos([]);
    setHasFilhos(false);
    setPaisVivos(null);
    setRendaInput("");
    setFotoFile(null);
  }

  function openCadastro(c: ClienteUI, mode: Mode) {
    setActive(c);
    setOverlayMode(mode);
    resetForm();

    const readOnly = mode === "view";
    const existing = c.cliente_row || null;

    // prefill (sempre com base nos dados da venda/lead)
    const pre: Partial<ClienteRow> = {
      // id só existe se confirmado
      id: existing?.id,
      lead_id: c.lead_id,

      // vendedor vem da venda mais recente (ou owner_id do lead fallback)
      vendedor_auth_user_id: c.vendedor_auth_user_id || existing?.vendedor_auth_user_id || null,

      nome: c.nome || existing?.nome || "",
      cpf: (existing?.cpf || c.cpf_dig || "") || null,
      data_nascimento: existing?.data_nascimento || c.data_nascimento || null,
      telefone: existing?.telefone || c.telefone || null,
      email: existing?.email || c.email || null,

      observacoes: existing?.observacoes || c.observacoes || null,

      // extras já salvos
      tipo: existing?.tipo || null,
      segmento_pf: existing?.segmento_pf || null,
      segmento_pj: existing?.segmento_pj || null,
      perfil_cliente: existing?.perfil_cliente || null,
      como_chamar: existing?.como_chamar || null,

      endereco_cep: existing?.endereco_cep || null,
      logradouro: existing?.logradouro || null,
      numero: existing?.numero || null,
      bairro: existing?.bairro || null,
      cidade: existing?.cidade || null,
      uf: existing?.uf || null,

      contato_emerg_nome: existing?.contato_emerg_nome || null,
      contato_emerg_telefone: existing?.contato_emerg_telefone || null,

      renda_faturamento: existing?.renda_faturamento ?? null,
      foto_url: existing?.foto_url ?? null,

      pai_mae_vivos: existing?.pai_mae_vivos ?? null,
      pai_nome: existing?.pai_nome ?? null,
      pai_nascimento: existing?.pai_nascimento ?? null,
      mae_nome: existing?.mae_nome ?? null,
      mae_nascimento: existing?.mae_nascimento ?? null,

      autoriza_postar_contemplacao: existing?.autoriza_postar_contemplacao ?? null,
      autoriza_homenagens: existing?.autoriza_homenagens ?? null,

      feedback: existing?.feedback ?? null,
      obs_internas: existing?.obs_internas ?? null,

      conteudos_preferidos: (existing?.conteudos_preferidos ?? []) as any,
      prefere_educativo: existing?.prefere_educativo ?? null,
      como_conheceu: existing?.como_conheceu ?? null,
    };

    setForm(pre);
    setPaisVivos(pre.pai_mae_vivos ?? null);
    setRendaInput(pre.renda_faturamento != null ? moneyBR(pre.renda_faturamento) : "");

    setOverlayOpen(true);

    // carrega filhos se já confirmado
    if (existing?.id) {
      loadFilhos(existing.id).catch((e) => alert("Erro ao carregar filhos: " + (e?.message || e)));
    } else {
      setFilhos([]);
      setHasFilhos(false);
    }

    // se view, nada extra
    void readOnly;
  }

  function closeOverlay() {
    setOverlayOpen(false);
    setActive(null);
    setSaving(false);
    setFotoUploading(false);
    setCepBusy(false);
    setCnpjBusy(false);
  }

  const isReadOnly = overlayMode === "view";

  function setField<K extends keyof ClienteRow>(k: K, v: ClienteRow[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  // CEP -> ViaCEP
  async function onBuscarCEP() {
    try {
      const cep = String(form.endereco_cep || "");
      const dig = onlyDigits(cep);
      if (dig.length !== 8) return alert("Digite um CEP válido (8 dígitos).");
      setCepBusy(true);
      const j = await fetchViaCEP(dig);
      if (!j) return alert("Não encontrei o CEP. Confira e tente novamente.");
      setField("logradouro", (j.logradouro || "") as any);
      setField("bairro", (j.bairro || "") as any);
      setField("cidade", (j.localidade || "") as any);
      setField("uf", (j.uf || "") as any);
    } catch (e: any) {
      alert("Erro ao buscar CEP: " + (e?.message || e));
    } finally {
      setCepBusy(false);
    }
  }

  // PJ -> tentar CNAE (BrasilAPI) se CPF tiver 14 dígitos (CNPJ)
  async function onBuscarCNAE() {
    try {
      const doc = onlyDigits(String(form.cpf || ""));
      if (doc.length !== 14) return alert("Para buscar CNAE automaticamente, informe um CNPJ (14 dígitos) no campo CPF/CNPJ.");
      setCnpjBusy(true);
      const j = await fetchCNPJBrasilAPI(doc);
      if (!j) return alert("Não consegui buscar o CNPJ agora.");
      const atv = j?.atividade_principal?.[0]?.text || j?.cnae_fiscal_descricao || "";
      if (atv) setField("segmento_pj", atv);
      else alert("CNPJ encontrado, mas não consegui extrair a atividade principal.");
    } catch (e: any) {
      alert("Erro ao buscar CNAE: " + (e?.message || e));
    } finally {
      setCnpjBusy(false);
    }
  }

  function toggleConteudoPref(label: (typeof CONTENT_PREFS)[number]) {
    const cur = (form.conteudos_preferidos || []) as string[];
    const has = cur.includes(label);
    const next = has ? cur.filter((x) => x !== label) : [...cur, label];
    setField("conteudos_preferidos", next as any);
  }

  function addFilhoRow() {
    setHasFilhos(true);
    setFilhos((s) => [
      ...s,
      { _tmpId: `tmp_${Math.random().toString(16).slice(2)}`, nome: "", data_nascimento: null, sexo: null },
    ]);
  }

  function updateFilho(idx: number, patch: Partial<FilhoRow>) {
    setFilhos((s) => s.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeFilho(idx: number) {
    setFilhos((s) => s.filter((_, i) => i !== idx));
  }

  async function uploadFotoIfNeeded(): Promise<string | null> {
    if (!fotoFile) return (form.foto_url as any) || null;

    // você pode criar um bucket depois; pra testar agora, tentamos e se falhar mantemos URL manual
    const bucket = "client_photos";

    try {
      setFotoUploading(true);
      const ext = (fotoFile.name.split(".").pop() || "jpg").toLowerCase();
      const safeName = `${onlyDigits(String(form.cpf || active?.cpf_dig || "")) || "sem_doc"}_${Date.now()}.${ext}`;
      const path = `clientes/${safeName}`;

      const { error: upErr } = await supabase.storage.from(bucket).upload(path, fotoFile, {
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      const url = pub?.publicUrl || null;
      if (!url) throw new Error("Não consegui obter URL da foto.");
      return url;
    } catch (e: any) {
      alert(
        "Não consegui subir a foto agora. Se o bucket 'client_photos' ainda não existir, crie no Storage. " +
          "Você também pode colar uma URL no campo de foto.\n\nDetalhe: " +
          (e?.message || e)
      );
      return (form.foto_url as any) || null;
    } finally {
      setFotoUploading(false);
    }
  }

  // ===== Confirmar / Salvar =====
  async function saveCadastro() {
    if (!active) return;
    if (isReadOnly) return;
    if (!authUserId) return alert("Não consegui identificar seu usuário logado (created_by). Recarregue e tente novamente.");

    // validações mínimas
    const nome = String(form.nome || active.nome || "").trim();
    const cpf = onlyDigits(String(form.cpf || active.cpf_dig || ""));
    if (!nome) return alert("Informe o Nome.");
    if (!cpf) return alert("Informe o CPF/CNPJ.");
    if (!form.tipo) return alert("Selecione o Tipo (PF/PJ).");
    if (!form.perfil_cliente) return alert("Selecione o Perfil do Cliente.");

    if (String(form.tipo) === "PF" && !form.segmento_pf) return alert("Selecione o Segmento (PF).");
    if (String(form.tipo) === "PJ" && !String(form.segmento_pj || "").trim()) return alert("Informe o Segmento de Atuação (PJ).");

    try {
      setSaving(true);

      // 0) upload foto se tiver arquivo
      const fotoUrl = await uploadFotoIfNeeded();

      // 1) Atualiza lead (nome/telefone/email)
      const { error: eLead } = await supabase
        .from("leads")
        .update({
          nome: nome,
          telefone: onlyDigits(String(form.telefone || active.telefone || "")) || null,
          email: String(form.email || "").trim() || null,
        })
        .eq("id", active.lead_id);
      if (eLead) throw eLead;

      // 2) Atualiza venda mais recente (nascimento/observações/cpf/email/telefone se existir)
      const latestVendaId = active.vendas_ids?.[0];
      if (latestVendaId) {
        const { error: eVenda } = await supabase
          .from("vendas")
          .update({
            nascimento: form.data_nascimento || null,
            descricao: String(form.observacoes || "").trim() || null,
            cpf: cpf || null,
            email: String(form.email || "").trim() || null,
            telefone: onlyDigits(String(form.telefone || "")) || null,
          })
          .eq("id", latestVendaId);
        if (eVenda) throw eVenda;
      }

      // 3) payload clientes
      const payload: any = {
        // vínculo
        lead_id: active.lead_id,

        // auditoria
        created_by: authUserId,

        // básicos
        nome,
        cpf: cpf || null,
        data_nascimento: form.data_nascimento || null,
        telefone: onlyDigits(String(form.telefone || "")) || null,
        email: String(form.email || "").trim() || null,

        // endereço
        endereco_cep: onlyDigits(String(form.endereco_cep || "")) || null,
        logradouro: String(form.logradouro || "").trim() || null,
        numero: String(form.numero || "").trim() || null,
        bairro: String(form.bairro || "").trim() || null,
        cidade: String(form.cidade || "").trim() || null,
        uf: String(form.uf || "").trim() || null,

        // observações
        observacoes: String(form.observacoes || "").trim() || null,

        // novos campos
        vendedor_auth_user_id: (form.vendedor_auth_user_id as any) || active.vendedor_auth_user_id || null,
        tipo: String(form.tipo || "").trim() || null,
        segmento_pf: String(form.segmento_pf || "").trim() || null,
        segmento_pj: String(form.segmento_pj || "").trim() || null,
        perfil_cliente: String(form.perfil_cliente || "").trim() || null,
        como_chamar: String(form.como_chamar || "").trim() || null,

        contato_emerg_nome: String(form.contato_emerg_nome || "").trim() || null,
        contato_emerg_telefone: onlyDigits(String(form.contato_emerg_telefone || "")) || null,

        renda_faturamento: form.renda_faturamento ?? null,
        foto_url: fotoUrl || null,

        pai_mae_vivos: form.pai_mae_vivos ?? null,
        pai_nome: String(form.pai_nome || "").trim() || null,
        pai_nascimento: form.pai_nascimento || null,
        mae_nome: String(form.mae_nome || "").trim() || null,
        mae_nascimento: form.mae_nascimento || null,

        autoriza_postar_contemplacao: form.autoriza_postar_contemplacao ?? null,
        autoriza_homenagens: form.autoriza_homenagens ?? null,

        feedback: String(form.feedback || "").trim() || null,
        obs_internas: String(form.obs_internas || "").trim() || null,

        conteudos_preferidos: (form.conteudos_preferidos || []) as any,
        prefere_educativo: form.prefere_educativo ?? null,
        como_conheceu: String(form.como_conheceu || "").trim() || null,
      };

      // 4) upsert por lead_id (se já existir) SENÃO insert
      // (não existe unique em lead_id, então fazemos select primeiro)
      let clienteId: string | null = null;
      if (active.cliente_row?.id) {
        // update
        clienteId = active.cliente_row.id;
        const { error: eUpd } = await supabase.from("clientes").update(payload).eq("id", clienteId);
        if (eUpd) throw eUpd;
      } else {
        // tenta achar por lead_id ou cpf (pra evitar duplicar)
        const { data: foundByLead } = await supabase.from("clientes").select("id").eq("lead_id", active.lead_id).maybeSingle();
        if (foundByLead?.id) {
          clienteId = String(foundByLead.id);
          const { error: eUpd2 } = await supabase.from("clientes").update(payload).eq("id", clienteId);
          if (eUpd2) throw eUpd2;
        } else {
          const { data: foundByCpf } = await supabase.from("clientes").select("id").eq("cpf", cpf).maybeSingle();
          if (foundByCpf?.id) {
            clienteId = String(foundByCpf.id);
            const { error: eUpd3 } = await supabase.from("clientes").update(payload).eq("id", clienteId);
            if (eUpd3) throw eUpd3;
          } else {
            const { data: ins, error: eIns } = await supabase.from("clientes").insert(payload).select("id").single();
            if (eIns) throw eIns;
            clienteId = ins?.id ? String(ins.id) : null;
          }
        }
      }

      if (!clienteId) throw new Error("Não consegui determinar o ID do cliente salvo.");

      // 5) filhos (sincroniza simples: deleta e recria — fácil e confiável)
      // Se preferir, depois a gente evolui pra diff.
      await supabase.from("clientes_filhos").delete().eq("cliente_id", clienteId);

      if (hasFilhos) {
        const clean = (filhos || [])
          .map((f) => ({
            cliente_id: clienteId,
            nome: String(f.nome || "").trim(),
            data_nascimento: (f.data_nascimento as any) || null,
            sexo: (f.sexo as any) || null,
          }))
          .filter((x) => x.nome.length > 0);

        if (clean.length) {
          const { error: eF } = await supabase.from("clientes_filhos").insert(clean as any);
          if (eF) throw eF;
        }
      }

      alert(overlayMode === "create" ? "Cliente confirmado!" : "Cliente atualizado!");
      closeOverlay();
      await load(page, debounced);
    } catch (e: any) {
      alert("Erro ao salvar: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE)), [total]);

  function goAgenda(cliente?: ClienteUI | null) {
    const cr = cliente?.cliente_row;
    const cid = cr?.id ? String(cr.id) : "";
    const lid = cliente?.lead_id ? String(cliente.lead_id) : "";
    const uid = (cr?.vendedor_auth_user_id || cliente?.vendedor_auth_user_id || "") as string;
    const qp = new URLSearchParams();
    if (cid) qp.set("cliente_id", cid);
    if (lid) qp.set("lead_id", lid);
    if (uid) qp.set("user_id", uid);
    window.location.href = `/agenda?${qp.toString()}`;
  }

  // ====== UI ======
  return (
    <div className="space-y-4">
      {/* NOVOS */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="m-0 font-semibold">
            Novos <span className="text-slate-500 text-sm">({novos.length})</span>
          </h3>
        </div>

        {novos.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhum novo cliente no momento.</div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">Nome</th>
                  <th className="p-2 text-left">Telefone</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {novos.map((c, i) => {
                  const phone = c.telefone ? maskPhone(c.telefone) : "—";
                  return (
                    <tr key={c.lead_id} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
                      <td className="p-2">
                        <div className="font-medium">{c.nome}</div>
                        <div className="text-xs text-slate-500">CPF: {c.cpf_dig || "—"}</div>
                      </td>
                      <td className="p-2">{phone}</td>
                      <td className="p-2">{c.vendedor_nome || "—"}</td>
                      <td className="p-2 text-right">
                        <button className="btn-primary" onClick={() => openCadastro(c, "create")} disabled={loading}>
                          Preencher Cadastro
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LISTA (confirmados) */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="m-0 font-semibold">Lista de Clientes</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <input className="input pl-9 w-80 max-w-[78vw]" placeholder="Buscar por nome" value={search} onChange={(e) => setSearch(e.target.value)} />
              <span className="absolute left-3 top-2.5 opacity-60">🔎</span>
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
                <th className="p-2 text-left">Nome</th>
                <th className="p-2 text-left">Telefone</th>
                <th className="p-2 text-left">E-mail</th>
                <th className="p-2 text-left">Nascimento</th>
                <th className="p-2 text-left">Vendedor</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={6}>
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading && clientes.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={6}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}

              {clientes.map((c, i) => {
                const cr = c.cliente_row;
                const phone = (cr?.telefone || c.telefone) ? maskPhone(String(cr?.telefone || c.telefone)) : "";
                const wa = (cr?.telefone || c.telefone) ? `https://wa.me/55${onlyDigits(String(cr?.telefone || c.telefone))}` : "";
                const vendName = cr?.vendedor_auth_user_id ? usersByAuth.get(String(cr.vendedor_auth_user_id))?.nome : c.vendedor_nome;

                return (
                  <tr key={c.lead_id} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
                    <td className="p-2">
                      <div className="font-medium">{cr?.nome || c.nome}</div>
                      <div className="text-xs text-slate-500">CPF: {cr?.cpf || c.cpf_dig || "—"}</div>
                      <div className="text-xs text-slate-500">Perfil: {cr?.perfil_cliente || "—"} • Tipo: {cr?.tipo || "—"}</div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {phone || "—"}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir WhatsApp"
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-green-50"
                          >
                            <Send className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-2">{cr?.email || c.email || "—"}</td>
                    <td className="p-2">{formatBRDate(cr?.data_nascimento || c.data_nascimento)}</td>
                    <td className="p-2">{vendName || "—"}</td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-2">
                        <button className="icon-btn" title="Editar" onClick={() => openCadastro(c, "edit")}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="icon-btn" title="Visualizar" onClick={() => openCadastro(c, "view")}>
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="icon-btn" title="+ Evento na Agenda" onClick={() => goAgenda(c)}>
                          <CalendarPlus className="h-4 w-4" />
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

      {/* OVERLAY Cadastro / Edit / View */}
      <Overlay
        open={overlayOpen}
        title={
          overlayMode === "create" ? "Preencher Cadastro (Confirmar Cliente)" : overlayMode === "edit" ? "Editar Cadastro do Cliente" : "Visualizar Cadastro do Cliente"
        }
        onClose={closeOverlay}
      >
        {!active ? (
          <div className="text-sm text-slate-500">—</div>
        ) : (
          <>
            {/* Cabeçalho resumo */}
            <div className="rounded-xl border p-3 mb-3 bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{form.nome || active.nome}</div>
                  <div className="text-xs text-slate-600">
                    Vendedor:{" "}
                    {(() => {
                      const vendAuth = (form.vendedor_auth_user_id as any) || active.vendedor_auth_user_id;
                      const vend = vendAuth ? usersByAuth.get(String(vendAuth))?.nome : null;
                      return vend || active.vendedor_nome || "—";
                    })()}
                    {" • "}
                    Lead: {active.lead_id}
                  </div>
                </div>

                <div className="text-xs text-slate-600">
                  CPF/CNPJ: {onlyDigits(String(form.cpf || "")) || active.cpf_dig || "—"}{" "}
                  {" • "}
                  Nasc./Const.: {formatBRDate(String(form.data_nascimento || ""))}
                </div>
              </div>
            </div>

            {/* Seções */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* 1) Identidade */}
              <div className="rounded-xl border p-3">
                <div className="font-semibold mb-2">Identidade</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="label">Vendedor (auto)</label>
                    <input
                      className="input"
                      value={(() => {
                        const vendAuth = (form.vendedor_auth_user_id as any) || active.vendedor_auth_user_id;
                        const vend = vendAuth ? usersByAuth.get(String(vendAuth))?.nome : null;
                        return vend || active.vendedor_nome || "";
                      })()}
                      disabled
                    />
                    <div className="text-[11px] text-slate-500 mt-1">Capturado da venda mais recente (vendas.vendedor_id).</div>
                  </div>

                  <div>
                    <label className="label">Perfil do Cliente</label>
                    <select
                      className="input"
                      value={String(form.perfil_cliente || "")}
                      onChange={(e) => setField("perfil_cliente", e.target.value as any)}
                      disabled={isReadOnly}
                    >
                      <option value="">Selecione…</option>
                      {PERFIS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Tipo</label>
                    <select
                      className="input"
                      value={String(form.tipo || "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        setField("tipo", v as any);
                        // limpa segmento oposto
                        if (v === "PF") setField("segmento_pj", null as any);
                        if (v === "PJ") setField("segmento_pf", null as any);
                      }}
                      disabled={isReadOnly}
                    >
                      <option value="">Selecione…</option>
                      <option value="PF">PF</option>
                      <option value="PJ">PJ</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Segmento</label>

                    {String(form.tipo || "") === "PJ" ? (
                      <div className="flex gap-2">
                        <input
                          className="input flex-1"
                          placeholder="Segmento de atuação principal"
                          value={String(form.segmento_pj || "")}
                          onChange={(e) => setField("segmento_pj", e.target.value as any)}
                          disabled={isReadOnly}
                        />
                        <button className="btn" onClick={onBuscarCNAE} disabled={isReadOnly || cnpjBusy}>
                          {cnpjBusy ? "Buscando..." : "Buscar CNAE"}
                        </button>
                      </div>
                    ) : (
                      <select
                        className="input"
                        value={String(form.segmento_pf || "")}
                        onChange={(e) => setField("segmento_pf", e.target.value as any)}
                        disabled={isReadOnly}
                      >
                        <option value="">Selecione…</option>
                        {PF_SEGMENTOS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Nome</label>
                    <input className="input" value={String(form.nome || "")} onChange={(e) => setField("nome", e.target.value as any)} disabled={isReadOnly} />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Como você gostaria de ser chamado?</label>
                    <input
                      className="input"
                      placeholder="Nome, apelido, diminutivo, nome social…"
                      value={String(form.como_chamar || "")}
                      onChange={(e) => setField("como_chamar", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">CPF/CNPJ</label>
                    <input
                      className="input"
                      value={String(form.cpf || "")}
                      onChange={(e) => setField("cpf", onlyDigits(e.target.value) as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">Data Nascimento/Constituição</label>
                    <input
                      className="input"
                      type="date"
                      value={String(form.data_nascimento || "")}
                      onChange={(e) => setField("data_nascimento", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">Telefone</label>
                    <input
                      className="input"
                      value={maskPhone(String(form.telefone || ""))}
                      onChange={(e) => setField("telefone", onlyDigits(e.target.value) as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">E-mail</label>
                    <input
                      className="input"
                      value={String(form.email || "")}
                      onChange={(e) => setField("email", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>
                </div>
              </div>

              {/* 2) Endereço + Contato + Renda + Foto */}
              <div className="rounded-xl border p-3">
                <div className="font-semibold mb-2">Contato & Endereço</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="label">CEP</label>
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Somente números"
                        value={String(form.endereco_cep || "")}
                        onChange={(e) => setField("endereco_cep", onlyDigits(e.target.value) as any)}
                        disabled={isReadOnly}
                      />
                      <button className="btn" onClick={onBuscarCEP} disabled={isReadOnly || cepBusy}>
                        {cepBusy ? "Buscando..." : "Buscar"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label">Número</label>
                    <input
                      className="input"
                      value={String(form.numero || "")}
                      onChange={(e) => setField("numero", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Logradouro</label>
                    <input
                      className="input"
                      value={String(form.logradouro || "")}
                      onChange={(e) => setField("logradouro", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">Bairro</label>
                    <input className="input" value={String(form.bairro || "")} onChange={(e) => setField("bairro", e.target.value as any)} disabled={isReadOnly} />
                  </div>

                  <div>
                    <label className="label">Cidade/UF</label>
                    <div className="flex gap-2">
                      <input className="input flex-1" value={String(form.cidade || "")} onChange={(e) => setField("cidade", e.target.value as any)} disabled={isReadOnly} />
                      <input className="input w-20" value={String(form.uf || "")} onChange={(e) => setField("uf", e.target.value as any)} disabled={isReadOnly} />
                    </div>
                  </div>

                  <div>
                    <label className="label">Contato de emergência (Nome)</label>
                    <input
                      className="input"
                      value={String(form.contato_emerg_nome || "")}
                      onChange={(e) => setField("contato_emerg_nome", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">Contato de emergência (Telefone)</label>
                    <input
                      className="input"
                      value={maskPhone(String(form.contato_emerg_telefone || ""))}
                      onChange={(e) => setField("contato_emerg_telefone", onlyDigits(e.target.value) as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">Renda/Faturamento</label>
                    <input
                      className="input"
                      placeholder="R$ 0,00"
                      value={rendaInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRendaInput(v);
                        const parsed = parseMoneyBR(v);
                        setField("renda_faturamento", (parsed ?? null) as any);
                      }}
                      disabled={isReadOnly}
                    />
                    <div className="text-[11px] text-slate-500 mt-1">Salva como número (numeric) no banco.</div>
                  </div>

                  <div>
                    <label className="label">Foto (anexar)</label>
                    <input
                      className="input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFotoFile(e.target.files?.[0] || null)}
                      disabled={isReadOnly || fotoUploading}
                    />
                    <div className="text-[11px] text-slate-500 mt-1">Se não subir agora, cole uma URL abaixo.</div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Foto (URL)</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={String(form.foto_url || "")}
                      onChange={(e) => setField("foto_url", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                    {!!form.foto_url && (
                      <div className="mt-2">
                        <img src={String(form.foto_url)} alt="Foto do cliente" className="h-24 w-24 object-cover rounded-xl border" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3) Família */}
              <div className="rounded-xl border p-3">
                <div className="font-semibold mb-2">Família</div>

                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">Possui pai e mãe vivos?</span>
                    <button
                      className={`pill ${paisVivos === true ? "pill-on" : ""}`}
                      onClick={() => {
                        if (isReadOnly) return;
                        setPaisVivos(true);
                        setField("pai_mae_vivos", true as any);
                      }}
                      disabled={isReadOnly}
                    >
                      Sim
                    </button>
                    <button
                      className={`pill ${paisVivos === false ? "pill-on" : ""}`}
                      onClick={() => {
                        if (isReadOnly) return;
                        setPaisVivos(false);
                        setField("pai_mae_vivos", false as any);
                        setField("pai_nome", null as any);
                        setField("pai_nascimento", null as any);
                        setField("mae_nome", null as any);
                        setField("mae_nascimento", null as any);
                      }}
                      disabled={isReadOnly}
                    >
                      Não
                    </button>
                  </div>

                  {paisVivos === true && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="label">Pai (Nome)</label>
                        <input className="input" value={String(form.pai_nome || "")} onChange={(e) => setField("pai_nome", e.target.value as any)} disabled={isReadOnly} />
                      </div>
                      <div>
                        <label className="label">Pai (Nascimento)</label>
                        <input className="input" type="date" value={String(form.pai_nascimento || "")} onChange={(e) => setField("pai_nascimento", e.target.value as any)} disabled={isReadOnly} />
                      </div>
                      <div>
                        <label className="label">Mãe (Nome)</label>
                        <input className="input" value={String(form.mae_nome || "")} onChange={(e) => setField("mae_nome", e.target.value as any)} disabled={isReadOnly} />
                      </div>
                      <div>
                        <label className="label">Mãe (Nascimento)</label>
                        <input className="input" type="date" value={String(form.mae_nascimento || "")} onChange={(e) => setField("mae_nascimento", e.target.value as any)} disabled={isReadOnly} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span className="text-sm font-semibold">Possui filhos?</span>
                    <button
                      className={`pill ${hasFilhos ? "pill-on" : ""}`}
                      onClick={() => {
                        if (isReadOnly) return;
                        if (!hasFilhos) {
                          setHasFilhos(true);
                          if (filhos.length === 0) addFilhoRow();
                        }
                      }}
                      disabled={isReadOnly}
                    >
                      Sim
                    </button>
                    <button
                      className={`pill ${!hasFilhos ? "pill-on" : ""}`}
                      onClick={() => {
                        if (isReadOnly) return;
                        setHasFilhos(false);
                        setFilhos([]);
                      }}
                      disabled={isReadOnly}
                    >
                      Não
                    </button>

                    {hasFilhos && !isReadOnly && (
                      <button className="btn inline-flex items-center gap-2 ml-auto" onClick={addFilhoRow}>
                        <Plus className="h-4 w-4" /> Adicionar filho
                      </button>
                    )}
                  </div>

                  {hasFilhos && (
                    <div className="grid grid-cols-1 gap-2">
                      {filhos.map((f, idx) => (
                        <div key={(f.id as any) || (f._tmpId as any) || idx} className="rounded-xl border p-2">
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                            <div className="md:col-span-2">
                              <label className="label">Nome</label>
                              <input
                                className="input"
                                value={String(f.nome || "")}
                                onChange={(e) => updateFilho(idx, { nome: e.target.value })}
                                disabled={isReadOnly}
                              />
                            </div>
                            <div>
                              <label className="label">Nascimento</label>
                              <input
                                className="input"
                                type="date"
                                value={String(f.data_nascimento || "")}
                                onChange={(e) => updateFilho(idx, { data_nascimento: e.target.value })}
                                disabled={isReadOnly}
                              />
                            </div>
                            <div>
                              <label className="label">Sexo</label>
                              <div className="flex gap-2">
                                <button
                                  className={`pill ${String(f.sexo || "") === "F" ? "pill-on" : ""}`}
                                  onClick={() => !isReadOnly && updateFilho(idx, { sexo: "F" })}
                                  disabled={isReadOnly}
                                >
                                  F
                                </button>
                                <button
                                  className={`pill ${String(f.sexo || "") === "M" ? "pill-on" : ""}`}
                                  onClick={() => !isReadOnly && updateFilho(idx, { sexo: "M" })}
                                  disabled={isReadOnly}
                                >
                                  M
                                </button>
                              </div>
                            </div>
                            {!isReadOnly && (
                              <div className="text-right">
                                <button className="btn" onClick={() => removeFilho(idx)}>
                                  Remover
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 4) Autorizações + Feedback */}
              <div className="rounded-xl border p-3">
                <div className="font-semibold mb-2">Autorizações & Feedback</div>

                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-xl border p-2 bg-slate-50">
                    <div className="text-sm font-semibold mb-2">Autorizações</div>

                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm">Autoriza publicar quando contemplar?</span>
                        <div className="flex gap-2">
                          <button
                            className={`pill ${form.autoriza_postar_contemplacao === true ? "pill-on" : ""}`}
                            onClick={() => !isReadOnly && setField("autoriza_postar_contemplacao", true as any)}
                            disabled={isReadOnly}
                          >
                            Sim
                          </button>
                          <button
                            className={`pill ${form.autoriza_postar_contemplacao === false ? "pill-on" : ""}`}
                            onClick={() => !isReadOnly && setField("autoriza_postar_contemplacao", false as any)}
                            disabled={isReadOnly}
                          >
                            Não
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm">Autoriza usar nome/foto em homenagens?</span>
                        <div className="flex gap-2">
                          <button
                            className={`pill ${form.autoriza_homenagens === true ? "pill-on" : ""}`}
                            onClick={() => !isReadOnly && setField("autoriza_homenagens", true as any)}
                            disabled={isReadOnly}
                          >
                            Sim
                          </button>
                          <button
                            className={`pill ${form.autoriza_homenagens === false ? "pill-on" : ""}`}
                            onClick={() => !isReadOnly && setField("autoriza_homenagens", false as any)}
                            disabled={isReadOnly}
                          >
                            Não
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="label">Feedback (percepção sobre Consulmax e vendedor)</label>
                    <textarea
                      className="input min-h-[92px]"
                      value={String(form.feedback || "")}
                      onChange={(e) => setField("feedback", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div>
                    <label className="label">Obs. internas</label>
                    <textarea
                      className="input min-h-[92px]"
                      value={String(form.obs_internas || "")}
                      onChange={(e) => setField("obs_internas", e.target.value as any)}
                      disabled={isReadOnly}
                    />
                  </div>

                  <div className="rounded-xl border p-2 bg-slate-50">
                    <div className="text-sm font-semibold mb-2">Preferências de conteúdo</div>

                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex flex-wrap gap-2">
                        {CONTENT_PREFS.map((p) => {
                          const on = ((form.conteudos_preferidos || []) as string[]).includes(p);
                          return (
                            <button
                              key={p}
                              className={`pill ${on ? "pill-on" : ""}`}
                              onClick={() => !isReadOnly && toggleConteudoPref(p)}
                              disabled={isReadOnly}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm">Quer receber conteúdos educativos ou só ofertas pontuais?</span>
                        <div className="flex gap-2">
                          <button
                            className={`pill ${form.prefere_educativo === true ? "pill-on" : ""}`}
                            onClick={() => !isReadOnly && setField("prefere_educativo", true as any)}
                            disabled={isReadOnly}
                          >
                            Educativo
                          </button>
                          <button
                            className={`pill ${form.prefere_educativo === false ? "pill-on" : ""}`}
                            onClick={() => !isReadOnly && setField("prefere_educativo", false as any)}
                            disabled={isReadOnly}
                          >
                            Ofertas
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="label">Como nos conheceu? (1 opção)</label>
                          <select
                            className="input"
                            value={String(form.como_conheceu || "")}
                            onChange={(e) => setField("como_conheceu", e.target.value as any)}
                            disabled={isReadOnly}
                          >
                            <option value="">Selecione…</option>
                            {COMO_CONHECEU.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label">Observações (da venda/cliente)</label>
                          <input
                            className="input"
                            value={String(form.observacoes || "")}
                            onChange={(e) => setField("observacoes", e.target.value as any)}
                            disabled={isReadOnly}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <button className="btn" onClick={closeOverlay}>
                      {isReadOnly ? "Fechar" : "Cancelar"}
                    </button>

                    {!isReadOnly && (
                      <button className="btn-primary inline-flex items-center gap-2" onClick={saveCadastro} disabled={saving || fotoUploading}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {overlayMode === "create" ? "Confirmar" : "Salvar alterações"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {(saving || fotoUploading) && (
              <div className="mt-3 text-xs text-slate-500">
                {saving ? "Salvando dados..." : ""} {fotoUploading ? "Enviando foto..." : ""}
              </div>
            )}
          </>
        )}
      </Overlay>

      {/* estilos locais */}
      <style>{`
        .input{padding:10px;border-radius:12px;border:1px solid #e5e7eb;outline:none;width:100%}
        .btn{padding:8px 12px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700}
        .btn-primary{padding:10px 16px;border-radius:12px;background:#A11C27;color:#fff;font-weight:800}
        .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px}
        .icon-btn:hover{background:#eef2ff}
        .label{display:block;font-size:12px;color:#475569;margin-bottom:6px;font-weight:700}
        .pill{padding:6px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;font-weight:800;font-size:12px}
        .pill-on{background:#111827;color:#fff;border-color:#111827}
      `}</style>
    </div>
  );
}
