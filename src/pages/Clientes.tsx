// src/pages/Clientes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Pencil, CalendarPlus, Eye, Send, Check, Loader2, X, Plus, Search, Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  // para busca por grupo (da venda mais recente)
  grupo?: string | null;

  cliente_row_id?: string | null; // clientes.id

  // extra (foto/sexo/etc) vindo do observacoes serializado em clientes.observacoes
  foto_url?: string | null;
  sexo?: Sexo | "";
  tipo?: TipoPessoa | null;
  perfil?: PerfilCliente | null;
  segmento_pf?: SegmentoPF | "";
  segmento_pj?: string | null;

  uf?: string | null;
  cidade?: string | null;
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

type Sexo = "M" | "F" | "O";

type Filho = { nome: string; nascimento: string; sexo: "F" | "M" | "" };

type CadastroExtra = {
  tipo: TipoPessoa;
  segmento_pf: SegmentoPF | "";
  segmento_pj: string;
  perfil: PerfilCliente;

  // ✅ novo
  sexo: Sexo | "";

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
const COMO_CONHECEU: ComoConheceu[] = [
  "Instagram",
  "Google",
  "Indicação",
  "Anúncio",
  "Relacionamento com o Vendedor",
  "Outro",
];

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

function calcAge(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

function initials(name: string) {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "—";
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

const emptyExtra = (): CadastroExtra => ({
  tipo: "PF",
  segmento_pf: "",
  segmento_pj: "",
  perfil: "PF Geral",

  sexo: "",

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

/** ✅ Tile Map Brasil (Nível 1 rápido e lindo) */
type UF =
  | "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO" | "MA" | "MT" | "MS"
  | "MG" | "PA" | "PB" | "PR" | "PE" | "PI" | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC"
  | "SP" | "SE" | "TO";

const BR_TILE: Array<{ uf: UF; x: number; y: number }> = [
  { uf: "RR", x: 3, y: 0 }, { uf: "AP", x: 6, y: 1 },
  { uf: "AM", x: 2, y: 1 }, { uf: "PA", x: 5, y: 2 }, { uf: "MA", x: 6, y: 3 },
  { uf: "AC", x: 0, y: 3 }, { uf: "RO", x: 1, y: 3 }, { uf: "TO", x: 5, y: 3 },
  { uf: "PI", x: 7, y: 4 }, { uf: "CE", x: 8, y: 4 }, { uf: "RN", x: 9, y: 4 }, { uf: "PB", x: 9, y: 5 },
  { uf: "PE", x: 8, y: 5 }, { uf: "AL", x: 9, y: 6 }, { uf: "SE", x: 8, y: 6 }, { uf: "BA", x: 7, y: 6 },
  { uf: "MT", x: 3, y: 4 }, { uf: "GO", x: 4, y: 5 }, { uf: "DF", x: 5, y: 5 }, { uf: "MS", x: 3, y: 6 },
  { uf: "MG", x: 6, y: 7 }, { uf: "ES", x: 7, y: 7 }, { uf: "RJ", x: 7, y: 8 }, { uf: "SP", x: 6, y: 8 },
  { uf: "PR", x: 6, y: 9 }, { uf: "SC", x: 6, y: 10 }, { uf: "RS", x: 6, y: 11 },
];

function BrazilTileMap({
  activeUFs,
  selectedUF,
  onSelectUF,
}: {
  activeUFs: Set<string>;
  selectedUF: string;
  onSelectUF: (uf: string) => void;
}) {
  const cols = 11;
  const rows = 12;
  const size = 34;
  const gap = 6;
  const w = cols * (size + gap) + gap;
  const h = rows * (size + gap) + gap;

  return (
    <div className="rounded-2xl border p-4 bg-white">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="font-semibold">Mapa do Brasil (UF)</div>
        <div className="text-xs text-slate-600">
          Ativos em rubi • clique para filtrar {selectedUF ? `• selecionado: ${selectedUF}` : ""}
        </div>
      </div>

      <div className="overflow-auto">
        <svg width={w} height={h} className="block">
          <rect x={0} y={0} width={w} height={h} rx={16} fill="transparent" />
          {BR_TILE.map((t) => {
            const x = gap + t.x * (size + gap);
            const y = gap + t.y * (size + gap);
            const isOn = activeUFs.has(t.uf);
            const isSel = selectedUF === t.uf;

            const fill = isOn ? "#A11C27" : "#F1F5F9";
            const stroke = isSel ? "#111827" : "#E2E8F0";
            const text = isOn ? "#FFFFFF" : "#334155";

            return (
              <g key={t.uf} onClick={() => onSelectUF(t.uf)} style={{ cursor: "pointer" }}>
                <rect x={x} y={y} width={size} height={size} rx={12} fill={fill} stroke={stroke} strokeWidth={isSel ? 2 : 1} />
                <text x={x + size / 2} y={y + size / 2 + 5} textAnchor="middle" fontSize="12" fontWeight="800" fill={text}>
                  {t.uf}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={() => onSelectUF("")}>
          Limpar UF
        </button>
        <div className="text-xs text-slate-600 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#A11C27" }} />
          UF com clientes ativos
        </div>
      </div>
    </div>
  );
}

function parseMoneyToNumber(s: string) {
  const raw = (s || "").trim();
  if (!raw) return null;

  // pega primeiro número provável: "R$ 12.000,50", "12000", "12.000", "12,000", "12 mil"
  const mil = /(\d+)\s*mil/i.exec(raw);
  if (mil?.[1]) return Number(mil[1]) * 1000;

  const m = raw.match(/(\d[\d\.\,]*)/);
  if (!m?.[1]) return null;

  const candidate = m[1];
  // Se tem vírgula e ponto, assume BR: 12.345,67
  if (candidate.includes(",") && candidate.includes(".")) {
    const n = candidate.replace(/\./g, "").replace(",", ".");
    const val = Number(n);
    return isFinite(val) ? val : null;
  }
  // Se só tem vírgula: 12345,67
  if (candidate.includes(",") && !candidate.includes(".")) {
    const val = Number(candidate.replace(",", "."));
    return isFinite(val) ? val : null;
  }
  // Só ponto: 12345.67 ou 12.345 (ambíguo) — trata como decimal se tiver 2 casas no fim
  const val = Number(candidate.replace(/\./g, ""));
  return isFinite(val) ? val : null;
}

export default function ClientesPage() {
  const PAGE = 10;

  const [tab, setTab] = useState<"cadastro" | "demografia">("cadastro");

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

  // Demografia
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoUF, setDemoUF] = useState<string>("");
  const [demo, setDemo] = useState<{
    activeCount: number;
    byUF: Record<string, number>;
    byCity: Record<string, number>;
    ageList: number[];
    sexoCount: Record<string, number>;
    tipoCount: Record<string, number>;
    perfilCount: Record<string, number>;
    segPFCount: Record<string, number>;
    segPJCount: Record<string, number>;
    rendaList: number[];
    origemCount: Record<string, number>;
    produtoCount: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (tab !== "cadastro") return;
    load(1, debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, tab]);

  useEffect(() => {
    if (tab !== "demografia") return;
    loadDemografia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
        const { data: uRows, error: eU } = await supabase
          .from("users")
          .select("auth_user_id,nome")
          .in("auth_user_id", vendorList);
        if (eU) throw eU;
        (uRows || []).forEach((u: any) => usersByAuth.set(String(u.auth_user_id), { nome: u.nome || "—" }));
      }

      // 4) Clientes confirmados + observacoes/endereço (para foto/sexo/UF/cidade)
      const { data: cliRows, error: eCli } = await supabase
        .from("clientes")
        .select("id,lead_id,observacoes,uf,cidade")
        .in("lead_id", leadIds);
      if (eCli) throw eCli;

      const confirmedByLead = new Map<string, { id: string; extra: CadastroExtra | null; uf?: string | null; cidade?: string | null }>();
      (cliRows || []).forEach((c: any) => {
        const lid = c.lead_id ? String(c.lead_id) : "";
        if (!lid) return;
        const { extra } = safeParseExtraFromObservacoes(c.observacoes);
        confirmedByLead.set(lid, { id: String(c.id), extra: extra || null, uf: c.uf ?? null, cidade: c.cidade ?? null });
      });

      // 5) Base 1 linha por lead
      const base: ClienteBase[] = [];
      for (const l of leads || []) {
        const lid = String(l.id);
        const arr = (vendasByLead.get(lid) || []).sort((a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "")
        );

        const hasCpfAny = arr.some((x) => (x.cpf && x.cpf.length > 0) || x.hasCpfCnpj);
        if (!hasCpfAny) continue;

        const latest = arr[0];
        const vendedorAuth = latest?.vendedor_id || null;
        const vendedorNome = vendedorAuth ? usersByAuth.get(vendedorAuth)?.nome || "—" : "—";

        const confirmed = confirmedByLead.get(lid) || null;
        const extraFromClient = confirmed?.extra || null;

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

          foto_url: extraFromClient?.foto_url || null,
          sexo: (extraFromClient?.sexo as any) || "",
          tipo: (extraFromClient?.tipo as any) || null,
          perfil: (extraFromClient?.perfil as any) || null,
          segmento_pf: (extraFromClient?.segmento_pf as any) || "",
          segmento_pj: extraFromClient?.segmento_pj || null,

          uf: confirmed?.uf ?? null,
          cidade: confirmed?.cidade ?? null,
        });
      }

      const confirmedList = base.filter((x) => !!x.cliente_row_id);
      const pending = base.filter((x) => !x.cliente_row_id);

      confirmedList.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      pending.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

      const from = (target - 1) * PAGE;
      const to = from + PAGE;

      setClientes(confirmedList.slice(from, to));
      setTotal(confirmedList.length);
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

    // ✅ sexo é opcional (não trava o fluxo) — se quiser obrigatório depois, eu ajusto.
    // if (!extra.sexo) return "Selecione o sexo.";

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

      const { data: existing, error: eFind } = await supabase
        .from("clientes")
        .select("id")
        .eq("lead_id", active.lead_id)
        .maybeSingle();
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE)), [total]);

  function handleDownload(c: ClienteBase) {
    // ✅ futuro: gerar PDF Perfil do Cliente
    alert(`Download do Perfil do Cliente (em breve)\n\nCliente: ${c.nome}\nLead: ${c.lead_id}`);
  }

  // ==========================
  // DEMOGRAFIA
  // ==========================
  async function loadDemografia() {
    setDemoLoading(true);
    try {
      // 1) lead_ids ativos (vendas.codigo='00')
      const { data: activeVend, error: e1 } = await supabase
        .from("vendas")
        .select("lead_id,produto")
        .eq("codigo", "00")
        .not("lead_id", "is", null)
        .range(0, 20000);
      if (e1) throw e1;

      const activeLeadIds = Array.from(new Set((activeVend || []).map((r: any) => String(r.lead_id)).filter(Boolean)));
      const produtoCount: Record<string, number> = {};
      (activeVend || []).forEach((r: any) => {
        const p = (r?.produto || "—") as string;
        produtoCount[p] = (produtoCount[p] || 0) + 1;
      });

      if (!activeLeadIds.length) {
        setDemo({
          activeCount: 0,
          byUF: {},
          byCity: {},
          ageList: [],
          sexoCount: {},
          tipoCount: {},
          perfilCount: {},
          segPFCount: {},
          segPJCount: {},
          rendaList: [],
          origemCount: {},
          produtoCount: produtoCount,
        });
        setDemoLoading(false);
        return;
      }

      // 2) clientes (dados demográficos + observacoes JSON)
      const { data: cli, error: e2 } = await supabase
        .from("clientes")
        .select("lead_id,data_nascimento,uf,cidade,observacoes")
        .in("lead_id", activeLeadIds)
        .range(0, 20000);
      if (e2) throw e2;

      const byUF: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      const ageList: number[] = [];
      const rendaList: number[] = [];
      const sexoCount: Record<string, number> = {};
      const tipoCount: Record<string, number> = {};
      const perfilCount: Record<string, number> = {};
      const segPFCount: Record<string, number> = {};
      const segPJCount: Record<string, number> = {};
      const origemCount: Record<string, number> = {};

      (cli || []).forEach((r: any) => {
        const uf = String(r.uf || "").toUpperCase().trim();
        const cidade = String(r.cidade || "").trim();

        if (uf) byUF[uf] = (byUF[uf] || 0) + 1;
        if (uf && cidade) byCity[`${uf}::${cidade}`] = (byCity[`${uf}::${cidade}`] || 0) + 1;

        const age = calcAge(r.data_nascimento);
        if (age != null) ageList.push(age);

        const { extra } = safeParseExtraFromObservacoes(r.observacoes);
        if (extra) {
          if (extra.sexo) sexoCount[extra.sexo] = (sexoCount[extra.sexo] || 0) + 1;
          if (extra.tipo) tipoCount[extra.tipo] = (tipoCount[extra.tipo] || 0) + 1;
          if (extra.perfil) perfilCount[extra.perfil] = (perfilCount[extra.perfil] || 0) + 1;

          if (extra.tipo === "PF" && extra.segmento_pf) segPFCount[extra.segmento_pf] = (segPFCount[extra.segmento_pf] || 0) + 1;
          if (extra.tipo === "PJ" && extra.segmento_pj) segPJCount[extra.segmento_pj] = (segPJCount[extra.segmento_pj] || 0) + 1;

          if (extra.como_conheceu) origemCount[extra.como_conheceu] = (origemCount[extra.como_conheceu] || 0) + 1;

          const renda = parseMoneyToNumber(extra.renda_faturamento);
          if (renda != null) rendaList.push(renda);
        }
      });

      setDemo({
        activeCount: activeLeadIds.length,
        byUF,
        byCity,
        ageList,
        sexoCount,
        tipoCount,
        perfilCount,
        segPFCount,
        segPJCount,
        rendaList,
        origemCount,
        produtoCount,
      });
    } catch (e: any) {
      alert(e?.message || "Não foi possível carregar a demografia.");
    } finally {
      setDemoLoading(false);
    }
  }

  const demoUFsActive = useMemo(() => {
    const s = new Set<string>();
    if (!demo?.byUF) return s;
    Object.keys(demo.byUF).forEach((uf) => s.add(uf));
    return s;
  }, [demo]);

  const demoStats = useMemo(() => {
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const median = (arr: number[]) => {
      if (!arr.length) return null;
      const a = [...arr].sort((x, y) => x - y);
      const mid = Math.floor(a.length / 2);
      return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
    };
    const ageAvg = demo?.ageList ? avg(demo.ageList) : null;
    const rendaAvg = demo?.rendaList ? avg(demo.rendaList) : null;

    return {
      idadeMedia: ageAvg != null ? Math.round(ageAvg) : null,
      idadeMediana: demo?.ageList ? Math.round((median(demo.ageList) || 0)) || null : null,
      rendaMedia: rendaAvg != null ? rendaAvg : null,
    };
  }, [demo]);

  const topCities = useMemo(() => {
    const entries = Object.entries(demo?.byCity || {});
    entries.sort((a, b) => b[1] - a[1]);
    const filtered = demoUF ? entries.filter(([k]) => k.startsWith(`${demoUF}::`)) : entries;
    return filtered.slice(0, 12).map(([k, v]) => {
      const [uf, cidade] = k.split("::");
      return { uf, cidade, count: v };
    });
  }, [demo, demoUF]);

  // ========= RENDER =========
  return (
    <div className="space-y-4">
      {/* ✅ Tabs topo: Cadastro / Demografia */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="cadastro" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow">
              Cadastro
            </TabsTrigger>
            <TabsTrigger value="demografia" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow">
              Demografia
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cadastro" className="mt-4 space-y-4">
            {/* NOVOS */}
            <div className="rounded-2xl bg-white p-4 border shadow-sm">
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
                        <th className="p-2 text-left">Nome</th>
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
                                <div className="avatar">
                                  {c.foto_url ? (
                                    <img src={c.foto_url} alt="Foto do cliente" className="avatar-img" />
                                  ) : (
                                    <span className="avatar-ini">{initials(c.nome)}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{c.nome}</div>
                                  <div className="text-xs text-slate-500">
                                    CPF: {c.cpf_dig || "—"}
                                  </div>
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
            <div className="rounded-2xl bg-white p-4 border shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="m-0 font-semibold">Lista de Clientes</h3>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* ✅ BUSCA */}
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
                      <th className="p-2 text-left">Nome</th>
                      <th className="p-2 text-left">Telefone</th>
                      <th className="p-2 text-left">E-mail</th>
                      <th className="p-2 text-left">Nascimento</th>
                      <th className="p-2 text-left">Vendedor</th>
                      {/* ❌ removido: Grupo */}
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
                              <div className="avatar">
                                {c.foto_url ? (
                                  <img src={c.foto_url} alt="Foto do cliente" className="avatar-img" />
                                ) : (
                                  <span className="avatar-ini">{initials(c.nome)}</span>
                                )}
                              </div>
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
                            <div className="flex items-center justify-center gap-2">
                              <button className="icon-btn" title="Editar" onClick={() => openOverlay("edit", c)} disabled={loading}>
                                <Pencil className="h-4 w-4" />
                              </button>

                              <button className="icon-btn" title="Visualizar" onClick={() => openOverlay("view", c)} disabled={loading}>
                                <Eye className="h-4 w-4" />
                              </button>

                              <a className="icon-btn" title="+ Evento na Agenda" href={agendaHref}>
                                <CalendarPlus className="h-4 w-4" />
                              </a>

                              {/* ✅ novo botão */}
                              <button className="icon-btn" title="Download" onClick={() => handleDownload(c)} disabled={loading}>
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
          </TabsContent>

          {/* ================= DEMOGRAFIA ================= */}
          <TabsContent value="demografia" className="mt-4 space-y-4">
            <div className="rounded-2xl bg-white p-4 border shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-slate-600">Demografia (Clientes Ativos)</div>
                  <div className="font-semibold">Resumo e mapa por UF</div>
                </div>
                <button className="btn" onClick={loadDemografia} disabled={demoLoading}>
                  {demoLoading ? "Atualizando..." : "Atualizar"}
                </button>
              </div>

              {demoLoading ? (
                <div className="mt-4 text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando demografia…
                </div>
              ) : !demo ? (
                <div className="mt-4 text-sm text-slate-600">Sem dados.</div>
              ) : (
                <div className="mt-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
                  {/* KPIs */}
                  <div className="xl:col-span-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border p-4">
                        <div className="text-xs text-slate-600">Clientes ativos</div>
                        <div className="text-2xl font-extrabold">{demo.activeCount}</div>
                        <div className="text-xs text-slate-500 mt-1">Base: vendas com código 00.</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="text-xs text-slate-600">Idade média</div>
                        <div className="text-2xl font-extrabold">{demoStats.idadeMedia ?? "—"}</div>
                        <div className="text-xs text-slate-500 mt-1">Mediana: {demoStats.idadeMediana ?? "—"}</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="text-xs text-slate-600">Renda média (estimada)</div>
                        <div className="text-2xl font-extrabold">
                          {demoStats.rendaMedia != null ? `R$ ${demoStats.rendaMedia.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "—"}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">Base: campo texto quando parseável.</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="text-xs text-slate-600">Filtro UF</div>
                        <div className="text-2xl font-extrabold">{demoUF || "—"}</div>
                        <div className="text-xs text-slate-500 mt-1">Clique no mapa para selecionar.</div>
                      </div>
                    </div>

                    {/* Top listas */}
                    <div className="rounded-2xl border p-4">
                      <div className="font-semibold mb-2">Top cidades {demoUF ? `(${demoUF})` : "(Brasil)"}</div>
                      <div className="space-y-2">
                        {topCities.length === 0 ? (
                          <div className="text-sm text-slate-600">Sem dados de cidade/UF preenchidos.</div>
                        ) : (
                          topCities.map((c) => (
                            <div key={`${c.uf}-${c.cidade}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-2">
                              <div className="text-sm">
                                <span className="font-semibold">{c.cidade}</span> <span className="text-slate-500">• {c.uf}</span>
                              </div>
                              <div className="text-sm font-extrabold">{c.count}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <div className="font-semibold mb-2">Persona (auto)</div>
                      <div className="text-sm text-slate-700 leading-relaxed">
                        Base ativa com <b>{demo.activeCount}</b> clientes. Predomina <b>{Object.keys(demo.tipoCount).sort((a,b)=>(demo.tipoCount[b]-demo.tipoCount[a]))[0] || "—"}</b>{" "}
                        e o perfil mais comum é <b>{Object.keys(demo.perfilCount).sort((a,b)=>(demo.perfilCount[b]-demo.perfilCount[a]))[0] || "—"}</b>.{" "}
                        Idade média <b>{demoStats.idadeMedia ?? "—"}</b> anos. Segmento PF mais comum:{" "}
                        <b>{Object.keys(demo.segPFCount).sort((a,b)=>(demo.segPFCount[b]-demo.segPFCount[a]))[0] || "—"}</b>.
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        *Sexo depende do preenchimento no cadastro.
                      </div>
                    </div>
                  </div>

                  {/* Mapa */}
                  <div className="xl:col-span-7 space-y-4">
                    <BrazilTileMap
                      activeUFs={demoUFsActive}
                      selectedUF={demoUF}
                      onSelectUF={(uf) => setDemoUF(uf)}
                    />

                    <div className="rounded-2xl border p-4 bg-white">
                      <div className="font-semibold mb-2">Distribuições rápidas</div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-2xl border p-3 bg-slate-50">
                          <div className="text-xs text-slate-600 mb-2">Sexo (contagem)</div>
                          {Object.keys(demo.sexoCount).length === 0 ? (
                            <div className="text-sm text-slate-600">Sem preenchimento.</div>
                          ) : (
                            Object.entries(demo.sexoCount)
                              .sort((a, b) => b[1] - a[1])
                              .map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between text-sm py-1">
                                  <span>{k === "M" ? "Masculino" : k === "F" ? "Feminino" : "Outro"}</span>
                                  <b>{v}</b>
                                </div>
                              ))
                          )}
                        </div>

                        <div className="rounded-2xl border p-3 bg-slate-50">
                          <div className="text-xs text-slate-600 mb-2">Produtos (vendas ativas)</div>
                          {Object.keys(demo.produtoCount).length === 0 ? (
                            <div className="text-sm text-slate-600">Sem dados.</div>
                          ) : (
                            Object.entries(demo.produtoCount)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 6)
                              .map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between text-sm py-1">
                                  <span className="truncate">{k}</span>
                                  <b>{v}</b>
                                </div>
                              ))
                          )}
                        </div>

                        <div className="rounded-2xl border p-3 bg-slate-50 md:col-span-2">
                          <div className="text-xs text-slate-600 mb-2">Como conheceu (Top)</div>
                          {Object.keys(demo.origemCount).length === 0 ? (
                            <div className="text-sm text-slate-600">Sem preenchimento.</div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {Object.entries(demo.origemCount)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 8)
                                .map(([k, v]) => (
                                  <div key={k} className="flex items-center justify-between rounded-xl bg-white border p-2 text-sm">
                                    <span className="truncate">{k}</span>
                                    <b>{v}</b>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
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
          {/* Header: ✅ sem Lead/Venda/Grupo + ✅ avatar */}
          <div className="rounded-xl border p-4 mb-4 bg-slate-50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="avatar avatar-lg">
                  {extra.foto_url ? (
                    <img src={extra.foto_url} alt="Foto do cliente" className="avatar-img" />
                  ) : (
                    <span className="avatar-ini">{initials(nome || active.nome)}</span>
                  )}
                </div>

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

                {/* ✅ novo: Sexo */}
                <div className="md:col-span-2">
                  <div className="label">Sexo</div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className={`pill ${extra.sexo === "M" ? "pill-on" : ""}`}
                      onClick={() => setExtra((s) => ({ ...s, sexo: "M" }))}
                      disabled={readOnly}
                    >
                      Masculino
                    </button>
                    <button
                      type="button"
                      className={`pill ${extra.sexo === "F" ? "pill-on" : ""}`}
                      onClick={() => setExtra((s) => ({ ...s, sexo: "F" }))}
                      disabled={readOnly}
                    >
                      Feminino
                    </button>
                    <button
                      type="button"
                      className={`pill ${extra.sexo === "O" ? "pill-on" : ""}`}
                      onClick={() => setExtra((s) => ({ ...s, sexo: "O" }))}
                      disabled={readOnly}
                    >
                      Outro
                    </button>
                    {!readOnly && (
                      <button type="button" className="pill" onClick={() => setExtra((s) => ({ ...s, sexo: "" }))}>
                        Limpar
                      </button>
                    )}
                  </div>
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
                  <input
                    className="input"
                    value={onlyDigits(cpf)}
                    onChange={(e) => setCpf(onlyDigits(e.target.value))}
                    disabled={readOnly}
                  />
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
                  <input
                    className="input"
                    value={extra.logradouro}
                    onChange={(e) => setExtra((s) => ({ ...s, logradouro: e.target.value }))}
                    disabled={readOnly}
                  />
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
                    <select className="input" value={extra.como_conheceu} onChange={(e) => setExtra((s) => ({ ...s, como_conheceu: e.target.value as any }))} disabled={readOnly}>
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

        /* ✅ Avatar */
        .avatar{
          width:38px;height:38px;border-radius:999px;
          border:2px solid rgba(161,28,39,.15);
          background:#fff;
          display:flex;align-items:center;justify-content:center;
          overflow:hidden;
          flex:0 0 auto;
        }
        .avatar-lg{width:52px;height:52px;border-width:3px}
        .avatar-img{width:100%;height:100%;object-fit:cover}
        .avatar-ini{font-weight:900;color:#111827;font-size:12px}
      `}</style>
    </div>
  );
}
