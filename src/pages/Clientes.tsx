// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, CalendarPlus, Eye, Send, Check, Loader2, X, Plus, Search, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ClienteBase = {
  id: string; // lead_id
  lead_id: string;

  nome: string;
  telefone?: string | null;
  email?: string | null;

  cpf_dig?: string | null; // vendas.cpf digits
  data_nascimento?: string | null; // vendas.nascimento
  observacoes?: string | null; // vendas.descricao
  vendas_ids?: string[];

  vendedor_auth_user_id?: string | null;
  vendedor_nome?: string | null;

  // usado só para busca por grupo (venda mais recente) — não exibimos na lista
  grupo?: string | null;

  cliente_row_id?: string | null; // clientes.id

  // foto do cliente (extra.foto_url serializado em observacoes)
  foto_url?: string | null;
};

type TipoPessoa = "PF" | "PJ";
type PerfilCliente = "PF Geral" | "PF Agro" | "PJ";
type SegmentoPF =
  | "Assalariado"
  | "Autônomo"
  | "Aposentado"
  | "Empresário"
  | "Funcionário Público"
  | "Motorista"
  | "Produtor Rural"
  | "Profissional Liberal"
  | "Locador ou Proprietário";

type ConteudoPref = "dicas rápidas" | "explicações completas" | "promoções" | "novidades";
type ComoConheceu = "Instagram" | "Google" | "Indicação" | "Anúncio" | "Relacionamento com o Vendedor" | "Outro";

type Filho = { nome: string; nascimento: string; sexo: "F" | "M" | "" };

type CadastroExtra = {
  tipo: TipoPessoa;
  segmento_pf: SegmentoPF | "";
  segmento_pj: string;
  perfil: PerfilCliente;

  chamado_como: string;

  endereco_cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;

  emergencia_nome: string;
  emergencia_telefone: string;

  renda_faturamento: string;
  foto_url: string;

  pais_vivos: "sim" | "nao" | "";
  pai_nome: string;
  pai_nasc: string;
  mae_nome: string;
  mae_nasc: string;

  possui_filhos: "sim" | "nao" | "";
  filhos: Filho[];

  autoriza_publicar: "sim" | "nao" | "";
  autoriza_homenagem: "sim" | "nao" | "";

  feedback: string;
  obs_internas: string;

  conteudos: ConteudoPref[];
  prefere_educativo: "educativo" | "ofertas" | "";
  como_conheceu: ComoConheceu | "";
};

const STORAGE_BUCKET_CLIENTES = "clientes_photos";

const SEGMENTOS_PF: SegmentoPF[] = [
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

const CONTEUDOS: ConteudoPref[] = ["dicas rápidas", "explicações completas", "promoções", "novidades"];
const COMO_CONHECEU: ComoConheceu[] = ["Instagram", "Google", "Indicação", "Anúncio", "Relacionamento com o Vendedor", "Outro"];

const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
const clamp = (s: string, n: number) => (s || "").slice(0, n);

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

const initialsFromName = (name: string) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase() || "—";
};

const emptyExtra = (): CadastroExtra => ({
  tipo: "PF",
  segmento_pf: "",
  segmento_pj: "",
  perfil: "PF Geral",

  chamado_como: "",

  endereco_cep: "",
  logradouro: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "",

  emergencia_nome: "",
  emergencia_telefone: "",

  renda_faturamento: "",
  foto_url: "",

  pais_vivos: "",
  pai_nome: "",
  pai_nasc: "",
  mae_nome: "",
  mae_nasc: "",

  possui_filhos: "",
  filhos: [{ nome: "", nascimento: "", sexo: "" }],

  autoriza_publicar: "",
  autoriza_homenagem: "",

  feedback: "",
  obs_internas: "",

  conteudos: [],
  prefere_educativo: "",
  como_conheceu: "",
});

function safeParseExtraFromObservacoes(observacoes?: string | null): { extra: CadastroExtra | null; legacyText: string } {
  const raw = (observacoes || "").trim();
  if (!raw) return { extra: null, legacyText: "" };

  if (raw.startsWith("CMX_JSON:")) {
    const jsonStr = raw.slice("CMX_JSON:".length).trim();
    try {
      const parsed = JSON.parse(jsonStr);
      return { extra: { ...emptyExtra(), ...(parsed || {}) }, legacyText: "" };
    } catch {
      return { extra: null, legacyText: raw };
    }
  }

  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      return { extra: { ...emptyExtra(), ...(parsed || {}) }, legacyText: "" };
    } catch {
      return { extra: null, legacyText: raw };
    }
  }

  return { extra: null, legacyText: raw };
}

function serializeExtraToObservacoes(extra: CadastroExtra, legacyObsInterna?: string) {
  const payload = { ...(extra || emptyExtra()) };
  if (legacyObsInterna && !payload.obs_internas) payload.obs_internas = legacyObsInterna;
  return `CMX_JSON:${JSON.stringify(payload)}`;
}

async function fetchCep(cepDigits: string) {
  const cep = onlyDigits(cepDigits).slice(0, 8);
  if (cep.length !== 8) throw new Error("CEP inválido.");
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!res.ok) throw new Error("Falha ao buscar CEP.");
  const j = await res.json();
  if (j?.erro) throw new Error("CEP não encontrado.");
  return {
    logradouro: j.logradouro || "",
    bairro: j.bairro || "",
    cidade: j.localidade || "",
    uf: j.uf || "",
  };
}

function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1400px,96vw)] bg-white rounded-2xl shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 bg-white border-b p-5 flex items-center justify-between gap-3 rounded-t-2xl">
          <h3 className="font-semibold m-0">{title}</h3>
          <button className="icon-btn" onClick={onClose} title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 max-h-[90vh] overflow-auto">{children}</div>
      </div>
    </>
  );
}

function PillToggle({
  value,
  onChange,
  disabled,
  leftLabel = "Sim",
  rightLabel = "Não",
}: {
  value: "sim" | "nao" | "";
  onChange: (v: "sim" | "nao") => void;
  disabled?: boolean;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`pill ${value === "sim" ? "pill-on" : ""}`}
        onClick={() => onChange("sim")}
        disabled={disabled}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        className={`pill ${value === "nao" ? "pill-on" : ""}`}
        onClick={() => onChange("nao")}
        disabled={disabled}
      >
        {rightLabel}
      </button>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  disabled,
  placeholder = "R$ 0,00",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      className="input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      inputMode="numeric"
    />
  );
}

function AvatarCircle({ url, name, size = 44 }: { url?: string | null; name: string; size?: number }) {
  const ini = initialsFromName(name);
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: 999,
        overflow: "hidden",
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title={name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontWeight: 900, fontSize: size >= 44 ? 14 : 12, color: "#0f172a" }}>{ini}</span>
      )}
    </div>
  );
}

export default function ClientesPage() {
  const PAGE = 10;

  const [loading, setLoading] = useState(false);

  const [clientes, setClientes] = useState<ClienteBase[]>([]);
  const [novos, setNovos] = useState<ClienteBase[]>([]);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<"novo" | "edit" | "view">("novo");
  const [active, setActive] = useState<ClienteBase | null>(null);

  const [nome, setNome] = useState("");
  const [chamadoComo, setChamadoComo] = useState("");
  const [cpf, setCpf] = useState("");
  const [birth, setBirth] = useState<string>("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  const [extra, setExtra] = useState<CadastroExtra>(emptyExtra());
  const [legacyObs, setLegacyObs] = useState("");

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // 🔎 BUSCA: nome OU cpf/cnpj OU grupo
  async function getLeadIdsBySearch(term: string): Promise<string[] | null> {
    const t = term.trim();
    if (!t) return null;

    const ids = new Set<string>();
    const digits = onlyDigits(t);

    // 1) buscar em leads.nome (ilike)
    const { data: leadsByName, error: e1 } = await supabase
      .from("leads")
      .select("id")
      .ilike("nome", `%${t}%`)
      .range(0, 300);
    if (e1) throw e1;
    (leadsByName || []).forEach((r: any) => ids.add(String(r.id)));

    // 2) buscar em vendas.grupo (ilike)
    const { data: vendasByGrupo, error: e2 } = await supabase
      .from("vendas")
      .select("lead_id")
      .ilike("grupo", `%${t}%`)
      .not("lead_id", "is", null)
      .range(0, 600);
    if (e2) throw e2;
    (vendasByGrupo || []).forEach((r: any) => r.lead_id && ids.add(String(r.lead_id)));

    // 3) buscar em vendas.cpf (ilike) usando só dígitos, se tiver
    if (digits.length >= 5) {
      const { data: vendasByCpf, error: e3 } = await supabase
        .from("vendas")
        .select("lead_id")
        .ilike("cpf", `%${digits}%`)
        .not("lead_id", "is", null)
        .range(0, 600);
      if (e3) throw e3;
      (vendasByCpf || []).forEach((r: any) => r.lead_id && ids.add(String(r.lead_id)));
    }

    return Array.from(ids);
  }

  async function load(target = 1, term = "") {
    setLoading(true);
    try {
      const leadIdsFilter = await getLeadIdsBySearch(term);

      // 1) Leads
      let leadsQ = supabase.from("leads").select("id,nome,telefone,email").order("nome", { ascending: true });

      if (leadIdsFilter && leadIdsFilter.length) {
        leadsQ = leadsQ.in("id", leadIdsFilter);
      } else if (term) {
        // se term existe mas não achou nenhum id, retorna vazio
        setClientes([]);
        setNovos([]);
        setTotal(0);
        setPage(1);
        return;
      }

      const { data: leads, error: eLeads } = await leadsQ.range(0, 5000);
      if (eLeads) throw eLeads;

      const leadIds = (leads || []).map((l: any) => String(l.id));
      if (leadIds.length === 0) {
        setClientes([]);
        setNovos([]);
        setTotal(0);
        setPage(1);
        return;
      }

      // 2) Vendas dos leads
      const { data: vendas, error: eVend } = await supabase
        .from("vendas")
        .select("id,lead_id,cpf,cpf_cnpj,nascimento,descricao,created_at,vendedor_id,email,telefone,grupo")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .range(0, 20000);
      if (eVend) throw eVend;

      type VendaLite = {
        id: string;
        created_at: string | null;
        nasc?: string | null;
        obs?: string | null;
        cpf?: string | null;
        hasCpfCnpj?: boolean;
        vendedor_id?: string | null;
        email?: string | null;
        telefone?: string | null;
        grupo?: string | null;
      };

      const vendasByLead = new Map<string, VendaLite[]>();
      const vendorAuthIds = new Set<string>();

      (vendas || []).forEach((v: any) => {
        const lid = v.lead_id ? String(v.lead_id) : "";
        if (!lid) return;

        if (!vendasByLead.has(lid)) vendasByLead.set(lid, []);
        const vendedorId = v.vendedor_id ? String(v.vendedor_id) : null;
        if (vendedorId) vendorAuthIds.add(vendedorId);

        vendasByLead.get(lid)!.push({
          id: String(v.id),
          created_at: v.created_at ?? null,
          nasc: v.nascimento ?? null,
          obs: v.descricao ?? null,
          cpf: v.cpf ? onlyDigits(String(v.cpf)) : null,
          hasCpfCnpj: v.cpf_cnpj != null,
          vendedor_id: vendedorId,
          email: v.email ?? null,
          telefone: v.telefone ?? null,
          grupo: v.grupo ?? null,
        });
      });

      // 3) Users para nome do vendedor
      const vendorList = Array.from(vendorAuthIds);
      const usersByAuth = new Map<string, { nome: string }>();
      if (vendorList.length) {
        const { data: uRows, error: eU } = await supabase.from("users").select("auth_user_id,nome").in("auth_user_id", vendorList);
        if (eU) throw eU;
        (uRows || []).forEach((u: any) => usersByAuth.set(String(u.auth_user_id), { nome: u.nome || "—" }));
      }

      // 4) Clientes confirmados (e foto via observacoes)
      const { data: cliRows, error: eCli } = await supabase.from("clientes").select("id,lead_id,observacoes");
      if (eCli) throw eCli;

      const confirmedByLead = new Map<string, { id: string; foto_url: string | null }>();
      (cliRows || []).forEach((c: any) => {
        const lid = c.lead_id ? String(c.lead_id) : "";
        if (!lid) return;

        const { extra: parsedExtra } = safeParseExtraFromObservacoes(c.observacoes);
        const foto = parsedExtra?.foto_url ? String(parsedExtra.foto_url) : null;

        confirmedByLead.set(lid, { id: String(c.id), foto_url: foto });
      });

      // 5) Base 1 linha por lead
      const base: ClienteBase[] = [];
      for (const l of leads || []) {
        const lid = String(l.id);
        const arr = (vendasByLead.get(lid) || []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

        const hasCpfAny = arr.some((x) => (x.cpf && x.cpf.length > 0) || x.hasCpfCnpj);
        if (!hasCpfAny) continue;

        const latest = arr[0];
        const vendedorAuth = latest?.vendedor_id || null;
        const vendedorNome = vendedorAuth ? usersByAuth.get(vendedorAuth)?.nome || "—" : "—";

        const confirmed = confirmedByLead.get(lid) || null;

        base.push({
          id: lid,
          lead_id: lid,
          nome: l.nome || "(Sem nome)",
          telefone: l.telefone || latest?.telefone || null,
          email: l.email || latest?.email || null,
          data_nascimento: latest?.nasc || null,
          observacoes: latest?.obs || null,
          cpf_dig: latest?.cpf || null,
          vendas_ids: arr.map((x) => x.id),
          vendedor_auth_user_id: vendedorAuth,
          vendedor_nome: vendedorNome,
          grupo: latest?.grupo || null,
          cliente_row_id: confirmed?.id || null,
          foto_url: confirmed?.foto_url || null,
        });
      }

      const confirmed = base.filter((x) => !!x.cliente_row_id);
      const pending = base.filter((x) => !x.cliente_row_id);

      confirmed.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      pending.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

      const from = (target - 1) * PAGE;
      const to = from + PAGE;

      setClientes(confirmed.slice(from, to));
      setTotal(confirmed.length);
      setPage(target);

      setNovos(pending);
    } catch (e: any) {
      alert(e.message || "Erro ao listar clientes.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setNome("");
    setChamadoComo("");
    setCpf("");
    setBirth("");
    setTelefone("");
    setEmail("");
    setExtra(emptyExtra());
    setLegacyObs("");
    setFotoFile(null);
  }

  async function openOverlay(mode: "novo" | "edit" | "view", c: ClienteBase) {
    setOverlayMode(mode);
    setActive(c);
    resetForm();

    setNome(c.nome || "");
    setCpf(c.cpf_dig || "");
    setBirth(c.data_nascimento || "");
    setTelefone(c.telefone ? maskPhone(c.telefone) : "");
    setEmail(c.email || "");

    // Foto já vem do mapa (clientes.observacoes) quando confirmado.
    // Para "novo", provavelmente não terá foto ainda.
    setExtra((s) => ({ ...s, foto_url: c.foto_url || "" }));

    if (mode !== "novo") {
      try {
        setLoading(true);
        const { data: row, error } = await supabase
          .from("clientes")
          .select("id,lead_id,nome,cpf,telefone,email,data_nascimento,observacoes,endereco_cep,logradouro,numero,bairro,cidade,uf")
          .eq("lead_id", c.lead_id)
          .maybeSingle();

        if (error) throw error;

        if (row) {
          setNome(row.nome || c.nome || "");
          setCpf(row.cpf || c.cpf_dig || "");
          setBirth(row.data_nascimento || c.data_nascimento || "");
          setTelefone(row.telefone ? maskPhone(row.telefone) : c.telefone ? maskPhone(c.telefone) : "");
          setEmail(row.email || c.email || "");

          const { extra: parsedExtra, legacyText } = safeParseExtraFromObservacoes(row.observacoes);
          setLegacyObs(legacyText || "");

          const baseExtra = emptyExtra();
          const merged = parsedExtra ? { ...baseExtra, ...parsedExtra } : baseExtra;

          merged.endereco_cep = row.endereco_cep || merged.endereco_cep;
          merged.logradouro = row.logradouro || merged.logradouro;
          merged.numero = row.numero || merged.numero;
          merged.bairro = row.bairro || merged.bairro;
          merged.cidade = row.cidade || merged.cidade;
          merged.uf = row.uf || merged.uf;

          setExtra(merged);
          setChamadoComo(merged.chamado_como || "");
        }
      } catch (e: any) {
        alert(e?.message || "Não foi possível carregar o cadastro do cliente.");
      } finally {
        setLoading(false);
      }
    }

    setOverlayOpen(true);
  }

  function closeOverlay() {
    setOverlayOpen(false);
    setActive(null);
    setSaving(false);
    setCepLoading(false);
  }

  const readOnly = overlayMode === "view";

  async function buscarCep() {
    try {
      const cep = onlyDigits(extra.endereco_cep);
      if (cep.length !== 8) return alert("Digite um CEP válido (8 dígitos).");
      setCepLoading(true);
      const addr = await fetchCep(cep);
      setExtra((s) => ({
        ...s,
        logradouro: addr.logradouro,
        bairro: addr.bairro,
        cidade: addr.cidade,
        uf: addr.uf,
      }));
    } catch (e: any) {
      alert(e?.message || "Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  async function uploadFotoIfAny(): Promise<string> {
    if (!fotoFile) return extra.foto_url || "";
    try {
      const ext = (fotoFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `clientes/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET_CLIENTES).upload(path, fotoFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (upErr) {
        // se bucket/policy ainda não estiver ok, não trava o fluxo:
        console.error("Upload error:", upErr);
        return extra.foto_url || "";
      }

      const { data } = supabase.storage.from(STORAGE_BUCKET_CLIENTES).getPublicUrl(path);
      return data?.publicUrl || extra.foto_url || "";
    } catch (e) {
      console.error("Upload exception:", e);
      return extra.foto_url || "";
    }
  }

  function validateBeforeSave() {
    if (!active) return "Cliente inválido.";
    if (!onlyDigits(cpf)) return "Informe o CPF/CNPJ.";
    if (!nome.trim()) return "Nome é obrigatório.";
    if (!telefone.trim()) return "Telefone é obrigatório.";

    if (!extra.tipo) return "Selecione o tipo (PF/PJ).";
    if (!extra.perfil) return "Selecione o perfil do cliente.";

    if (extra.tipo === "PF") {
      if (!extra.segmento_pf) return "Selecione o segmento (PF).";
    } else {
      if (!extra.segmento_pj.trim()) return "Informe o segmento de atuação (PJ).";
    }
    return "";
  }

  async function confirmOrSave() {
    const err = validateBeforeSave();
    if (err) return alert(err);
    if (!active) return;

    try {
      setSaving(true);

      const latestVendaId = active.vendas_ids?.[0];

      const fotoUrl = await uploadFotoIfAny();
      const extraToSave: CadastroExtra = { ...extra, foto_url: fotoUrl, chamado_como: chamadoComo || "" };

      const { error: eLead } = await supabase
        .from("leads")
        .update({
          nome: nome.trim() || active.nome,
          telefone: onlyDigits(telefone) || null,
          email: email.trim() || null,
        })
        .eq("id", active.lead_id);
      if (eLead) throw eLead;

      if (latestVendaId) {
        const { error: eVenda } = await supabase
          .from("vendas")
          .update({
            nascimento: birth || null,
            descricao: legacyObs?.trim() ? legacyObs.trim() : null,
            cpf: onlyDigits(cpf) || null,
            email: email.trim() || null,
            telefone: onlyDigits(telefone) || null,
          })
          .eq("id", latestVendaId);
        if (eVenda) throw eVenda;
      }

      const obsSerialized = serializeExtraToObservacoes(extraToSave, legacyObs?.trim() || "");

      const payload: any = {
        nome: nome.trim() || active.nome,
        cpf: onlyDigits(cpf) || null,
        telefone: onlyDigits(telefone) || null,
        email: email.trim() || null,
        data_nascimento: birth || null,
        lead_id: active.lead_id,

        endereco_cep: onlyDigits(extraToSave.endereco_cep) || null,
        logradouro: extraToSave.logradouro?.trim() || null,
        numero: extraToSave.numero?.trim() || null,
        bairro: extraToSave.bairro?.trim() || null,
        cidade: extraToSave.cidade?.trim() || null,
        uf: extraToSave.uf?.trim() || null,

        observacoes: obsSerialized,
      };

      const { data: existing, error: eFind } = await supabase.from("clientes").select("id").eq("lead_id", active.lead_id).maybeSingle();
      if (eFind) throw eFind;

      if (existing?.id) {
        const { error: eUp } = await supabase.from("clientes").update(payload).eq("id", existing.id);
        if (eUp) throw eUp;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const createdBy = auth?.user?.id || null;
        if (!createdBy) throw new Error("Não foi possível identificar o usuário logado (created_by).");

        const { error: eIns } = await supabase.from("clientes").insert({ ...payload, created_by: createdBy } as any);
        if (eIns) throw eIns;
      }

      closeOverlay();
      await load(page, debounced);
      alert(overlayMode === "novo" ? "Cliente confirmado!" : "Cliente atualizado!");
    } catch (e: any) {
      alert(e?.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  function onDownloadProfile(c: ClienteBase) {
    // placeholder: no futuro será o PDF do Perfil do Cliente
    alert(`Em breve: Download do Perfil do Cliente\n\nCliente: ${c.nome}`);
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE)), [total]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="cadastro" className="w-full">
        {/* Tabs superiores */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList className="segTabs">
            <TabsTrigger value="cadastro" className="segTrigger">
              Cadastro
            </TabsTrigger>
            <TabsTrigger value="demografia" className="segTrigger">
              Demografia
            </TabsTrigger>
          </TabsList>

          <div className="text-xs text-slate-500">
            {debounced ? (
              <>
                Busca ativa: <b className="text-slate-700">{debounced}</b>
              </>
            ) : (
              " "
            )}
          </div>
        </div>

        {/* CADASTRO */}
        <TabsContent value="cadastro" className="mt-4 space-y-4">
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
              <div className="rounded-xl border overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Cliente</th>
                      <th className="p-2 text-left">Telefone</th>
                      <th className="p-2 text-left">Vendedor</th>
                      <th className="p-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {novos.map((c, idx) => {
                      const phone = c.telefone ? maskPhone(c.telefone) : "—";
                      return (
                        <tr key={c.lead_id} className={idx % 2 ? "bg-slate-50/60" : "bg-white"}>
                          <td className="p-2">
                            <div className="flex items-center gap-3">
                              <AvatarCircle url={c.foto_url} name={c.nome} size={40} />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{c.nome}</div>
                                <div className="text-xs text-slate-500">CPF: {c.cpf_dig || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2">{phone}</td>
                          <td className="p-2">{c.vendedor_nome || "—"}</td>
                          <td className="p-2 text-right">
                            <button className="btn-primary" onClick={() => openOverlay("novo", c)} disabled={loading}>
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

          {/* LISTA */}
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="m-0 font-semibold">Lista de Clientes</h3>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* ✅ BUSCA MELHORADA (ícone fora do campo) */}
                <div className="searchWrap">
                  <span className="searchIcon">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    className="searchInput"
                    placeholder="Buscar por nome, CPF/CNPJ ou grupo…"
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
                    const phone = c.telefone ? maskPhone(c.telefone) : "";
                    const wa = c.telefone ? `https://wa.me/55${onlyDigits(c.telefone)}` : "";
                    const agendaHref = `/agenda?lead_id=${encodeURIComponent(c.lead_id)}${
                      c.cliente_row_id ? `&cliente_id=${encodeURIComponent(c.cliente_row_id)}` : ""
                    }`;

                    return (
                      <tr key={c.id} className={i % 2 ? "bg-slate-50/60" : "bg-white"}>
                        <td className="p-2">
                          <div className="flex items-center gap-3">
                            <AvatarCircle url={c.foto_url} name={c.nome} size={38} />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{c.nome}</div>
                              <div className="text-xs text-slate-500">CPF: {c.cpf_dig || "—"}</div>
                            </div>
                          </div>
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

                        <td className="p-2">{c.email || "—"}</td>
                        <td className="p-2">{formatBRDate(c.data_nascimento)}</td>
                        <td className="p-2">{c.vendedor_nome || "—"}</td>

                        <td className="p-2">
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button className="icon-btn" title="Editar" onClick={() => openOverlay("edit", c)} disabled={loading}>
                              <Pencil className="h-4 w-4" />
                            </button>

                            <button className="icon-btn" title="Visualizar" onClick={() => openOverlay("view", c)} disabled={loading}>
                              <Eye className="h-4 w-4" />
                            </button>

                            <a className="icon-btn" title="+ Evento na Agenda" href={agendaHref}>
                              <CalendarPlus className="h-4 w-4" />
                            </a>

                            {/* ✅ Novo: Download (placeholder do Perfil do Cliente) */}
                            <button className="btn btn-download" title="Download" onClick={() => onDownloadProfile(c)} disabled={loading}>
                              <Download className="h-4 w-4" />
                              <span>Download</span>
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

          {/* OVERLAY */}
          {overlayOpen && active && (
            <Overlay
              title={
                overlayMode === "novo"
                  ? "Preencher Cadastro do Cliente"
                  : overlayMode === "edit"
                  ? "Editar Cadastro do Cliente"
                  : "Visualizar Cadastro do Cliente"
              }
              onClose={closeOverlay}
            >
              {/* ✅ Header limpo + foto ao lado do nome (sem Lead/Venda/Grupo) */}
              <div className="rounded-xl border p-4 mb-4 bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarCircle url={extra.foto_url || active.foto_url} name={nome || active.nome} size={48} />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{nome || active.nome}</div>
                      <div className="text-xs text-slate-600">
                        Vendedor: <b>{active.vendedor_nome || "—"}</b>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 text-right">
                    CPF/CNPJ: <b>{onlyDigits(cpf) || "—"}</b>
                    <div>
                      Nasc./Const.: <b>{birth ? formatBRDate(birth) : "—"}</b>
                    </div>
                  </div>
                </div>
              </div>

              {/* GRID */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Identidade */}
                <div className="rounded-xl border p-4 xl:col-span-6">
                  <h4 className="font-semibold mb-3">Identidade</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="label">Vendedor (auto)</div>
                      <input className="input" value={active.vendedor_nome || "—"} disabled />
                      <div className="text-xs text-slate-500 mt-1">Capturado da venda mais recente (vendas.vendedor_id).</div>
                    </div>

                    <div>
                      <div className="label">Perfil do Cliente</div>
                      <select
                        className="input"
                        value={extra.perfil}
                        onChange={(e) => setExtra((s) => ({ ...s, perfil: e.target.value as PerfilCliente }))}
                        disabled={readOnly}
                      >
                        <option>PF Geral</option>
                        <option>PF Agro</option>
                        <option>PJ</option>
                      </select>
                    </div>

                    <div>
                      <div className="label">Tipo</div>
                      <select
                        className="input"
                        value={extra.tipo}
                        onChange={(e) =>
                          setExtra((s) => ({
                            ...s,
                            tipo: e.target.value as TipoPessoa,
                            segmento_pf: e.target.value === "PF" ? s.segmento_pf : "",
                            segmento_pj: e.target.value === "PJ" ? s.segmento_pj : "",
                          }))
                        }
                        disabled={readOnly}
                      >
                        <option value="PF">PF</option>
                        <option value="PJ">PJ</option>
                      </select>
                    </div>

                    <div>
                      <div className="label">Segmento</div>
                      {extra.tipo === "PF" ? (
                        <select
                          className="input"
                          value={extra.segmento_pf}
                          onChange={(e) => setExtra((s) => ({ ...s, segmento_pf: e.target.value as any }))}
                          disabled={readOnly}
                        >
                          <option value="">Selecione…</option>
                          {SEGMENTOS_PF.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input"
                          placeholder="Segmento de atuação principal (PJ)"
                          value={extra.segmento_pj}
                          onChange={(e) => setExtra((s) => ({ ...s, segmento_pj: e.target.value }))}
                          disabled={readOnly}
                        />
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <div className="label">Nome</div>
                      <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} disabled={readOnly} />
                    </div>

                    <div className="md:col-span-2">
                      <div className="label">Como você gostaria de ser chamado?</div>
                      <input
                        className="input"
                        placeholder="Nome, apelido, diminutivo, nome social..."
                        value={chamadoComo}
                        onChange={(e) => setChamadoComo(e.target.value)}
                        disabled={readOnly}
                      />
                    </div>

                    <div>
                      <div className="label">CPF/CNPJ</div>
                      <input className="input" value={onlyDigits(cpf)} onChange={(e) => setCpf(onlyDigits(e.target.value))} disabled={readOnly} />
                    </div>

                    <div>
                      <div className="label">Data Nascimento/Constituição</div>
                      <input className="input" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} disabled={readOnly} />
                    </div>

                    <div>
                      <div className="label">Telefone</div>
                      <input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={readOnly} />
                    </div>

                    <div>
                      <div className="label">E-mail</div>
                      <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly} />
                    </div>
                  </div>
                </div>

                {/* Contato & Endereço */}
                <div className="rounded-xl border p-4 xl:col-span-6">
                  <h4 className="font-semibold mb-3">Contato & Endereço</h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-1">
                      <div className="label">CEP</div>
                      <div className="flex gap-2">
                        <input
                          className="input"
                          placeholder="Somente números"
                          value={extra.endereco_cep}
                          onChange={(e) => setExtra((s) => ({ ...s, endereco_cep: onlyDigits(e.target.value).slice(0, 8) }))}
                          disabled={readOnly}
                        />
                        <button className="btn" type="button" onClick={buscarCep} disabled={readOnly || cepLoading}>
                          {cepLoading ? "Buscando..." : "Buscar"}
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="label">Número</div>
                      <input
                        className="input"
                        value={extra.numero}
                        onChange={(e) => setExtra((s) => ({ ...s, numero: clamp(e.target.value, 20) }))}
                        disabled={readOnly}
                      />
                    </div>

                    <div className="md:col-span-3">
                      <div className="label">Logradouro</div>
                      <input className="input" value={extra.logradouro} onChange={(e) => setExtra((s) => ({ ...s, logradouro: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div>
                      <div className="label">Bairro</div>
                      <input className="input" value={extra.bairro} onChange={(e) => setExtra((s) => ({ ...s, bairro: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div className="md:col-span-2">
                      <div className="label">Cidade/UF</div>
                      <div className="grid grid-cols-3 gap-2">
                        <input className="input col-span-2" value={extra.cidade} onChange={(e) => setExtra((s) => ({ ...s, cidade: e.target.value }))} disabled={readOnly} />
                        <input className="input" value={extra.uf} onChange={(e) => setExtra((s) => ({ ...s, uf: e.target.value.toUpperCase().slice(0, 2) }))} disabled={readOnly} />
                      </div>
                    </div>

                    <div>
                      <div className="label">Contato de emergência (Nome)</div>
                      <input className="input" value={extra.emergencia_nome} onChange={(e) => setExtra((s) => ({ ...s, emergencia_nome: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div className="md:col-span-2">
                      <div className="label">Contato de emergência (Telefone)</div>
                      <input className="input" value={extra.emergencia_telefone} onChange={(e) => setExtra((s) => ({ ...s, emergencia_telefone: e.target.value }))} disabled={readOnly} />
                    </div>

                    <div className="md:col-span-1">
                      <div className="label">Renda/Faturamento</div>
                      <MoneyInput value={extra.renda_faturamento} onChange={(v) => setExtra((s) => ({ ...s, renda_faturamento: v }))} disabled={readOnly} />
                      <div className="text-xs text-slate-500 mt-1">Salva como texto (humano) no cadastro.</div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="label">Foto (anexar)</div>
                      <input className="input" type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] || null)} disabled={readOnly} />
                      <div className="text-xs text-slate-500 mt-1">
                        Upload direto no bucket <b>{STORAGE_BUCKET_CLIENTES}</b>. Se não subir, você pode colar uma URL abaixo.
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <div className="label">Foto (URL)</div>
                      <input className="input" placeholder="https://..." value={extra.foto_url} onChange={(e) => setExtra((s) => ({ ...s, foto_url: e.target.value }))} disabled={readOnly} />
                    </div>
                  </div>
                </div>

                {/* Família */}
                <div className="rounded-xl border p-4 xl:col-span-5">
                  <h4 className="font-semibold mb-3">Família</h4>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-sm">Possui pai e mãe vivos?</div>
                      <PillToggle value={extra.pais_vivos} onChange={(v) => setExtra((s) => ({ ...s, pais_vivos: v }))} disabled={readOnly} />
                    </div>

                    {extra.pais_vivos === "sim" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="label">Pai (Nome)</div>
                          <input className="input" value={extra.pai_nome} onChange={(e) => setExtra((s) => ({ ...s, pai_nome: e.target.value }))} disabled={readOnly} />
                        </div>
                        <div>
                          <div className="label">Pai (Nascimento)</div>
                          <input className="input" type="date" value={extra.pai_nasc} onChange={(e) => setExtra((s) => ({ ...s, pai_nasc: e.target.value }))} disabled={readOnly} />
                        </div>

                        <div>
                          <div className="label">Mãe (Nome)</div>
                          <input className="input" value={extra.mae_nome} onChange={(e) => setExtra((s) => ({ ...s, mae_nome: e.target.value }))} disabled={readOnly} />
                        </div>
                        <div>
                          <div className="label">Mãe (Nascimento)</div>
                          <input className="input" type="date" value={extra.mae_nasc} onChange={(e) => setExtra((s) => ({ ...s, mae_nasc: e.target.value }))} disabled={readOnly} />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-sm">Possui filhos?</div>
                      <PillToggle value={extra.possui_filhos} onChange={(v) => setExtra((s) => ({ ...s, possui_filhos: v }))} disabled={readOnly} />
                    </div>

                    {extra.possui_filhos === "sim" && (
                      <div className="space-y-2">
                        {extra.filhos.map((f, idx) => (
                          <div key={idx} className="rounded-xl border p-3">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                              <div className="md:col-span-6">
                                <div className="label">Nome</div>
                                <input
                                  className="input"
                                  value={f.nome}
                                  onChange={(e) =>
                                    setExtra((s) => {
                                      const filhos = [...s.filhos];
                                      filhos[idx] = { ...filhos[idx], nome: e.target.value };
                                      return { ...s, filhos };
                                    })
                                  }
                                  disabled={readOnly}
                                />
                              </div>
                              <div className="md:col-span-4">
                                <div className="label">Nascimento</div>
                                <input
                                  className="input"
                                  type="date"
                                  value={f.nascimento}
                                  onChange={(e) =>
                                    setExtra((s) => {
                                      const filhos = [...s.filhos];
                                      filhos[idx] = { ...filhos[idx], nascimento: e.target.value };
                                      return { ...s, filhos };
                                    })
                                  }
                                  disabled={readOnly}
                                />
                              </div>
                              <div className="md:col-span-2">
                                <div className="label">Sexo</div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className={`pill ${f.sexo === "F" ? "pill-on" : ""}`}
                                    onClick={() =>
                                      setExtra((s) => {
                                        const filhos = [...s.filhos];
                                        filhos[idx] = { ...filhos[idx], sexo: "F" };
                                        return { ...s, filhos };
                                      })
                                    }
                                    disabled={readOnly}
                                  >
                                    F
                                  </button>
                                  <button
                                    type="button"
                                    className={`pill ${f.sexo === "M" ? "pill-on" : ""}`}
                                    onClick={() =>
                                      setExtra((s) => {
                                        const filhos = [...s.filhos];
                                        filhos[idx] = { ...filhos[idx], sexo: "M" };
                                        return { ...s, filhos };
                                      })
                                    }
                                    disabled={readOnly}
                                  >
                                    M
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        {!readOnly && (
                          <button
                            className="btn inline-flex items-center gap-2"
                            type="button"
                            onClick={() =>
                              setExtra((s) => ({
                                ...s,
                                filhos: [...(s.filhos || []), { nome: "", nascimento: "", sexo: "" }],
                              }))
                            }
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar filho
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Autorizações & Feedback */}
                <div className="rounded-xl border p-4 xl:col-span-7">
                  <h4 className="font-semibold mb-3">Autorizações & Feedback</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border p-3">
                      <div className="font-semibold text-sm mb-2">Autorizações</div>

                      <div className="flex items-center justify-between gap-3 py-2">
                        <div className="text-sm">Autoriza publicar quando contemplar?</div>
                        <PillToggle value={extra.autoriza_publicar} onChange={(v) => setExtra((s) => ({ ...s, autoriza_publicar: v }))} disabled={readOnly} />
                      </div>

                      <div className="flex items-center justify-between gap-3 py-2">
                        <div className="text-sm">Autoriza usar nome/foto em homenagens?</div>
                        <PillToggle value={extra.autoriza_homenagem} onChange={(v) => setExtra((s) => ({ ...s, autoriza_homenagem: v }))} disabled={readOnly} />
                      </div>
                    </div>

                    <div className="rounded-xl border p-3">
                      <div className="font-semibold text-sm mb-2">Preferências de Conteúdo</div>

                      <div className="text-xs text-slate-600 mb-2">Que tipo de conteúdo você mais gosta de receber? (marque mais de um)</div>

                      <div className="flex flex-wrap gap-2">
                        {CONTEUDOS.map((k) => {
                          const on = extra.conteudos.includes(k);
                          return (
                            <button
                              key={k}
                              type="button"
                              className={`pill ${on ? "pill-on" : ""}`}
                              onClick={() =>
                                setExtra((s) => ({
                                  ...s,
                                  conteudos: on ? s.conteudos.filter((x) => x !== k) : [...s.conteudos, k],
                                }))
                              }
                              disabled={readOnly}
                            >
                              {k}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-slate-600 mb-2">Quer receber conteúdos educativos ou prefere só ofertas pontuais?</div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={`pill ${extra.prefere_educativo === "educativo" ? "pill-on" : ""}`}
                            onClick={() => setExtra((s) => ({ ...s, prefere_educativo: "educativo" }))}
                            disabled={readOnly}
                          >
                            Educativos
                          </button>
                          <button
                            type="button"
                            className={`pill ${extra.prefere_educativo === "ofertas" ? "pill-on" : ""}`}
                            onClick={() => setExtra((s) => ({ ...s, prefere_educativo: "ofertas" }))}
                            disabled={readOnly}
                          >
                            Ofertas pontuais
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-slate-600 mb-2">Como nos conheceu? (1 opção)</div>
                        <select
                          className="input"
                          value={extra.como_conheceu}
                          onChange={(e) => setExtra((s) => ({ ...s, como_conheceu: e.target.value as any }))}
                          disabled={readOnly}
                        >
                          <option value="">Selecione…</option>
                          {COMO_CONHECEU.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="md:col-span-2 rounded-xl border p-3">
                      <div className="font-semibold text-sm mb-2">Feedback (percepção sobre Consulmax e vendedor)</div>
                      <textarea className="input" rows={4} value={extra.feedback} onChange={(e) => setExtra((s) => ({ ...s, feedback: e.target.value }))} disabled={readOnly} />

                      <div className="mt-3">
                        <div className="font-semibold text-sm mb-2">Obs. internas</div>
                        <textarea
                          className="input"
                          rows={3}
                          value={extra.obs_internas || legacyObs}
                          onChange={(e) => {
                            setExtra((s) => ({ ...s, obs_internas: e.target.value }));
                            setLegacyObs(e.target.value);
                          }}
                          disabled={readOnly}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 flex items-center justify-end gap-2">
                <button className="btn" onClick={closeOverlay} disabled={saving}>
                  Fechar
                </button>

                {!readOnly && (
                  <button className="btn-primary inline-flex items-center gap-2" onClick={confirmOrSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {overlayMode === "novo" ? "Confirmar" : "Salvar alterações"}
                  </button>
                )}
              </div>
            </Overlay>
          )}

          <style>{`
            .input{padding:11px 12px;border-radius:14px;border:1px solid #e5e7eb;outline:none;width:100%}
            .btn{padding:9px 13px;border-radius:12px;background:#f1f5f9;border:1px solid #e2e8f0;font-weight:700}
            .btn-primary{padding:11px 16px;border-radius:14px;background:#A11C27;color:#fff;font-weight:800}
            .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px}
            .icon-btn:hover{background:#eef2ff}
            .label{display:block;font-size:12px;color:#475569;margin-bottom:7px;font-weight:800}
            .pill{padding:7px 11px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;font-weight:800;font-size:12px}
            .pill-on{background:#111827;color:#fff;border-color:#111827}

            /* ✅ Busca premium */
            .searchWrap{
              display:flex;align-items:center;gap:10px;
              border:1px solid #e2e8f0;
              background:#f8fafc;
              border-radius:999px;
              padding:10px 14px;
              width:min(420px,72vw);
              box-shadow: 0 1px 0 rgba(0,0,0,.02);
            }
            .searchIcon{opacity:.65;display:flex;align-items:center;justify-content:center}
            .searchInput{
              border:none;outline:none;background:transparent;width:100%;
              font-weight:600;
            }
            .searchInput::placeholder{color:#94a3b8;font-weight:600}
            .searchWrap:focus-within{
              border-color: rgba(161,28,39,.35);
              box-shadow: 0 0 0 4px rgba(161,28,39,.08);
              background:#fff;
            }

            /* Tabs pill (shadcn) */
            .segTabs{
              display:inline-flex;
              background:#f1f5f9;
              border:1px solid #e2e8f0;
              border-radius:999px;
              padding:4px;
              height:auto;
              gap:4px;
            }
            .segTrigger{
              border-radius:999px !important;
              padding:8px 14px !important;
              font-weight:900 !important;
              font-size:12px !important;
            }

            /* Botão download mais "texto" */
            .btn-download{
              display:inline-flex;
              align-items:center;
              gap:8px;
              padding:9px 12px;
              border-radius:12px;
              font-weight:900;
              font-size:12px;
              background:#f8fafc;
            }
            .btn-download:hover{
              background:#eef2ff;
            }
          `}</style>
        </TabsContent>

        {/* DEMOGRAFIA (placeholder) */}
        <TabsContent value="demografia" className="mt-4">
          <div className="rounded-2xl bg-white p-6 shadow">
            <div className="font-semibold text-lg">Demografia</div>
            <div className="text-sm text-slate-500 mt-1">
              Em breve: aqui vamos exibir os dados demográficos da carteira de clientes.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
