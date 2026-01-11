// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Lead = { id: string; nome: string; telefone?: string | null; email?: string | null };

type Produto =
  | "Automóvel"
  | "Imóvel"
  | "Serviço"
  | "Motocicleta"
  | "Pesados"
  | "Imóvel Estendido"
  | "Consórcio Ouro";

type FormaVenda = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";
type Administradora = string;

type Venda = {
  id: string;
  lead_id: string;
  cpf: string;
  data_venda: string;
  vendedor_id: string; // aqui é auth_user_id (conforme seu schema)
  produto: Produto;
  administradora: Administradora;
  forma_venda: FormaVenda;
  numero_proposta: string;
  valor_venda: number;
  tipo_venda: "Normal" | "Contemplada" | "Bolsão";
  descricao: string | null;
  status: "nova" | "encarteirada";
  grupo: string | null;
  cota: string | null;
  codigo: string | null;
  encarteirada_em: string | null;
  contemplada?: boolean | null;
  data_contemplacao?: string | null; // date
  tabela?: string | null;
  created_at: string;
  segmento?: string | null;
  data_nascimento?: string | null;
  cancelada_em?: string | null; // timestamptz
  inad?: boolean | null;

  // ====== NOVOS CAMPOS ======
  reativada_em?: string | null; // timestamptz
  contemplacao_tipo?: string | null;
  contemplacao_pct?: number | null; // numeric(9,4)
  inad_em?: string | null; // date
  inad_revertida_em?: string | null; // date
};

type AppUser = {
  id: string; // users.id
  nome: string;
  email?: string | null;
  role?: string | null;
  auth_user_id?: string | null; // auth.users.id
};

const PRODUTOS: Produto[] = [
  "Automóvel",
  "Imóvel",
  "Serviço",
  "Motocicleta",
  "Pesados",
  "Imóvel Estendido",
  "Consórcio Ouro",
];

const FORMAS: FormaVenda[] = ["Parcela Cheia", "Reduzida 25%", "Reduzida 50%"];

const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(n);

const formatNumberBR = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const isAtiva = (codigo: string | null) => (codigo?.trim() ?? "") === "00";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

const formatDateBR = (isoDate?: string | null) => {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR").format(d);
};

const formatDateTimeBR = (isoDate?: string | null) => {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
};

// Converte input date (YYYY-MM-DD) para timestamptz ISO (00:00 local -> ISO)
const isoFromDateInput = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

// Formata automaticamente como CPF (11 dígitos) ou CNPJ (14 dígitos)
const formatCPF = (s: string) => {
  const d = onlyDigits(s);

  if (d.length <= 11) {
    const cpf = d.slice(0, 11);
    const p1 = cpf.slice(0, 3);
    const p2 = cpf.slice(3, 6);
    const p3 = cpf.slice(6, 9);
    const p4 = cpf.slice(9, 11);

    if (cpf.length <= 3) return p1;
    if (cpf.length <= 6) return `${p1}.${p2}`;
    if (cpf.length <= 9) return `${p1}.${p2}.${p3}`;
    return `${p1}.${p2}.${p3}-${p4}`;
  }

  const cnpj = d.slice(0, 14);
  const p1 = cnpj.slice(0, 2);
  const p2 = cnpj.slice(2, 5);
  const p3 = cnpj.slice(5, 8);
  const p4 = cnpj.slice(8, 12);
  const p5 = cnpj.slice(12, 14);

  if (cnpj.length <= 2) return p1;
  if (cnpj.length <= 5) return `${p1}.${p2}`;
  if (cnpj.length <= 8) return `${p1}.${p2}.${p3}`;
  if (cnpj.length <= 12) return `${p1}.${p2}.${p3}/${p4}`;
  return `${p1}.${p2}.${p3}/${p4}-${p5}`;
};

// Valida CPF (11) OU CNPJ (14)
const validateCPF = (doc: string) => {
  const d = onlyDigits(doc);

  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (base: string, factor: number) => {
      let sum = 0;
      for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (factor - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    const d1 = calc(d.slice(0, 9), 10);
    const d2 = calc(d.slice(0, 10), 11);
    return d1 === parseInt(d[9], 10) && d2 === parseInt(d[10], 10);
  }

  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;

    const calc = (weights: number[], digits: string) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += weights[i] * parseInt(digits[i], 10);
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };

    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, ...w1];

    const d1 = calc(w1, d.slice(0, 12));
    const d2 = calc(w2, d.slice(0, 13));

    return d1 === parseInt(d[12], 10) && d2 === parseInt(d[13], 10);
  }

  return false;
};

function normalizeProdutoToSegmento(produto: Produto | string | null | undefined): string | null {
  const p = (produto || "").toString().trim();
  if (!p) return null;
  // ⚠️ Mantemos essa normalização para o campo "segmento" em vendas (como estava),
  // pois outras partes do CRM podem depender disso.
  if (p === "Imóvel Estendido") return "Imóvel";
  if (p === "Serviço") return "Serviços";
  return p;
}

function normalizeSegmentLabel(s: string | null | undefined): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTableName(s: string | null | undefined): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ✅ CORREÇÃO (TABELAS POR SEGMENTO)
 * Para filtrar sim_tables.segmento corretamente, NÃO podemos colapsar "Imóvel Estendido" -> "Imóvel".
 * Então criamos um matcher de segmento (produto selecionado -> candidatos normalizados),
 * cobrindo variações comuns (singular/plural e hífen/espaço).
 */
function segmentCandidatesForProduto(produto: Produto | string | null | undefined): string[] {
  const p = (produto || "").toString().trim();
  if (!p) return [];

  const key = (x: string) => normalizeSegmentLabel(x);
  const set = new Set<string>();

  const add = (x: string) => {
    const k = key(x);
    if (k) set.add(k);
  };

  // base (como veio no select)
  add(p);

  // variações por produto (singular/plural e nomes conhecidos)
  if (p === "Automóvel") {
    add("Automóveis");
  } else if (p === "Imóvel") {
    add("Imóveis");
  } else if (p === "Imóvel Estendido") {
    // IMPORTANTÍSSIMO: manter separado de "Imóvel"
    add("Imóveis Estendidos");
    add("Imóvel-Estendido");
    add("Imóveis-Estendidos");
  } else if (p === "Serviço") {
    add("Serviços");
    add("Servico");
    add("Servicos");
  } else if (p === "Motocicleta") {
    add("Motocicletas");
  } else if (p === "Pesados") {
    add("Pesado");
  } else if (p === "Consórcio Ouro") {
    add("Consorcio Ouro");
    add("Consórcio de Ouro");
    add("Consorcio de Ouro");
  }

  return Array.from(set);
}

function produtoMatchesTableSegment(produto: Produto, tableSegment: string | null | undefined): boolean {
  const segNorm = normalizeSegmentLabel(tableSegment);
  if (!segNorm) return false;
  const candidates = segmentCandidatesForProduto(produto);
  return candidates.includes(segNorm);
}

// Percentual com 4 casas (input humano -> number)
const parsePct4 = (raw: string): number | null => {
  const s = (raw || "")
    .replace(/\s/g, "")
    .replace("%", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
};

const formatPct4 = (n?: number | null) => {
  if (n == null || Number.isNaN(Number(n))) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number(n));
};

type LinhaEncarteirarProps = {
  venda: Venda;
  lead?: Lead;
  canEncarteirar: boolean;
  onSubmit: (vendaId: string, grupo: string, cota: string, codigo: string) => Promise<void>;
  onDelete: (vendaId: string) => Promise<void>;
  onViewVenda: (v: Venda, lead?: Lead) => void;
  onOpenEditarVenda: (v: Venda) => void;
};

const LinhaEncarteirar: React.FC<LinhaEncarteirarProps> = ({
  venda,
  lead,
  canEncarteirar,
  onSubmit,
  onDelete,
  onViewVenda,
  onOpenEditarVenda,
}) => {
  const [grupo, setGrupo] = useState("");
  const [cota, setCota] = useState("");
  const [codigo, setCodigo] = useState("");

  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="flex items-center gap-2">
          <button
            title="Ver venda"
            className="text-gray-500 hover:text-gray-800"
            onClick={() => onViewVenda(venda, lead)}
          >
            👁️
          </button>
          <div className="font-medium">{lead?.nome ?? "—"}</div>
          <button
            title="Editar pendente"
            className="text-gray-500 hover:text-gray-800"
            onClick={() => onOpenEditarVenda(venda)}
          >
            ✏️
          </button>
        </div>
        <div className="text-xs text-gray-500">{lead?.telefone ?? "—"}</div>
      </td>
      <td className="p-2">{venda.administradora}</td>
      <td className="p-2">{venda.numero_proposta}</td>
      <td className="p-2">
        <input
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="border rounded px-2 py-1 w-28"
          disabled={!canEncarteirar}
        />
      </td>
      <td className="p-2">
        <input
          value={cota}
          onChange={(e) => setCota(e.target.value)}
          className="border rounded px-2 py-1 w-20"
          disabled={!canEncarteirar}
        />
      </td>
      <td className="p-2">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          className="border rounded px-2 py-1 w-20"
          disabled={!canEncarteirar}
        />
      </td>
      <td className="p-2">{currency(venda.valor_venda ?? 0)}</td>
      <td className="p-2">
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded ${
              canEncarteirar
                ? "bg-[#A11C27] text-white hover:opacity-90"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
            disabled={!canEncarteirar}
            onClick={() => onSubmit(venda.id, grupo, cota, codigo)}
          >
            ENCARTEIRAR
          </button>
          <button
            className="px-3 py-1 rounded border hover:bg-gray-50"
            onClick={() => {
              if (confirm("Excluir este lançamento? Essa ação não pode ser desfeita.")) onDelete(venda.id);
            }}
          >
            Excluir
          </button>
        </div>
      </td>
    </tr>
  );
};

type LinhaCotaProps = {
  venda: Venda;
  onViewVenda: (v: Venda) => void;
  onOpenCotaEditor: (v: Venda) => void;
  isAdmin: boolean;
};

const LinhaCota: React.FC<LinhaCotaProps> = ({ venda, onViewVenda, onOpenCotaEditor, isAdmin }) => {
  const ativa = isAtiva(venda.codigo);

  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2 py-1 rounded-full text-xs ${
              ativa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {ativa ? "Ativa" : "Cancelada"}
          </span>

          {!!venda.contemplada && (
            <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800">Contemplada</span>
          )}

          {!!venda.inad && (
            <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">Inadimplente</span>
          )}
        </div>
      </td>

      <td className="p-2">{venda.administradora}</td>

      <td className="p-2">
        <div className="flex items-center gap-2">
          <button
            title="Ver venda"
            className="text-gray-500 hover:text-gray-800"
            onClick={() => onViewVenda(venda)}
          >
            👁️
          </button>
          <span>{venda.numero_proposta}</span>
        </div>
      </td>

      <td className="p-2">{venda.produto}</td>
      <td className="p-2">{venda.grupo ?? "—"}</td>
      <td className="p-2">{venda.cota ?? "—"}</td>
      <td className="p-2">{venda.codigo ?? "—"}</td>
      <td className="p-2">{currency(venda.valor_venda ?? 0)}</td>

      <td className="p-2">
        {isAdmin ? (
          <button
            className="px-3 py-1 rounded border hover:bg-gray-50"
            onClick={() => onOpenCotaEditor(venda)}
            title="Editar cota"
          >
            ✏️ Editar
          </button>
        ) : (
          <span className="text-xs text-gray-400">Somente admin edita</span>
        )}
      </td>
    </tr>
  );
};

type ClienteGroup = {
  cliente: Lead;
  itens: Venda[];
  totalAtivas: number;
  qtdAtivas: number;
  segmentos: Set<string>;
};

type ClienteBlocoProps = {
  group: ClienteGroup;
  onViewVenda: (v: Venda) => void;
  onOpenCotaEditor: (v: Venda) => void;
  isAdmin: boolean;
};

const ClienteBloco: React.FC<ClienteBlocoProps> = ({ group, onViewVenda, onOpenCotaEditor, isAdmin }) => {
  const [open, setOpen] = useState(false);
  const segs = Array.from(group.segmentos).join("; ");

  return (
    <div className="border rounded-2xl p-4">
      <div className="w-full flex items-center justify-between">
        <button className="text-left" onClick={() => setOpen((o) => !o)}>
          <div className="font-medium">
            {group.cliente.nome}
            <span className="text-xs text-gray-500 ml-2">{group.cliente.telefone ?? ""}</span>
          </div>
          <div className="text-sm text-gray-600">
            Total Ativas: <strong>{currency(group.totalAtivas)}</strong> • Qtd:{" "}
            <strong>{group.qtdAtivas}</strong> • Segmentos: {segs}
          </div>
        </button>
        <button title="Ver cotas" className="text-gray-500 hover:text-gray-800" onClick={() => setOpen(true)}>
          👁️
        </button>
      </div>

      {open && (
        <div className="mt-3 overflow-auto">
          <table className="min-w-[1050px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Proposta</th>
                <th className="text-left p-2">Segmento</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {group.itens.map((v) => (
                <LinhaCota
                  key={v.id}
                  venda={v}
                  onViewVenda={onViewVenda}
                  onOpenCotaEditor={onOpenCotaEditor}
                  isAdmin={isAdmin}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

type EditarVendaPendenteModalProps = {
  open: boolean;
  venda?: Venda;
  leads: Lead[];
  onClose: () => void;
  onSave: (venda: Venda, novo: Partial<Venda>) => Promise<void>;
};

const EditarVendaPendenteModal: React.FC<EditarVendaPendenteModalProps> = ({
  open,
  venda,
  leads,
  onClose,
  onSave,
}) => {
  const [tmp, setTmp] = useState<Partial<Venda>>({});

  useEffect(() => {
    if (!open || !venda) return;
    setTmp({
      lead_id: venda.lead_id,
      cpf: venda.cpf,
      data_venda: venda.data_venda,
      produto: venda.produto,
      administradora: venda.administradora,
      forma_venda: venda.forma_venda,
      numero_proposta: venda.numero_proposta,
      valor_venda: venda.valor_venda,
      tipo_venda: venda.tipo_venda,
      descricao: venda.descricao,
      tabela: venda.tabela,
      grupo: venda.grupo || "",
      data_nascimento: venda.data_nascimento || "",
    });
  }, [open, venda]);

  if (!open || !venda) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Venda • {venda.numero_proposta}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm text-gray-600">Pessoa (Lead)</label>
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={tmp.lead_id ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, lead_id: e.target.value }))}
            >
              <option value="">Selecione um lead…</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} {l.telefone ? `• ${l.telefone}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">CPF / CNPJ</label>
            <input
              className="w-full border rounded-xl px-3 py-2"
              value={formatCPF(tmp.cpf ?? "")}
              onChange={(e) => setTmp((p) => ({ ...p, cpf: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Data da Venda</label>
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2"
              value={tmp.data_venda ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, data_venda: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Data de Nascimento</label>
            <input
              type="date"
              className="w-full border rounded-xl px-3 py-2"
              value={tmp.data_nascimento ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, data_nascimento: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Produto</label>
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={tmp.produto as Produto}
              onChange={(e) => setTmp((p) => ({ ...p, produto: e.target.value as Produto }))}
            >
              {PRODUTOS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">Tabela</label>
            <input
              className="w-full border rounded-xl px-3 py-2"
              value={tmp.tabela ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, tabela: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Administradora</label>
            <input
              className="w-full border rounded-xl px-3 py-2"
              value={(tmp.administradora as string) ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, administradora: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Forma da Venda</label>
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={tmp.forma_venda as FormaVenda}
              onChange={(e) => setTmp((p) => ({ ...p, forma_venda: e.target.value as FormaVenda }))}
            >
              {FORMAS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">Número da Proposta</label>
            <input
              className="w-full border rounded-xl px-3 py-2"
              value={tmp.numero_proposta ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, numero_proposta: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Valor da Venda</label>
            <input
              className="w-full border rounded-xl px-3 py-2"
              value={(tmp.valor_venda as any) ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, valor_venda: Number(e.target.value) }))}
              type="number"
              step="0.01"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-gray-600">Descrição</label>
            <textarea
              className="w-full border rounded-xl px-3 py-2"
              rows={3}
              value={tmp.descricao ?? ""}
              onChange={(e) => setTmp((p) => ({ ...p, descricao: e.target.value }))}
            />
          </div>
        </div>

        <div className="text-right">
          <button className="px-4 py-2 rounded-xl border mr-2" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90"
            onClick={() => onSave(venda, tmp)}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

type CotaEditMode = "pick" | "cota_codigo" | "contemplacao" | "inad" | "transfer";

// ✅ sentinel interno (só para vendedor quando não acha users.id)
const SELF_SELLER = "__me__";

const Carteira: React.FC = () => {
  const [userId, setUserId] = useState<string>(""); // auth.users.id
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, Lead>>({});
  const [pendentes, setPendentes] = useState<Venda[]>([]);
  const [encarteiradas, setEncarteiradas] = useState<Venda[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>("");

  const [q, setQ] = useState<string>("");
  const [showCarteira, setShowCarteira] = useState<boolean>(true);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [form, setForm] = useState<Partial<Venda>>({
    cpf: "",
    data_venda: new Date().toISOString().slice(0, 10),
    produto: "Automóvel",
    administradora: "",
    forma_venda: "Parcela Cheia",
    tipo_venda: "Normal",
    descricao: "",
    grupo: "",
    tabela: "",
    data_nascimento: "",
  });

  const [editVendaModal, setEditVendaModal] = useState<{ open: boolean; venda?: Venda }>({ open: false });

  const [viewVendaModal, setViewVendaModal] = useState<{
    open: boolean;
    venda?: Venda;
    lead?: Lead;
  }>({ open: false });

  const [simAdmins, setSimAdmins] = useState<Array<{ id: string; name: string }>>([]);
  const [simTables, setSimTables] = useState<
    Array<{
      id: string;
      admin_id: string;
      segmento: string;
      nome_tabela: string;
      faixa_min?: number | null;
      faixa_max?: number | null;
      prazo_limite?: number | null;
    }>
  >([]);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [metaOverlay, setMetaOverlay] = useState<{ open: boolean }>({ open: false });
  const [metaForm, setMetaForm] = useState<{ vendedor_id: string; ano: number; m: number[] }>({
    vendedor_id: "",
    ano: new Date().getFullYear(),
    m: Array(12).fill(0),
  });

  // admin escolhe users.id; vendedor fica travado no próprio users.id (ou SELF_SELLER como fallback)
  const [selectedSeller, setSelectedSeller] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [metaMensal, setMetaMensal] = useState<number[]>(Array(12).fill(0));
  const [realizadoMensal, setRealizadoMensal] = useState<number[]>(Array(12).fill(0));

  const metaAnual = useMemo(() => metaMensal.reduce((a, b) => a + b, 0), [metaMensal]);
  const realizadoAnual = useMemo(() => realizadoMensal.reduce((a, b) => a + b, 0), [realizadoMensal]);

  const pct =
    metaAnual > 0 ? Math.max(0, Math.min(100, Math.round((realizadoAnual / metaAnual) * 100))) : 0;

  const [leadSearch, setLeadSearch] = useState<string>("");

  // Modal de transferência de cota
  const [transferModal, setTransferModal] = useState<{ open: boolean; venda?: Venda }>({ open: false });
  const [transferLeadId, setTransferLeadId] = useState<string>("");
  const [transferSearch, setTransferSearch] = useState<string>("");
  const [transferCpf, setTransferCpf] = useState<string>("");
  const [transferNascimento, setTransferNascimento] = useState<string>("");

  // Editor de “Cota”
  const [cotaEditor, setCotaEditor] = useState<{ open: boolean; venda?: Venda; mode: CotaEditMode }>({
    open: false,
    venda: undefined,
    mode: "pick",
  });

  const [ceGrupo, setCeGrupo] = useState<string>("");
  const [ceCota, setCeCota] = useState<string>("");
  const [ceCodigo, setCeCodigo] = useState<string>("");

  const [ceCancelDate, setCeCancelDate] = useState<string>("");
  const [ceReativDate, setCeReativDate] = useState<string>("");

  const [ceContFlag, setCeContFlag] = useState<boolean>(false);
  const [ceContDate, setCeContDate] = useState<string>("");
  const [ceContTipo, setCeContTipo] = useState<string>("");
  const [ceContPctRaw, setCeContPctRaw] = useState<string>("");

  const [ceInadFlag, setCeInadFlag] = useState<boolean>(false);
  const [ceInadEm, setCeInadEm] = useState<string>("");
  const [ceInadRev, setCeInadRev] = useState<string>("");

  // ===== helpers de ID =====
  const getAuthByUserId = (sellerUserId: string) => {
    if (!sellerUserId) return "";
    if (sellerUserId === SELF_SELLER) return userId; // fallback vendedor
    return users.find((u) => u.id === sellerUserId)?.auth_user_id ?? "";
  };

  const authIdFromSellerId = useMemo(() => {
    if (!selectedSeller) return "";
    return getAuthByUserId(selectedSeller);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeller, users, userId]);

  // ao trocar produto, zera tabela
  useEffect(() => {
    setForm((f) => ({ ...f, tabela: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.produto]);

  // ===== Carregamento inicial =====
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id ?? "";
        const uemail = authData.user?.email ?? "";

        setUserId(uid);
        setUserEmail(uemail);
        setUserName(authData.user?.user_metadata?.nome ?? uemail ?? "Vendedor");

        // Flag admin (tabela users) - por email
        let adminFlag = false;
        try {
          const { data } = await supabase.from("users").select("email, role").eq("email", uemail).maybeSingle();
          adminFlag = (data?.role ?? "").toString().toLowerCase() === "admin";
        } catch {}
        setIsAdmin(adminFlag);

        // Carrega tudo em paralelo
        const [{ data: lds }, pend, enc, { data: admins }, { data: tables }, { data: us }] = await Promise.all([
          supabase.from("leads").select("id,nome,telefone,email").order("nome", { ascending: true }),
          (async () => {
            const q = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
            if (!adminFlag) q.eq("vendedor_id", uid);
            const { data } = await q;
            return data;
          })(),
          (async () => {
            const q = supabase
              .from("vendas")
              .select("*")
              .eq("status", "encarteirada")
              .order("created_at", { ascending: false });
            if (!adminFlag) q.eq("vendedor_id", uid);
            const { data } = await q;
            return data;
          })(),
          supabase.from("sim_admins").select("id,name").order("name", { ascending: true }),
          supabase.from("sim_tables").select("id,admin_id,segmento,nome_tabela,faixa_min,faixa_max,prazo_limite"),
          supabase
            .from("users")
            .select("id,nome,email,role,auth_user_id")
            .eq("is_active", true)
            .order("nome", { ascending: true }),
        ]);

        const leadsArr = (lds ?? []) as Lead[];
        setLeads(leadsArr);
        setLeadMap(Object.fromEntries(leadsArr.map((l: any) => [l.id, l])));

        setPendentes((pend ?? []) as Venda[]);
        setEncarteiradas((enc ?? []) as Venda[]);

        setSimAdmins((admins ?? []) as any);
        setSimTables((tables ?? []) as any);
        setUsers((us ?? []) as AppUser[]);

        // selectedSeller: admin = "" (Todos), vendedor = seu users.id (ou SELF_SELLER fallback)
        const myUserRow = (us ?? []).find((u: any) => u.auth_user_id === uid || u.email === uemail);
        if (adminFlag) {
          setSelectedSeller("");
        } else {
          const myId = myUserRow?.id ?? "";
          setSelectedSeller(myId || SELF_SELLER);
          if (!myId) {
            console.warn("Usuário não encontrado em public.users; usando fallback SELF_SELLER via auth_user_id.");
          }
        }
      } catch (e: any) {
        setErr(e.message || "Falha ao carregar Carteira.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ===== filtros por vendedor (admin) aplicados no que o usuário enxerga =====
  const pendentesVisiveis = useMemo(() => {
    if (!isAdmin) return pendentes;
    if (!selectedSeller) return pendentes;
    const authId = getAuthByUserId(selectedSeller);
    if (!authId) return [];
    return pendentes.filter((v) => v.vendedor_id === authId);
  }, [pendentes, isAdmin, selectedSeller, users, userId]);

  const encarteiradasVisiveisBase = useMemo(() => {
    if (!isAdmin) return encarteiradas;
    if (!selectedSeller) return encarteiradas;
    const authId = getAuthByUserId(selectedSeller);
    if (!authId) return [];
    return encarteiradas.filter((v) => v.vendedor_id === authId);
  }, [encarteiradas, isAdmin, selectedSeller, users, userId]);

  const pendentesComNome = useMemo(
    () =>
      pendentesVisiveis.map((v) => ({
        venda: v,
        lead: leadMap[v.lead_id],
      })),
    [pendentesVisiveis, leadMap]
  );

  const encarteiradasFiltradas = useMemo(() => {
    const base = encarteiradasVisiveisBase;
    if (!q.trim()) return base;
    const s = q.toLowerCase();
    return base.filter((v) => leadMap[v.lead_id]?.nome?.toLowerCase().includes(s));
  }, [q, encarteiradasVisiveisBase, leadMap]);

  const totalAtivas = useMemo(
    () => encarteiradasFiltradas.reduce((a, v) => (isAtiva(v.codigo) ? a + (v.valor_venda || 0) : a), 0),
    [encarteiradasFiltradas]
  );

  const totalCanceladas = useMemo(
    () => encarteiradasFiltradas.reduce((a, v) => (!isAtiva(v.codigo) ? a + (v.valor_venda || 0) : a), 0),
    [encarteiradasFiltradas]
  );

  const totalContempladas = useMemo(
    () => encarteiradasFiltradas.reduce((a, v) => (v.contemplada ? a + (v.valor_venda || 0) : a), 0),
    [encarteiradasFiltradas]
  );

  const totalInadimplentes = useMemo(
    () => encarteiradasFiltradas.reduce((a, v) => (v.inad ? a + (v.valor_venda || 0) : a), 0),
    [encarteiradasFiltradas]
  );

  const porCliente: ClienteGroup[] = useMemo(() => {
    const map: Record<string, ClienteGroup> = {};
    for (const v of encarteiradasFiltradas) {
      const lead = leadMap[v.lead_id];
      if (!lead) continue;

      if (!map[lead.id]) {
        map[lead.id] = {
          cliente: lead,
          itens: [],
          totalAtivas: 0,
          qtdAtivas: 0,
          segmentos: new Set(),
        };
      }

      map[lead.id].itens.push(v);
      if (isAtiva(v.codigo)) {
        map[lead.id].totalAtivas += v.valor_venda || 0;
        map[lead.id].qtdAtivas += 1;
      }
      map[lead.id].segmentos.add(v.produto);
    }

    return Object.values(map).sort((a, b) =>
      a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR", { sensitivity: "base" })
    );
  }, [encarteiradasFiltradas, leadMap]);

  const onFormChange = (k: keyof Venda, val: any) => setForm((f) => ({ ...f, [k]: val }));

  async function insertVenda(payload: any) {
    const { error } = await supabase.from("vendas").insert(payload as any);
    if (error && /data_nascimento/.test(error.message || "")) {
      const { error: e2 } = await supabase.from("vendas").insert({ ...payload, data_nascimento: undefined } as any);
      if (e2) throw e2;
      return;
    }
    if (error) throw error;
  }

  async function updateVenda(id: string, patch: any) {
    const { error } = await supabase.from("vendas").update(patch as any).eq("id", id);
    if (error && /data_nascimento/.test(error.message || "")) {
      const { error: e2 } = await supabase
        .from("vendas")
        .update({ ...patch, data_nascimento: undefined } as any)
        .eq("id", id);
      if (e2) throw e2;
      return;
    }
    if (error) throw error;
  }

  const prefillFromLead = async (leadId: string) => {
    if (!leadId) return;

    const { data: cliente } = await supabase
      .from("clientes")
      .select("cpf,data_nascimento")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (cliente?.cpf || cliente?.data_nascimento) {
      setForm((f) => ({
        ...f,
        cpf: cliente.cpf ?? f.cpf,
        data_nascimento: cliente.data_nascimento ?? f.data_nascimento,
      }));
      return;
    }

    const { data: lastVenda } = await supabase
      .from("vendas")
      .select("cpf,data_nascimento,administradora,produto,tabela")
      .eq("lead_id", leadId)
      .eq("status", "encarteirada")
      .order("encarteirada_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastVenda) {
      setForm((f) => ({
        ...f,
        cpf: lastVenda.cpf ?? f.cpf,
        data_nascimento: lastVenda.data_nascimento ?? f.data_nascimento,
        administradora: lastVenda.administradora ?? f.administradora,
        produto: (lastVenda.produto as Produto) ?? f.produto,
        tabela: lastVenda.tabela ?? f.tabela,
      }));
    }
  };

  const registrarVenda = async () => {
    try {
      if (!form.lead_id) throw new Error("Selecione o Lead.");
      if (!form.cpf?.trim()) throw new Error("CPF/CNPJ é obrigatório.");
      if (!validateCPF(form.cpf)) throw new Error("CPF ou CNPJ inválido.");
      if (!form.numero_proposta?.trim()) throw new Error("Número da proposta é obrigatório.");

      const valor = Number((form.valor_venda as any)?.toString().replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(valor)) throw new Error("Valor inválido.");

      const segmento = normalizeProdutoToSegmento(form.produto as Produto);
      const payload: Partial<Venda> = {
        lead_id: form.lead_id,
        cpf: onlyDigits(form.cpf!),
        data_venda: form.data_venda!,
        vendedor_id: userId, // auth_user_id
        produto: form.produto as Produto,
        administradora: (form.administradora as Administradora) || "",
        forma_venda: form.forma_venda as FormaVenda,
        numero_proposta: form.numero_proposta!,
        valor_venda: valor,
        tipo_venda: (form.tipo_venda as any) ?? "Normal",
        descricao: form.descricao ?? "",
        status: "nova",
        tabela: form.tabela || null,
        segmento: segmento ?? undefined,
        data_nascimento: form.data_nascimento || null,
        grupo: form.tipo_venda === "Bolsão" ? form.grupo || "" : null,
        codigo: "00",
      };

      if (form.tipo_venda === "Bolsão" && !form.grupo?.trim()) throw new Error("Informe o número do Grupo (Bolsão).");

      await insertVenda(payload);

      const pendQuery = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes((pend ?? []) as Venda[]);

      setForm({
        cpf: "",
        data_venda: new Date().toISOString().slice(0, 10),
        produto: "Automóvel",
        administradora: simAdmins[0]?.name ?? "",
        forma_venda: "Parcela Cheia",
        tipo_venda: "Normal",
        descricao: "",
        grupo: "",
        tabela: "",
        data_nascimento: "",
      });

      setLeadSearch("");
      setShowModal(false);
    } catch (e: any) {
      alert(e.message ?? "Erro ao registrar venda.");
    }
  };

  const encarteirar = async (vendaId: string, grupo: string, cota: string, codigo: string) => {
    try {
      if (!isAdmin) throw new Error("Somente administradores podem encarteirar.");
      if (!grupo?.trim() || !cota?.trim() || !codigo?.trim()) throw new Error("Preencha Grupo, Cota e Código.");

      const { data: vOne, error: selErr } = await supabase.from("vendas").select("produto").eq("id", vendaId).maybeSingle();
      if (selErr) throw selErr;
      const segmento = normalizeProdutoToSegmento(vOne?.produto as Produto);

      const { error } = await supabase
        .from("vendas")
        .update({
          grupo,
          cota,
          codigo,
          status: "encarteirada",
          encarteirada_em: new Date().toISOString(),
          segmento: segmento ?? undefined,
        })
        .eq("id", vendaId);

      if (error) throw error;

      const [{ data: pend }, { data: enc }] = await Promise.all([
        (async () => {
          const q = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
          if (!isAdmin) q.eq("vendedor_id", userId);
          const r = await q;
          return r;
        })(),
        (async () => {
          const q = supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false });
          if (!isAdmin) q.eq("vendedor_id", userId);
          const r = await q;
          return r;
        })(),
      ]);

      setPendentes((pend ?? []) as Venda[]);
      setEncarteiradas((enc ?? []) as Venda[]);
      await loadMetrics(selectedSeller, selectedYear);
    } catch (e: any) {
      alert(e.message ?? "Erro ao encarteirar.");
    }
  };

  const excluirVenda = async (vendaId: string) => {
    try {
      const { error } = await supabase.from("vendas").delete().eq("id", vendaId);
      if (error) throw error;

      const pendQuery = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes((pend ?? []) as Venda[]);
    } catch (e: any) {
      alert(e.message ?? "Erro ao excluir.");
    }
  };

  const reloadEncarteiradas = async () => {
    const encQuery = supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false });
    if (!isAdmin) encQuery.eq("vendedor_id", userId);
    const { data: enc } = await encQuery;
    setEncarteiradas((enc ?? []) as Venda[]);
  };

  const salvarEdicaoPendente = async (venda: Venda, novo: Partial<Venda>) => {
    try {
      if (novo.cpf && !validateCPF(novo.cpf)) throw new Error("CPF ou CNPJ inválido.");
      if (novo.numero_proposta && !novo.numero_proposta.trim()) throw new Error("Informe o número da proposta.");

      const patch: any = { ...novo };
      if (patch.cpf) patch.cpf = onlyDigits(patch.cpf);
      if (patch.valor_venda != null) {
        const valor = Number(patch.valor_venda);
        if (Number.isNaN(valor)) throw new Error("Valor inválido.");
        patch.valor_venda = valor;
      }
      if (patch.produto) patch.segmento = normalizeProdutoToSegmento(patch.produto as Produto);

      await updateVenda(venda.id, patch);

      const pendQuery = supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes((pend ?? []) as Venda[]);

      setEditVendaModal({ open: false, venda: undefined });
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar.");
    }
  };

  // tabelas filtradas por Admin + Segmento
  const tabelaOptions = useMemo(() => {
    const prod = (form.produto as Produto) || "Automóvel";
    const admName = (form.administradora as string) || "";
    const admId = simAdmins.find((a) => a.name === admName)?.id;

    const filtered = simTables.filter((t) => {
      if (admId && t.admin_id !== admId) return false;
      return produtoMatchesTableSegment(prod, t.segmento);
    });

    // ✅ DEDUPE no front: mostra 1 por nome_tabela
    const seen = new Set<string>();
    const unique = filtered.filter((t) => {
      const key = normalizeTableName(t.nome_tabela);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique;
  }, [form.produto, form.administradora, simTables, simAdmins]);

  // produtos permitidos para a administradora
  const produtoOptionsForAdmin: Produto[] = useMemo(() => {
    const admName = (form.administradora as string) || "";
    const admId = simAdmins.find((a) => a.name === admName)?.id;
    if (!admId) return PRODUTOS;

    const segSet = new Set(simTables.filter((t) => t.admin_id === admId).map((t) => normalizeSegmentLabel(t.segmento)));

    const filtered = PRODUTOS.filter((p) => {
      const candidates = segmentCandidatesForProduto(p);
      return candidates.some((c) => segSet.has(c));
    });

    return filtered.length ? filtered : PRODUTOS;
  }, [form.administradora, simAdmins, simTables]);

  const adminOptions = useMemo(() => simAdmins.map((a) => a.name), [simAdmins]);

  const filteredLeads = useMemo(() => {
    if (!leadSearch.trim()) return leads;
    const s = leadSearch.toLowerCase();
    return leads.filter((l) => l.nome.toLowerCase().includes(s));
  }, [leadSearch, leads]);

  const filteredTransferLeads = useMemo(() => {
    if (!transferSearch.trim()) return leads;
    const s = transferSearch.toLowerCase();
    return leads.filter((l) => l.nome.toLowerCase().includes(s));
  }, [transferSearch, leads]);

  const onSelectLead = async (leadId: string) => {
    onFormChange("lead_id", leadId);
    await prefillFromLead(leadId);
  };

  const openTransfer = (v: Venda) => {
    setTransferModal({ open: true, venda: v });
    setTransferLeadId("");
    setTransferSearch("");
    setTransferCpf("");
    setTransferNascimento("");
  };

  const handleTransferSave = async () => {
    try {
      if (!transferModal.venda) return;
      if (!transferLeadId) throw new Error("Selecione o novo lead.");
      if (!transferCpf.trim()) throw new Error("CPF/CNPJ é obrigatório.");
      if (!validateCPF(transferCpf)) throw new Error("CPF ou CNPJ inválido.");

      const patch: Partial<Venda> = {
        lead_id: transferLeadId,
        cpf: onlyDigits(transferCpf),
        data_nascimento: transferNascimento || null,
      };

      await updateVenda(transferModal.venda.id, patch);
      await reloadEncarteiradas();

      setTransferModal({ open: false, venda: undefined });
      setTransferLeadId("");
      setTransferSearch("");
      setTransferCpf("");
      setTransferNascimento("");
    } catch (e: any) {
      alert(e.message ?? "Erro ao transferir cota.");
    }
  };

  // ====== MÉTRICAS (metas + realizado) ======
  const loadMetrics = async (sellerId: string, year: number): Promise<void> => {
    const sellerIsSelf = sellerId === SELF_SELLER;

    // -------- Metas (metas_vendedores) --------
    if (sellerId) {
      const authId = getAuthByUserId(sellerId);

      let q = supabase
        .from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", year);

      if (sellerIsSelf) {
        // vendedor sem users.id -> filtra por auth_user_id
        q = q.eq("auth_user_id", authId || userId);
      } else if (authId) {
        // usa os dois IDs: vendedor_id (users.id) OU auth_user_id
        q = q.or(`vendedor_id.eq.${sellerId},auth_user_id.eq.${authId}`);
      } else {
        q = q.eq("vendedor_id", sellerId);
      }

      const { data: metasRow } = await q.maybeSingle();

      const m = metasRow
        ? [
            metasRow.m01,
            metasRow.m02,
            metasRow.m03,
            metasRow.m04,
            metasRow.m05,
            metasRow.m06,
            metasRow.m07,
            metasRow.m08,
            metasRow.m09,
            metasRow.m10,
            metasRow.m11,
            metasRow.m12,
          ].map((x: any) => Number(x || 0))
        : Array(12).fill(0);

      setMetaMensal(m);
    } else {
      const { data: metasAll } = await supabase
        .from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", year);

      const sum = Array(12).fill(0);
      (metasAll ?? []).forEach((row: any) => {
        const arr = [
          row.m01,
          row.m02,
          row.m03,
          row.m04,
          row.m05,
          row.m06,
          row.m07,
          row.m08,
          row.m09,
          row.m10,
          row.m11,
          row.m12,
        ].map((x: any) => Number(x || 0));
        for (let i = 0; i < 12; i++) sum[i] += arr[i];
      });

      setMetaMensal(sum);
    }

    // -------- Realizado (encarteiradas ativas - canceladas) --------
    const ativasBase = supabase
      .from("vendas")
      .select("valor_venda, encarteirada_em, vendedor_id, codigo, status")
      .eq("status", "encarteirada")
      .eq("codigo", "00")
      .gte("encarteirada_em", `${year}-01-01`)
      .lte("encarteirada_em", `${year}-12-31T23:59:59`);

    const cancBase = supabase
      .from("vendas")
      .select("valor_venda, cancelada_em, vendedor_id, codigo, status")
      .eq("status", "encarteirada")
      .neq("codigo", "00")
      .gte("cancelada_em", `${year}-01-01`)
      .lte("cancelada_em", `${year}-12-31T23:59:59`);

    const authIdToFilter = sellerId ? getAuthByUserId(sellerId) : "";

    const qAtivas = sellerId
      ? authIdToFilter
        ? ativasBase.eq("vendedor_id", authIdToFilter)
        : ativasBase.eq("vendedor_id", "__none__")
      : ativasBase;

    const qCanc = sellerId
      ? authIdToFilter
        ? cancBase.eq("vendedor_id", authIdToFilter)
        : cancBase.eq("vendedor_id", "__none__")
      : cancBase;

    const [{ data: vendasAtivas }, { data: vendasCanc }] = await Promise.all([qAtivas, qCanc]);

    const vendido = Array(12).fill(0);
    (vendasAtivas ?? []).forEach((v: any) => {
      const d = v.encarteirada_em ? new Date(v.encarteirada_em) : null;
      if (!d || isNaN(d.getTime())) return;
      vendido[d.getMonth()] += Number(v.valor_venda || 0);
    });

    const cancelado = Array(12).fill(0);
    (vendasCanc ?? []).forEach((v: any) => {
      const d = v.cancelada_em ? new Date(v.cancelada_em) : null;
      if (!d || isNaN(d.getTime())) return;
      cancelado[d.getMonth()] += Number(v.valor_venda || 0);
    });

    setRealizadoMensal(vendido.map((v: number, i: number) => v - cancelado[i]));
  };

  const loadMetaForForm = async (sellerId: string, year: number): Promise<void> => {
    if (!sellerId) {
      setMetaForm((prev) => ({ ...prev, vendedor_id: sellerId, ano: year, m: Array(12).fill(0) }));
      return;
    }

    const authId = getAuthByUserId(sellerId);
    let q = supabase
      .from("metas_vendedores")
      .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
      .eq("ano", year);

    if (sellerId === SELF_SELLER) q = q.eq("auth_user_id", authId || userId);
    else if (authId) q = q.or(`vendedor_id.eq.${sellerId},auth_user_id.eq.${authId}`);
    else q = q.eq("vendedor_id", sellerId);

    const { data: metasRow } = await q.maybeSingle();

    const arr = metasRow
      ? [
          metasRow.m01,
          metasRow.m02,
          metasRow.m03,
          metasRow.m04,
          metasRow.m05,
          metasRow.m06,
          metasRow.m07,
          metasRow.m08,
          metasRow.m09,
          metasRow.m10,
          metasRow.m11,
          metasRow.m12,
        ].map((x: any) => Number(x || 0))
      : Array(12).fill(0);

    setMetaForm((prev) => ({ ...prev, vendedor_id: sellerId, ano: year, m: arr }));
  };

  // carrega métricas quando muda filtro/ano e quando users chega
  useEffect(() => {
    if (!isAdmin && !selectedSeller) return;
    loadMetrics(selectedSeller, selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeller, selectedYear, users, isAdmin]);

  const donutData = useMemo(() => {
    const reached = Math.max(0, Math.min(realizadoAnual, metaAnual));
    const remaining = Math.max(0, metaAnual - reached);
    return [
      { name: "Atingido", value: reached },
      { name: "Restante", value: remaining },
    ];
  }, [metaAnual, realizadoAnual]);

  const lineData = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        name: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][i],
        Meta: metaMensal[i] || 0,
        Realizado: realizadoMensal[i] || 0,
      })),
    [metaMensal, realizadoMensal]
  );

  const handleOpenMeta = () => {
    if (!isAdmin) return;

    if (!users || users.length === 0) {
      alert("Aguarde carregar os vendedores antes de cadastrar a meta.");
      return;
    }

    setMetaForm({
      vendedor_id: selectedSeller || "",
      ano: selectedYear,
      m: Array(12).fill(0),
    });

    if (selectedSeller) loadMetaForForm(selectedSeller, selectedYear);

    setMetaOverlay({ open: true });
  };

  const saveMeta = async () => {
    try {
      if (!isAdmin) throw new Error("Somente administradores podem cadastrar metas.");
      if (!metaForm.vendedor_id) throw new Error("Selecione o vendedor.");
      if (metaForm.vendedor_id === SELF_SELLER) throw new Error("Selecione um vendedor válido.");

      const authId = getAuthByUserId(metaForm.vendedor_id);

      const payload: any = {
        vendedor_id: metaForm.vendedor_id, // users.id
        auth_user_id: authId || null,
        ano: metaForm.ano,
        m01: metaForm.m[0],
        m02: metaForm.m[1],
        m03: metaForm.m[2],
        m04: metaForm.m[3],
        m05: metaForm.m[4],
        m06: metaForm.m[5],
        m07: metaForm.m[6],
        m08: metaForm.m[7],
        m09: metaForm.m[8],
        m10: metaForm.m[9],
        m11: metaForm.m[10],
        m12: metaForm.m[11],
      };

      // encontra se já existe por vendedor_id+ano OU auth_user_id+ano
      let q = supabase.from("metas_vendedores").select("id").eq("ano", metaForm.ano);
      if (authId) q = q.or(`vendedor_id.eq.${metaForm.vendedor_id},auth_user_id.eq.${authId}`);
      else q = q.eq("vendedor_id", metaForm.vendedor_id);

      const { data: exists } = await q.maybeSingle();

      if (exists?.id) {
        const { error } = await supabase.from("metas_vendedores").update(payload).eq("id", exists.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("metas_vendedores").insert(payload);
        if (error) throw error;
      }

      setMetaOverlay({ open: false });

      if (selectedSeller === metaForm.vendedor_id && selectedYear === metaForm.ano) {
        setMetaMensal([...metaForm.m]);
      }
    } catch (e: any) {
      alert(e.message || "Erro ao salvar metas.");
    }
  };

  const openViewVenda = (v: Venda, lead?: Lead) => setViewVendaModal({ open: true, venda: v, lead });

  // ===== Editor de cota =====
  const openCotaEditor = (v: Venda) => {
    setCotaEditor({ open: true, venda: v, mode: "pick" });

    setCeGrupo(v.grupo ?? "");
    setCeCota(v.cota ?? "");
    setCeCodigo(v.codigo ?? "");

    setCeCancelDate(v.cancelada_em ? new Date(v.cancelada_em).toISOString().slice(0, 10) : "");
    setCeReativDate(v.reativada_em ? new Date(v.reativada_em).toISOString().slice(0, 10) : "");

    setCeContFlag(!!v.contemplada);
    setCeContDate(v.data_contemplacao ?? "");
    setCeContTipo(v.contemplacao_tipo ?? "");
    setCeContPctRaw(v.contemplacao_pct != null ? formatPct4(v.contemplacao_pct) : "");

    setCeInadFlag(!!v.inad);
    setCeInadEm(v.inad_em ?? "");
    setCeInadRev(v.inad_revertida_em ?? "");
  };

  const closeCotaEditor = () => setCotaEditor({ open: false, venda: undefined, mode: "pick" });

  const saveCotaCodigo = async () => {
    try {
      if (!isAdmin) throw new Error("Somente admin pode editar.");
      const v = cotaEditor.venda;
      if (!v) return;

      const prevAtiva = isAtiva(v.codigo);
      const nextAtiva = isAtiva(ceCodigo);

      if (!ceGrupo.trim() || !ceCota.trim() || !ceCodigo.trim()) throw new Error("Preencha Grupo, Cota e Código.");

      if (prevAtiva && !nextAtiva) {
        if (!ceCancelDate) throw new Error("Informe a data do cancelamento.");
      }

      if (!prevAtiva && nextAtiva) {
        if (!ceReativDate) throw new Error("Informe a data da reativação.");
      }

      const patch: any = { grupo: ceGrupo, cota: ceCota, codigo: ceCodigo };

      if (prevAtiva && !nextAtiva) patch.cancelada_em = isoFromDateInput(ceCancelDate);
      if (!prevAtiva && nextAtiva) patch.reativada_em = isoFromDateInput(ceReativDate);

      await updateVenda(v.id, patch);
      await reloadEncarteiradas();
      await loadMetrics(selectedSeller, selectedYear);

      closeCotaEditor();
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar alterações de cota.");
    }
  };

  const saveContemplacao = async () => {
    try {
      if (!isAdmin) throw new Error("Somente admin pode editar.");
      const v = cotaEditor.venda;
      if (!v) return;

      const patch: any = {};

      if (!ceContFlag) {
        patch.contemplada = false;
        patch.data_contemplacao = null;
        patch.contemplacao_tipo = null;
        patch.contemplacao_pct = null;
      } else {
        if (!ceContDate) throw new Error("Informe a data da contemplação.");
        if (!ceContTipo) throw new Error("Selecione o tipo de contemplação (lance).");
        const pct = parsePct4(ceContPctRaw);
        if (pct == null) throw new Error("Informe o % do lance (ex.: 41,2542%).");

        patch.contemplada = true;
        patch.data_contemplacao = ceContDate;
        patch.contemplacao_tipo = ceContTipo;
        patch.contemplacao_pct = Number(pct.toFixed(4));
      }

      await updateVenda(v.id, patch);
      await reloadEncarteiradas();
      closeCotaEditor();
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar contemplação.");
    }
  };

  const saveInad = async () => {
    try {
      if (!isAdmin) throw new Error("Somente admin pode editar.");
      const v = cotaEditor.venda;
      if (!v) return;

      const patch: any = {};

      if (ceInadFlag) {
        if (!ceInadEm) throw new Error("Informe a data que inadimpliu.");
        patch.inad = true;
        patch.inad_em = ceInadEm;
        patch.inad_revertida_em = null;
      } else {
        if (!ceInadRev) throw new Error("Informe a data da reversão da inadimplência.");
        patch.inad = false;
        patch.inad_revertida_em = ceInadRev;
      }

      await updateVenda(v.id, patch);
      await reloadEncarteiradas();
      closeCotaEditor();
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar inadimplência.");
    }
  };

  const goTransferFromEditor = () => {
    const v = cotaEditor.venda;
    if (!v) return;
    closeCotaEditor();
    openTransfer(v);
  };

  if (loading) return <div className="p-6 text-sm text-gray-600">Carregando carteira…</div>;
  if (err) return <div className="p-6 text-red-600">Erro: {err}</div>;

  const tabelaOptionsForForm = tabelaOptions;
  const adminNames = adminOptions.length
    ? adminOptions
    : ["Embracon", "Banco do Brasil", "HS Consórcios", "Âncora", "Maggi"];

  const selectedTransferLead = transferLeadId ? leadMap[transferLeadId] : undefined;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Carteira</h1>
          <p className="text-gray-500 text-sm">Gerencie vendas e encarteiramento.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90"
          >
            + Nova Venda
          </button>

          {/* ✅ vendedor não cadastra meta */}
          {isAdmin && (
            <button onClick={handleOpenMeta} className="px-4 py-2 rounded-xl border hover:bg-gray-50">
              Cadastrar Meta
            </button>
          )}
        </div>
      </div>

      {/* ===================== Metas ===================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Metas</h2>

          <div className="flex items-center gap-2">
            <select
              className="border rounded-xl px-3 py-2"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const y = new Date().getFullYear() - 1 + i;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>

            {isAdmin && (
              <select
                className="border rounded-xl px-3 py-2"
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
              >
                <option value="">Todos</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome || u.email || u.id}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border rounded-2xl p-4 flex items-center justify-center relative">
            <div className="absolute top-3 left-4 text-sm text-gray-500">Meta anual: {currency(metaAnual)}</div>
            <div className="absolute top-3 right-4 text-sm text-gray-500">Atingido: {currency(realizadoAnual)}</div>
            <div className="w-full h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData} innerRadius={80} outerRadius={110} dataKey="value">
                    <Cell key="atingido" fill="#1E293F" />
                    <Cell key="restante" fill="#A11C27" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-2xl font-semibold">{pct}%</div>
            </div>
          </div>

          <div className="lg:col-span-2 border rounded-2xl p-4">
            <div className="w-full h-64">
              <ResponsiveContainer>
                <LineChart data={lineData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => currency(Number(v || 0))} />
                  <Legend />
                  <Line type="monotone" dataKey="Realizado" stroke="#1E293F" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="Meta" stroke="#A11C27" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ✅ debug leve pro admin */}
        {isAdmin && selectedSeller && selectedSeller !== SELF_SELLER && (
          <div className="text-xs text-gray-500">
            Filtro: vendedor <strong>{users.find((u) => u.id === selectedSeller)?.nome ?? selectedSeller}</strong> •
            auth_user_id: <strong>{authIdFromSellerId || "—"}</strong>
          </div>
        )}
      </section>

      {/* ===================== Busca ===================== */}
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar cliente pelo nome…"
          className="w-full border rounded-xl px-3 py-2 outline-none focus:ring"
        />
      </div>

      {/* ===================== Encarteirar ===================== */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Encarteirar</h2>
          <span className="text-sm text-gray-500">{pendentesVisiveis.length} nova(s) venda(s)</span>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[860px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Cliente</th>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Proposta</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2 w-56">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendentesComNome.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={8}>
                    Sem novas vendas para encarteirar.
                  </td>
                </tr>
              )}
              {pendentesComNome.map(({ venda, lead }) => (
                <LinhaEncarteirar
                  key={venda.id}
                  venda={venda}
                  lead={lead}
                  canEncarteirar={isAdmin}
                  onSubmit={encarteirar}
                  onDelete={excluirVenda}
                  onViewVenda={(v, l) => openViewVenda(v, l)}
                  onOpenEditarVenda={(v) => setEditVendaModal({ open: true, venda: v })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================== Chips Totais ===================== */}
      <div className="flex items-center gap-4">
        <div className="px-4 py-3 rounded-2xl bg-[#1E293F] text-white">
          Ativas: <strong className="ml-1">{currency(totalAtivas)}</strong>
        </div>
        <div className="px-4 py-3 rounded-2xl bg-gray-100">
          Canceladas: <strong className="ml-1">{currency(totalCanceladas)}</strong>
        </div>
        <div className="px-4 py-3 rounded-2xl bg-amber-100 text-amber-900">
          Contempladas: <strong className="ml-1">{currency(totalContempladas)}</strong>
        </div>
        <div className="px-4 py-3 rounded-2xl bg-red-100 text-red-900">
          Inadimplentes: <strong className="ml-1">{currency(totalInadimplentes)}</strong>
        </div>
        <button
          className="ml-auto px-4 py-2 rounded-xl border hover:bg-gray-50"
          onClick={() => setShowCarteira((s) => !s)}
        >
          {showCarteira ? "Ocultar carteira" : "Mostrar carteira"}
        </button>
      </div>

      {/* ===================== Carteira por Cliente ===================== */}
      {showCarteira && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Carteira</h2>
          {porCliente.length === 0 && <div className="text-gray-500">Nenhuma cota encarteirada ainda.</div>}
          {porCliente.map((group) => (
            <ClienteBloco
              key={group.cliente.id}
              group={group}
              isAdmin={isAdmin}
              onViewVenda={(v) => openViewVenda(v, leadMap[v.lead_id])}
              onOpenCotaEditor={openCotaEditor}
            />
          ))}
        </section>
      )}

      {/* ===================== Modal Nova Venda ===================== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Nova Venda</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setLeadSearch("");
                }}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Pessoa (Lead)</label>
                <div className="flex flex-col gap-2">
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    placeholder="Buscar pelo nome do lead…"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                  <select
                    className="w-full border rounded-xl px-3 py-2"
                    value={form.lead_id ?? ""}
                    onChange={(e) => onSelectLead(e.target.value)}
                  >
                    <option value="">Selecione um lead…</option>
                    {filteredLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} {l.telefone ? `• ${l.telefone}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600">Telefone</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-gray-50"
                  value={leadMap[form.lead_id as string]?.telefone ?? ""}
                  readOnly
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">CPF / CNPJ *</label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  value={formatCPF(form.cpf ?? "")}
                  onChange={(e) => onFormChange("cpf", e.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Data da Venda</label>
                <input
                  type="date"
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.data_venda ?? ""}
                  onChange={(e) => onFormChange("data_venda", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Data de Nascimento</label>
                <input
                  type="date"
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.data_nascimento ?? ""}
                  onChange={(e) => onFormChange("data_nascimento", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Vendedor</label>
                <input className="w-full border rounded-xl px-3 py-2 bg-gray-50" value={userName} readOnly />
              </div>

              {/* Ordem: Administradora -> Produto -> Tabela */}
              <div>
                <label className="text-sm text-gray-600">Administradora</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={(form.administradora as string) ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((f) => {
                      const admId = simAdmins.find((a) => a.name === value)?.id;
                      let nextProduto = f.produto as Produto;

                      if (admId) {
                        const segSet = new Set(
                          simTables.filter((t) => t.admin_id === admId).map((t) => normalizeSegmentLabel(t.segmento))
                        );

                        const allowed = PRODUTOS.filter((p) => {
                          const candidates = segmentCandidatesForProduto(p);
                          return candidates.some((c) => segSet.has(c));
                        });

                        if (allowed.length && !allowed.includes(nextProduto as Produto)) nextProduto = allowed[0];
                      }

                      return { ...f, administradora: value, produto: nextProduto, tabela: "" };
                    });
                  }}
                >
                  <option value="">Selecione a administradora…</option>
                  {adminNames.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Produto (Segmento)</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.produto as Produto}
                  onChange={(e) => onFormChange("produto", e.target.value as Produto)}
                >
                  {produtoOptionsForAdmin.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Tabela</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.tabela ?? ""}
                  onChange={(e) => onFormChange("tabela", e.target.value)}
                  disabled={tabelaOptionsForForm.length === 0}
                >
                  <option value="">
                    {tabelaOptionsForForm.length ? "Selecione a tabela…" : "Sem tabelas para este segmento"}
                  </option>
                  {tabelaOptionsForForm.map((t) => (
                    <option key={t.id} value={t.nome_tabela}>
                      {t.nome_tabela}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Forma da Venda</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.forma_venda as FormaVenda}
                  onChange={(e) => onFormChange("forma_venda", e.target.value as FormaVenda)}
                >
                  {FORMAS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Número da Proposta *</label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.numero_proposta ?? ""}
                  onChange={(e) => onFormChange("numero_proposta", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Valor da Venda</label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  value={(form.valor_venda as any) ?? ""}
                  onChange={(e) => onFormChange("valor_venda", e.target.value)}
                  placeholder="R$ 0,00"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Tipo da Venda</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.tipo_venda ?? "Normal"}
                  onChange={(e) => onFormChange("tipo_venda", e.target.value)}
                >
                  <option>Normal</option>
                  <option>Contemplada</option>
                  <option>Bolsão</option>
                </select>
              </div>

              {form.tipo_venda === "Bolsão" && (
                <div>
                  <label className="text-sm text-gray-600">Grupo (Bolsão)</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    value={form.grupo ?? ""}
                    onChange={(e) => onFormChange("grupo", e.target.value)}
                    placeholder="Informe o número do grupo"
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Descrição da Venda</label>
                <textarea
                  className="w-full border rounded-xl px-3 py-2"
                  rows={3}
                  value={form.descricao ?? ""}
                  onChange={(e) => onFormChange("descricao", e.target.value)}
                  placeholder="Estratégias de contemplação, observações…"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setLeadSearch("");
                }}
                className="px-4 py-2 rounded-xl border"
              >
                Cancelar
              </button>
              <button onClick={registrarVenda} className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90">
                Registrar Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Venda Pendente */}
      <EditarVendaPendenteModal
        open={editVendaModal.open}
        venda={editVendaModal.venda}
        leads={leads}
        onClose={() => setEditVendaModal({ open: false, venda: undefined })}
        onSave={salvarEdicaoPendente}
      />

      {/* Modal Ver Venda */}
      {viewVendaModal.open && viewVendaModal.venda && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Detalhes da Venda</h3>
              <button onClick={() => setViewVendaModal({ open: false })} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>

            {(() => {
              const v = viewVendaModal.venda!;
              const lead = viewVendaModal.lead;
              const vendedor = users.find((u) => u.auth_user_id === v.vendedor_id);
              const vendedorNome = vendedor?.nome || vendedor?.email || v.vendedor_id;

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Cliente</div>
                    <div>{lead?.nome ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Telefone</div>
                    <div>{lead?.telefone ?? "—"}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">CPF / CNPJ</div>
                    <div>{formatCPF(v.cpf ?? "") || "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Data de Nascimento</div>
                    <div>{formatDateBR(v.data_nascimento)}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Data da Venda</div>
                    <div>{formatDateBR(v.data_venda)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Vendedor</div>
                    <div>{vendedorNome}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Segmento</div>
                    <div>{v.produto}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Administradora</div>
                    <div>{v.administradora}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Tabela</div>
                    <div>{v.tabela ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Forma da Venda</div>
                    <div>{v.forma_venda}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Nº Proposta</div>
                    <div>{v.numero_proposta}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Valor</div>
                    <div>{currency(v.valor_venda || 0)}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Status</div>
                    <div>{v.status}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Código</div>
                    <div>{v.codigo ?? "—"}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Grupo</div>
                    <div>{v.grupo ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Cota</div>
                    <div>{v.cota ?? "—"}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Cancelada em</div>
                    <div>{formatDateTimeBR(v.cancelada_em)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Reativada em</div>
                    <div>{formatDateTimeBR(v.reativada_em)}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Contemplada</div>
                    <div>{v.contemplada ? "Sim" : "Não"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Data da contemplação</div>
                    <div>{formatDateBR(v.data_contemplacao)}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Tipo de lance</div>
                    <div>{v.contemplacao_tipo ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">% do lance</div>
                    <div>{v.contemplacao_pct != null ? `${formatPct4(v.contemplacao_pct)}%` : "—"}</div>
                  </div>

                  <div>
                    <div className="text-gray-500">Inadimplente</div>
                    <div>{v.inad ? "Sim" : "Não"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Inadimplência (início)</div>
                    <div>{formatDateBR(v.inad_em)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Inadimplência (reversão)</div>
                    <div>{formatDateBR(v.inad_revertida_em)}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-gray-500">Descrição</div>
                    <div className="whitespace-pre-wrap">{v.descricao ?? "—"}</div>
                  </div>
                </div>
              );
            })()}

            <div className="text-right">
              <button className="px-4 py-2 rounded-xl border" onClick={() => setViewVendaModal({ open: false })}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Transferir Cota */}
      {transferModal.open && transferModal.venda && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Transferir Cota • {transferModal.venda.numero_proposta}</h3>
              <button
                onClick={() => setTransferModal({ open: false, venda: undefined })}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Novo Cliente (Lead)</label>
                <div className="flex flex-col gap-2">
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    placeholder="Buscar pelo nome do lead…"
                    value={transferSearch}
                    onChange={(e) => setTransferSearch(e.target.value)}
                  />
                  <select
                    className="w-full border rounded-xl px-3 py-2"
                    value={transferLeadId}
                    onChange={(e) => setTransferLeadId(e.target.value)}
                  >
                    <option value="">Selecione um lead…</option>
                    {filteredTransferLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} {l.telefone ? `• ${l.telefone}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600">CPF / CNPJ *</label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  value={formatCPF(transferCpf)}
                  onChange={(e) => setTransferCpf(e.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Data de Nascimento</label>
                <input
                  type="date"
                  className="w-full border rounded-xl px-3 py-2"
                  value={transferNascimento}
                  onChange={(e) => setTransferNascimento(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Nome do Lead</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-gray-50"
                  value={selectedTransferLead?.nome ?? ""}
                  readOnly
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Telefone</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-gray-50"
                  value={selectedTransferLead?.telefone ?? ""}
                  readOnly
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">E-mail</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-gray-50"
                  value={selectedTransferLead?.email ?? ""}
                  readOnly
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                className="px-4 py-2 rounded-xl border"
                onClick={() => setTransferModal({ open: false, venda: undefined })}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90"
                onClick={handleTransferSave}
              >
                Confirmar Transferência
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cadastrar Meta */}
      {metaOverlay.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Cadastrar Meta</h3>
              <button onClick={() => setMetaOverlay({ open: false })} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Vendedor</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={metaForm.vendedor_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    setMetaForm((p) => ({ ...p, vendedor_id: id }));
                    if (id) loadMetaForForm(id, metaForm.ano);
                    else setMetaForm((p) => ({ ...p, vendedor_id: "", m: Array(12).fill(0) }));
                  }}
                  disabled={!isAdmin}
                >
                  <option value="">Selecione</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Ano</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={metaForm.ano}
                  onChange={(e) => {
                    const newYear = Number(e.target.value);
                    setMetaForm((p) => ({ ...p, ano: newYear }));
                    if (metaForm.vendedor_id) loadMetaForForm(metaForm.vendedor_id, newYear);
                  }}
                >
                  {Array.from({ length: 6 }).map((_, i) => {
                    const y = new Date().getFullYear() - 1 + i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, i) => (
                <div key={i}>
                  <label className="text-sm text-gray-600">{m}</label>
                  <input
                    type="text"
                    className="w-full border rounded-xl px-3 py-2"
                    value={formatNumberBR(metaForm.m[i] || 0)}
                    onChange={(e) =>
                      setMetaForm((p) => {
                        const arr = [...p.m];
                        const raw = e.target.value;
                        const normalized = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
                        const n = normalized ? Number(normalized) : 0;
                        arr[i] = Number.isNaN(n) ? 0 : n;
                        return { ...p, m: arr };
                      })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button className="px-4 py-2 rounded-xl border" onClick={() => setMetaOverlay({ open: false })}>
                Cancelar
              </button>
              <button className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90" onClick={saveMeta}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editor de Cota */}
      {cotaEditor.open && cotaEditor.venda && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">Editar Cota • {cotaEditor.venda.numero_proposta}</h3>
                <p className="text-xs text-gray-500">
                  Escolha o tipo de edição. (Cancelamento/Reativação exigem data quando o código muda)
                </p>
              </div>
              <button onClick={closeCotaEditor} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>

            {cotaEditor.mode === "pick" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  className="text-left border rounded-2xl p-4 hover:bg-gray-50"
                  onClick={() => setCotaEditor((p) => ({ ...p, mode: "cota_codigo" }))}
                >
                  <div className="font-medium">🔢 Alterar Grupo / Cota / Código</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Se mudar de <strong>00 → outro</strong> pede data de cancelamento. Se voltar <strong>outro → 00</strong>{" "}
                    pede data de reativação.
                  </div>
                </button>

                <button
                  className="text-left border rounded-2xl p-4 hover:bg-gray-50"
                  onClick={() => setCotaEditor((p) => ({ ...p, mode: "transfer" }))}
                >
                  <div className="font-medium">⇄ Transferir</div>
                  <div className="text-sm text-gray-600 mt-1">Abre o overlay de transferência para outro lead.</div>
                </button>

                <button
                  className="text-left border rounded-2xl p-4 hover:bg-gray-50"
                  onClick={() => setCotaEditor((p) => ({ ...p, mode: "contemplacao" }))}
                >
                  <div className="font-medium">🏁 Contemplada</div>
                  <div className="text-sm text-gray-600 mt-1">Data + Tipo (lance) + % com 4 casas (ex.: 41,2542%).</div>
                </button>

                <button
                  className="text-left border rounded-2xl p-4 hover:bg-gray-50"
                  onClick={() => setCotaEditor((p) => ({ ...p, mode: "inad" }))}
                >
                  <div className="font-medium">⚠️ Inadimplência</div>
                  <div className="text-sm text-gray-600 mt-1">Marcar/desmarcar com data de início e data de reversão.</div>
                </button>
              </div>
            )}

            {cotaEditor.mode === "cota_codigo" &&
              (() => {
                const prevAtiva = isAtiva(cotaEditor.venda!.codigo);
                const nextAtiva = isAtiva(ceCodigo);

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm text-gray-600">Grupo</label>
                        <input
                          className="w-full border rounded-xl px-3 py-2"
                          value={ceGrupo}
                          onChange={(e) => setCeGrupo(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-sm text-gray-600">Cota</label>
                        <input
                          className="w-full border rounded-xl px-3 py-2"
                          value={ceCota}
                          onChange={(e) => setCeCota(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-sm text-gray-600">Código</label>
                        <input
                          className="w-full border rounded-xl px-3 py-2"
                          value={ceCodigo}
                          onChange={(e) => setCeCodigo(e.target.value)}
                        />
                        <div className="text-xs text-gray-500 mt-1">
                          Ativa = <strong>00</strong>
                        </div>
                      </div>
                    </div>

                    {prevAtiva && !nextAtiva && (
                      <div className="border rounded-2xl p-4 bg-red-50">
                        <div className="font-medium text-red-800">
                          Cancelamento detectado (00 → {ceCodigo || "..."})
                        </div>
                        <div className="text-sm text-red-700 mt-1">
                          Informe a data do cancelamento para registrar em <code>cancelada_em</code>.
                        </div>
                        <div className="mt-3">
                          <label className="text-sm text-gray-700">Data do cancelamento</label>
                          <input
                            type="date"
                            className="w-full border rounded-xl px-3 py-2"
                            value={ceCancelDate}
                            onChange={(e) => setCeCancelDate(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {!prevAtiva && nextAtiva && (
                      <div className="border rounded-2xl p-4 bg-green-50">
                        <div className="font-medium text-green-800">
                          Reativação detectada ({cotaEditor.venda!.codigo} → 00)
                        </div>
                        <div className="text-sm text-green-700 mt-1">
                          Informe a data da reativação para registrar em <code>reativada_em</code>.
                        </div>
                        <div className="mt-3">
                          <label className="text-sm text-gray-700">Data da reativação</label>
                          <input
                            type="date"
                            className="w-full border rounded-xl px-3 py-2"
                            value={ceReativDate}
                            onChange={(e) => setCeReativDate(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <button
                        className="px-4 py-2 rounded-xl border"
                        onClick={() => setCotaEditor((p) => ({ ...p, mode: "pick" }))}
                      >
                        Voltar
                      </button>
                      <button
                        className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90"
                        onClick={saveCotaCodigo}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                );
              })()}

            {cotaEditor.mode === "transfer" && (
              <div className="space-y-4">
                <div className="border rounded-2xl p-4 bg-gray-50">
                  <div className="font-medium">Você está indo para o overlay de transferência</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Vamos abrir a tela de transferência para selecionar o novo lead e preencher CPF/CNPJ e nascimento.
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    className="px-4 py-2 rounded-xl border"
                    onClick={() => setCotaEditor((p) => ({ ...p, mode: "pick" }))}
                  >
                    Voltar
                  </button>
                  <button
                    className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90"
                    onClick={goTransferFromEditor}
                  >
                    Abrir Transferência
                  </button>
                </div>
              </div>
            )}

            {cotaEditor.mode === "contemplacao" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={ceContFlag}
                      onChange={(e) => setCeContFlag(e.target.checked)}
                    />
                    Marcar como contemplada
                  </label>
                </div>

                {ceContFlag && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm text-gray-600">Data da contemplação</label>
                      <input
                        type="date"
                        className="w-full border rounded-xl px-3 py-2"
                        value={ceContDate}
                        onChange={(e) => setCeContDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm text-gray-600">Tipo de lance</label>
                      <select
                        className="w-full border rounded-xl px-3 py-2"
                        value={ceContTipo}
                        onChange={(e) => setCeContTipo(e.target.value)}
                      >
                        <option value="">Selecione…</option>
                        <option value="Lance Livre">Lance Livre</option>
                        <option value="Primeiro Lance Fixo">Primeiro Lance Fixo</option>
                        <option value="Segundo Lance Fixo">Segundo Lance Fixo</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm text-gray-600">% do lance (4 casas)</label>
                      <input
                        className="w-full border rounded-xl px-3 py-2"
                        value={ceContPctRaw}
                        onChange={(e) => setCeContPctRaw(e.target.value)}
                        placeholder="Ex.: 41,2542%"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        Será salvo como <code>numeric(9,4)</code>.
                      </div>
                    </div>
                  </div>
                )}

                {!ceContFlag && (
                  <div className="border rounded-2xl p-4 bg-gray-50 text-sm text-gray-600">
                    Ao desmarcar, vamos limpar <code>data_contemplacao</code>, <code>contemplacao_tipo</code> e{" "}
                    <code>contemplacao_pct</code>.
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    className="px-4 py-2 rounded-xl border"
                    onClick={() => setCotaEditor((p) => ({ ...p, mode: "pick" }))}
                  >
                    Voltar
                  </button>
                  <button
                    className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90"
                    onClick={saveContemplacao}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}

            {cotaEditor.mode === "inad" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={ceInadFlag}
                      onChange={(e) => setCeInadFlag(e.target.checked)}
                    />
                    Marcar como inadimplente
                  </label>
                </div>

                {ceInadFlag ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-gray-600">Data que inadimpliu</label>
                      <input
                        type="date"
                        className="w-full border rounded-xl px-3 py-2"
                        value={ceInadEm}
                        onChange={(e) => setCeInadEm(e.target.value)}
                      />
                    </div>
                    <div className="border rounded-2xl p-4 bg-red-50 text-sm text-red-800">
                      Ao marcar, vamos salvar <code>inad = true</code> e <code>inad_em</code>. A reversão fica vazia.
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-gray-600">Data da reversão</label>
                      <input
                        type="date"
                        className="w-full border rounded-xl px-3 py-2"
                        value={ceInadRev}
                        onChange={(e) => setCeInadRev(e.target.value)}
                      />
                    </div>
                    <div className="border rounded-2xl p-4 bg-gray-50 text-sm text-gray-700">
                      Ao desmarcar, vamos salvar <code>inad = false</code> e registrar <code>inad_revertida_em</code>.
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    className="px-4 py-2 rounded-xl border"
                    onClick={() => setCotaEditor((p) => ({ ...p, mode: "pick" }))}
                  >
                    Voltar
                  </button>
                  <button
                    className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90"
                    onClick={saveInad}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Carteira;
