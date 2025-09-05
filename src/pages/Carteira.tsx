// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Tipos */
type Lead = { id: string; nome: string; telefone?: string | null };

type Produto =
  | "Automóvel"
  | "Imóvel"
  | "Serviço"
  | "Motocicleta"
  | "Pesados"
  | "Imóvel Estendido"
  | "Consórcio Ouro";

type Administradora = "Embracon" | "Banco do Brasil" | "HS Consórcios" | "Âncora" | "Maggi";
type FormaVenda = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";

type Venda = {
  id: string;
  lead_id: string;
  cpf: string;
  data_venda: string;
  vendedor_id: string;
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
  codigo: string | null; // "00" = ativa
  encarteirada_em: string | null;
  contemplada?: boolean | null;
  data_contemplacao?: string | null;
  tabela?: string | null;
  created_at: string;
  segmento?: string | null;
  data_nascimento?: string | null;
};

/** Constantes */
const PRODUTOS: Produto[] = [
  "Automóvel",
  "Imóvel",
  "Serviço",
  "Motocicleta",
  "Pesados",
  "Imóvel Estendido",
  "Consórcio Ouro",
];

const ADMINISTRADORAS: Administradora[] = ["Embracon", "Banco do Brasil", "HS Consórcios", "Âncora", "Maggi"];
const FORMAS: FormaVenda[] = ["Parcela Cheia", "Reduzida 25%", "Reduzida 50%"];

// Segmento -> Tabelas
const TABELAS: Record<Produto, string[]> = {
  Motocicleta: ["Moto"],
  Serviço: ["Serviço"],
  Automóvel: [
    "Automóvel Select Mais",
    "Automóvel Select Smart",
    "B Automóvel",
    "Automóvel B Mais",
    "Automóvel Select Estendido",
    "Automóvel Plano Estendido",
    "HS Meia Parcela",
    "HS Parcela Cheia",
  ],
  Pesados: ["Pesados Linear", "Pesados Sem Antecipação", "Pesados Com Antecipação"],
  Imóvel: [
    "Imóvel Select Mais",
    "Imóvel Select Smart",
    "Imóvel B Até 240 Mil",
    "Imóvel Acima de 250 Mil",
    "Imóvel Parceria Nacional B",
    "HS Meia Parcela",
    "HS Parcela Cheia",
  ],
  "Imóvel Estendido": [
    "Select Estendido",
    "Super Crédito Estendido",
    "Plano Estendido Im",
    "Select Estendido Prime",
  ],
  "Consórcio Ouro": [],
};

const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);

const isAtiva = (codigo: string | null) => (codigo?.trim() ?? "") === "00";

/** CPF utils */
const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const formatCPF = (s: string) => {
  const d = onlyDigits(s).slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)].filter(Boolean);
  return parts.length <= 3 ? parts.join(".") : `${parts[0]}.${parts[1]}.${parts[2]}-${parts[3]}`;
};
const validateCPF = (cpf: string) => {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (factor - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calc(d.slice(0, 9), 10);
  const d2 = calc(d.slice(0, 10), 11);
  return d1 === parseInt(d[9]) && d2 === parseInt(d[10]);
};

/** 🔧 Normalização de Produto -> Segmento */
function normalizeProdutoToSegmento(produto: Produto | string | null | undefined): string | null {
  const p = (produto || "").toString().trim();
  if (!p) return null;
  if (p === "Imóvel Estendido") return "Imóvel";
  if (p === "Serviço") return "Serviços";
  return p; // Automóvel, Imóvel, Motocicleta, Pesados, Consórcio Ouro…
}

/** Linhas (componentes filhos) */
type LinhaEncarteirarProps = {
  venda: Venda;
  lead?: Lead;
  canEncarteirar: boolean;
  onSubmit: (vendaId: string, grupo: string, cota: string, codigo: string) => Promise<void>;
  onDelete: (vendaId: string) => Promise<void>;
  onOpenEditarVenda: (v: Venda) => void;
};
const LinhaEncarteirar: React.FC<LinhaEncarteirarProps> = ({
  venda,
  lead,
  canEncarteirar,
  onSubmit,
  onDelete,
  onOpenEditarVenda,
}) => {
  const [grupo, setGrupo] = useState("");
  const [cota, setCota] = useState("");
  const [codigo, setCodigo] = useState("");

  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="flex items-center gap-2">
          <div className="font-medium">{lead?.nome ?? "—"}</div>
          <button
            title="Ver/Editar venda"
            className="text-gray-500 hover:text-gray-800"
            onClick={() => onOpenEditarVenda(venda)}
          >
            👁️
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
  onSave: (patch: Partial<Venda>) => Promise<void>;
  onViewDescricao: (title: string, text: string | null) => void;
  isAdmin: boolean;
};
const LinhaCota: React.FC<LinhaCotaProps> = ({ venda, onSave, onViewDescricao, isAdmin }) => {
  const ativa = isAtiva(venda.codigo);
  const [edit, setEdit] = useState(false);
  const [grupo, setGrupo] = useState(venda.grupo ?? "");
  const [cota, setCota] = useState(venda.cota ?? "");
  const [codigo, setCodigo] = useState(venda.codigo ?? "");
  const [valor, setValor] = useState<number>(venda.valor_venda);
  const [adm, setAdm] = useState<Administradora>(venda.administradora);
  const [flagCont, setFlagCont] = useState<boolean>(!!venda.contemplada);
  const [dataCont, setDataCont] = useState<string>(venda.data_contemplacao ?? "");

  const saveEdit = async () => {
    setEdit(false);
    const segmento = normalizeProdutoToSegmento(venda.produto);
    await onSave({ grupo, cota, codigo, valor_venda: valor, administradora: adm, segmento: segmento ?? undefined });
  };
  const saveContemplacao = async () => {
    if (flagCont && !dataCont) {
      alert("Informe a data da contemplação.");
      return;
    }
    await onSave({ contemplada: flagCont, data_contemplacao: flagCont ? dataCont : null });
  };

  return (
    <tr className="border-t">
      <td className="p-2">
        <span
          className={`px-2 py-1 rounded-full text-xs ${
            ativa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {ativa ? "Ativa" : "Cancelada"}
        </span>
      </td>
      <td className="p-2">
        {edit ? (
          <select
            className="border rounded px-2 py-1"
            value={adm}
            onChange={(e) => setAdm(e.target.value as Administradora)}
          >
            {ADMINISTRADORAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : (
          venda.administradora
        )}
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <span>{venda.numero_proposta}</span>
          <button
            title="Ver descrição"
            className="text-gray-500 hover:text-gray-800"
            onClick={() =>
              onViewDescricao(`Descrição - Proposta ${venda.numero_proposta}`, venda.descricao)
            }
          >
            👁️
          </button>
        </div>
      </td>
      {/* NOVA COLUNA: Segmento (produto) */}
      <td className="p-2">{venda.produto}</td>
      <td className="p-2">
        {edit ? (
          <input
            className="border rounded px-2 py-1 w-24"
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
          />
        ) : (
          venda.grupo ?? "—"
        )}
      </td>
      <td className="p-2">
        {edit ? (
          <input
            className="border rounded px-2 py-1 w-20"
            value={cota}
            onChange={(e) => setCota(e.target.value)}
          />
        ) : (
          venda.cota ?? "—"
        )}
      </td>
      <td className="p-2">
        {edit ? (
          <input
            className="border rounded px-2 py-1 w-20"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        ) : (
          venda.codigo ?? "—"
        )}
      </td>
      <td className="p-2">
        {edit ? (
          <input
            className="border rounded px-2 py-1 w-28"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            type="number"
            step="0.01"
          />
        ) : (
          currency(venda.valor_venda ?? 0)
        )}
      </td>
      <td className="p-2">
        {isAdmin ? (
          edit ? (
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-[#1E293F] text-white hover:opacity-90"
                onClick={saveEdit}
              >
                Salvar
              </button>
              <button className="px-3 py-1 rounded border" onClick={() => setEdit(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button className="px-3 py-1 rounded border" onClick={() => setEdit(true)}>
              ✏️ Editar
            </button>
          )
        ) : (
          <span className="text-xs text-gray-400">Somente admin edita</span>
        )}
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-1"
              checked={flagCont}
              onChange={(e) => setFlagCont(e.target.checked)}
            />
            Contemplada
          </label>
          {flagCont && (
            <>
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={dataCont}
                onChange={(e) => setDataCont(e.target.value)}
              />
              <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={saveContemplacao}>
                Salvar
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

/** Bloco por cliente */
type ClienteGroup = {
  cliente: Lead;
  itens: Venda[];
  totalAtivas: number;
  qtdAtivas: number;
  segmentos: Set<string>;
};
type ClienteBlocoProps = {
  group: ClienteGroup;
  onSaveVenda: (v: Venda, patch: Partial<Venda>) => Promise<void>;
  onViewAllDescricoes: (
    title: string,
    itens: Array<{ proposta: string; descricao: string | null }>
  ) => void;
  isAdmin: boolean;
};
const ClienteBloco: React.FC<ClienteBlocoProps> = ({
  group,
  onSaveVenda,
  onViewAllDescricoes,
  isAdmin,
}) => {
  const [open, setOpen] = useState(false);
  const segs = Array.from(group.segmentos).join("; ");
  return (
    <div className="border rounded-2xl p-4">
      <div className="w-full flex items-center justify-between">
        <button className="text-left" onClick={() => setOpen((o) => !o)}>
          <div className="font-medium">
            {group.cliente.nome}
            <span className="text-xs text-gray-500 ml-2">
              {group.cliente.telefone ?? ""}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            Total Ativas: <strong>{currency(group.totalAtivas)}</strong> • Qtd:{" "}
            <strong>{group.qtdAtivas}</strong> • Segmentos: {segs}
          </div>
        </button>
        <button
          title="Ver descrições do cliente"
          className="text-gray-500 hover:text-gray-800"
          onClick={() =>
            onViewAllDescricoes(
              `Descrições - ${group.cliente.nome}`,
              group.itens.map((v) => ({ proposta: v.numero_proposta, descricao: v.descricao }))
            )
          }
        >
          👁️
        </button>
      </div>
      {open && (
        <div className="mt-3 overflow-auto">
          <table className="min-w-[1100px] w-full border border-gray-200 rounded-xl">
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
                <th className="text-left p-2">Editar</th>
                <th className="text-left p-2">Contemplação</th>
              </tr>
            </thead>
            <tbody>
              {group.itens.map((v) => (
                <LinhaCota
                  key={v.id}
                  venda={v}
                  onSave={(patch) => onSaveVenda(v, patch)}
                  onViewDescricao={(t, d) =>
                    onViewAllDescricoes(t, [{ proposta: v.numero_proposta, descricao: d }])
                  }
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

/** Página Carteira */
const Carteira: React.FC = () => {
  const [userId, setUserId] = useState<string>("");
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
    administradora: "Embracon",
    forma_venda: "Parcela Cheia",
    tipo_venda: "Normal",
    descricao: "",
    grupo: "",
    tabela: "",
    data_nascimento: "",
  });
  const [editVendaModal, setEditVendaModal] = useState<{
    open: boolean;
    venda?: Venda;
  }>({ open: false });
  const [descModal, setDescModal] = useState<{
    open: boolean;
    title: string;
    text: string;
  }>({ open: false, title: "", text: "" });

  const [assembleia, setAssembleia] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [oferta, setOferta] = useState<
    Array<{
      administradora: string;
      grupo: string;
      cota: string | null;
      referencia?: string | null;
      participantes?: number | null;
      mediana?: number | null;
      contemplados?: number | null;
    }>
  >([]);

  useEffect(() => {
    setForm((f) => ({ ...f, tabela: "" }));
  }, [form.produto]);

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
        setUserName(
          authData.user?.user_metadata?.nome ?? uemail ?? "Vendedor"
        );

        // Admin (robusto)
        let adminFlag = false;
        try {
          const { data, error } = await supabase.rpc("is_admin_email", {
            e: uemail,
          });
          if (!error) adminFlag = !!data;
        } catch {}
        if (!adminFlag) {
          try {
            const { data } = await supabase
              .from("admins")
              .select("email")
              .eq("email", uemail)
              .maybeSingle();
            adminFlag = !!data;
          } catch {}
        }
        if (!adminFlag) {
          try {
            const { data } = await supabase
              .from("usuarios")
              .select("email, perfil, role, app_metadata, user_metadata")
              .eq("email", uemail)
              .maybeSingle();
            if (data) {
              const p = (data.perfil || data.role || "")
                .toString()
                .toLowerCase();
              const roles = (data.app_metadata?.roles || []).map((x: any) =>
                String(x).toLowerCase()
              );
              adminFlag =
                ["admin", "administrador", "adm", "gestor", "gestão", "diretoria"].some(
                  (k) => p.includes(k)
                ) ||
                roles.includes("admin") ||
                data.user_metadata?.is_admin === true;
            }
          } catch {}
        }
        setIsAdmin(adminFlag);

        const { data: lds } = await supabase
          .from("leads")
          .select("id,nome,telefone")
          .order("nome", { ascending: true });
        const leadsArr = lds ?? [];
        setLeads(leadsArr);
        setLeadMap(Object.fromEntries(leadsArr.map((l: any) => [l.id, l])));

        // pendentes/encarteiradas com filtro por perfil
        const pendQuery = supabase
          .from("vendas")
          .select("*")
          .eq("status", "nova")
          .order("created_at", { ascending: false });
        const encQuery = supabase
          .from("vendas")
          .select("*")
          .eq("status", "encarteirada")
          .order("created_at", { ascending: false });
        if (!adminFlag) {
          pendQuery.eq("vendedor_id", uid);
          encQuery.eq("vendedor_id", uid);
        }
        const [{ data: pend }, { data: enc }] = await Promise.all([
          pendQuery,
          encQuery,
        ]);
        setPendentes(pend ?? []);
        setEncarteiradas(enc ?? []);
      } catch (e: any) {
        setErr(e.message || "Falha ao carregar Carteira.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pendentesComNome = useMemo(
    () => pendentes.map((v) => ({ venda: v, lead: leadMap[v.lead_id] })),
    [pendentes, leadMap]
  );

  const encarteiradasFiltradas = useMemo(() => {
    if (!q.trim()) return encarteiradas;
    const s = q.toLowerCase();
    return encarteiradas.filter((v) =>
      leadMap[v.lead_id]?.nome?.toLowerCase().includes(s)
    );
  }, [q, encarteiradas, leadMap]);

  const totalAtivas = useMemo(
    () =>
      encarteiradas.reduce(
        (a, v) => (isAtiva(v.codigo) ? a + (v.valor_venda || 0) : a),
        0
      ),
    [encarteiradas]
  );
  const totalCanceladas = useMemo(
    () =>
      encarteiradas.reduce(
        (a, v) => (!isAtiva(v.codigo) ? a + (v.valor_venda || 0) : a),
        0
      ),
    [encarteiradas]
  );
  const totalContempladas = useMemo(
    () =>
      encarteiradas.reduce(
        (a, v) => (v.contemplada ? a + (v.valor_venda || 0) : a),
        0
      ),
    [encarteiradas]
  );

  const porCliente: ClienteGroup[] = useMemo(() => {
    const map: Record<string, ClienteGroup> = {};
    for (const v of encarteiradasFiltradas) {
      const lead = leadMap[v.lead_id];
      if (!lead) continue;
      if (!map[lead.id])
        map[lead.id] = {
          cliente: lead,
          itens: [],
          totalAtivas: 0,
          qtdAtivas: 0,
          segmentos: new Set(),
        };
      map[lead.id].itens.push(v);
      if (isAtiva(v.codigo)) {
        map[lead.id].totalAtivas += v.valor_venda || 0;
        map[lead.id].qtdAtivas += 1;
      }
      map[lead.id].segmentos.add(v.produto);
    }
    return Object.values(map).sort((a, b) =>
      a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR", {
        sensitivity: "base",
      })
    );
  }, [encarteiradasFiltradas, leadMap]);

  const onFormChange = (k: keyof Venda, val: any) =>
    setForm((f) => ({ ...f, [k]: val }));

  async function insertVenda(payload: any) {
    let { error } = await supabase.from("vendas").insert(payload as any);
    if (error && /data_nascimento/.test(error.message || "")) {
      const { error: e2 } = await supabase
        .from("vendas")
        .insert({ ...payload, data_nascimento: undefined } as any);
      if (e2) throw e2;
    } else if (error) throw error;
  }
  async function updateVenda(id: string, patch: any) {
    let { error } = await supabase.from("vendas").update(patch as any).eq("id", id);
    if (error && /data_nascimento/.test(error.message || "")) {
      const { error: e2 } = await supabase
        .from("vendas")
        .update({ ...patch, data_nascimento: undefined } as any)
        .eq("id", id);
      if (e2) throw e2;
    } else if (error) throw error;
  }

  const registrarVenda = async () => {
    try {
      if (!form.lead_id) throw new Error("Selecione o Lead.");
      if (!form.cpf?.trim()) throw new Error("CPF é obrigatório.");
      if (!validateCPF(form.cpf)) throw new Error("CPF inválido.");
      if (!form.numero_proposta?.trim())
        throw new Error("Número da proposta é obrigatório.");
      const valor = Number(
        (form.valor_venda as any)?.toString().replace(/\./g, "").replace(",", ".")
      );
      if (Number.isNaN(valor)) throw new Error("Valor inválido.");

      const segmento = normalizeProdutoToSegmento(form.produto as Produto);
      const payload: Partial<Venda> = {
        lead_id: form.lead_id,
        cpf: onlyDigits(form.cpf!),
        data_venda: form.data_venda!,
        vendedor_id: userId,
        produto: form.produto as Produto,
        administradora: form.administradora as Administradora,
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
      };
      if (form.tipo_venda === "Bolsão" && !form.grupo?.trim())
        throw new Error("Informe o número do Grupo (Bolsão).");

      await insertVenda(payload);
      const pendQuery = supabase
        .from("vendas")
        .select("*")
        .eq("status", "nova")
        .order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes(pend ?? []);
      setForm({
        cpf: "",
        data_venda: new Date().toISOString().slice(0, 10),
        produto: "Automóvel",
        administradora: "Embracon",
        forma_venda: "Parcela Cheia",
        tipo_venda: "Normal",
        descricao: "",
        grupo: "",
        tabela: "",
        data_nascimento: "",
      });
      setShowModal(false);
    } catch (e: any) {
      alert(e.message ?? "Erro ao registrar venda.");
    }
  };

  const encarteirar = async (
    vendaId: string,
    grupo: string,
    cota: string,
    codigo: string
  ) => {
    try {
      if (!isAdmin) throw new Error("Somente administradores podem encarteirar.");
      if (!grupo?.trim() || !cota?.trim() || !codigo?.trim())
        throw new Error("Preencha Grupo, Cota e Código.");

      const { data: vOne, error: selErr } = await supabase
        .from("vendas")
        .select("produto")
        .eq("id", vendaId)
        .maybeSingle();
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
          const q = supabase
            .from("vendas")
            .select("*")
            .eq("status", "nova")
            .order("created_at", { ascending: false });
          if (!isAdmin) q.eq("vendedor_id", userId);
          return await q;
        })(),
        (async () => {
          const q = supabase
            .from("vendas")
            .select("*")
            .eq("status", "encarteirada")
            .order("created_at", { ascending: false });
          if (!isAdmin) q.eq("vendedor_id", userId);
          return await q;
        })(),
      ]);
      setPendentes(pend ?? []);
      setEncarteiradas(enc ?? []);
    } catch (e: any) {
      alert(e.message ?? "Erro ao encarteirar.");
    }
  };

  const excluirVenda = async (vendaId: string) => {
    try {
      const { error } = await supabase.from("vendas").delete().eq("id", vendaId);
      if (error) throw error;
      const pendQuery = supabase
        .from("vendas")
        .select("*")
        .eq("status", "nova")
        .order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes(pend ?? []);
    } catch (e: any) {
      alert(e.message ?? "Erro ao excluir.");
    }
  };

  const salvarEdicao = async (v: Venda, patch: Partial<Venda>) => {
    try {
      const seg = normalizeProdutoToSegmento(v.produto);
      await updateVenda(v.id, { ...patch, segmento: seg ?? undefined });
      const encQuery = supabase
        .from("vendas")
        .select("*")
        .eq("status", "encarteirada")
        .order("created_at", { ascending: false });
      if (!isAdmin) encQuery.eq("vendedor_id", userId);
      const { data: enc } = await encQuery;
      setEncarteiradas(enc ?? []);
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar edição.");
    }
  };

  const salvarEdicaoPendente = async (venda: Venda, novo: Partial<Venda>) => {
    try {
      if (novo.cpf && !validateCPF(novo.cpf)) throw new Error("CPF inválido.");
      if (novo.numero_proposta && !novo.numero_proposta.trim())
        throw new Error("Informe o número da proposta.");
      const patch: any = { ...novo };
      if (patch.cpf) patch.cpf = onlyDigits(patch.cpf);
      if (patch.valor_venda != null) {
        const valor = Number(patch.valor_venda);
        if (Number.isNaN(valor)) throw new Error("Valor inválido.");
        patch.valor_venda = valor;
      }
      if (patch.produto) patch.segmento = normalizeProdutoToSegmento(patch.produto as Produto);
      await updateVenda(venda.id, patch);
      const pendQuery = supabase
        .from("vendas")
        .select("*")
        .eq("status", "nova")
        .order("created_at", { ascending: false });
      if (!isAdmin) pendQuery.eq("vendedor_id", userId);
      const { data: pend } = await pendQuery;
      setPendentes(pend ?? []);
      setEditVendaModal({ open: false, venda: undefined });
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar.");
    }
  };

  /**
   * ✅ Oferta de Lance
   * Agora busca tudo no servidor para a data selecionada:
   *  - Traz os grupos da data em gestao_grupos_norm
   *  - Busca as encarteiradas visíveis (admin vê todas; vendedor vê as dele)
   *  - Gera 1 linha por cota encarteirada cujo grupo está naquela assembleia
   */
  const listarOferta = async () => {
    try {
      // 1) Grupos da data (view normalizada)
      const { data: gruposNorm, error: gErr } = await supabase
        .from("gestao_grupos_norm")
        .select("adm_norm,grupo_norm,referencia,participantes,mediana,contemplados")
        .eq("assembleia_date", assembleia);
      if (gErr) throw gErr;

      // Mapa adm::grupo normalizado
      const gmap = new Map<
        string,
        { referencia?: string | null; participantes?: number | null; mediana?: number | null; contemplados?: number | null }
      >();
      for (const g of gruposNorm ?? []) {
        const key = `${String(g.adm_norm || "").trim()}::${String(g.grupo_norm || "").trim()}`;
        gmap.set(key, {
          referencia: g.referencia ?? null,
          participantes: g.participantes ?? null,
          mediana: g.mediana ?? null,
          contemplados: g.contemplados ?? null,
        });
      }
      if (gmap.size === 0) {
        setOferta([]);
        return;
      }

      // 2) Buscar encarteiradas atuais, visíveis ao perfil
      const encQuery = supabase
        .from("vendas")
        .select("administradora,grupo,cota,contemplada,vendedor_id,status")
        .eq("status", "encarteirada")
        .not("grupo", "is", null)
        .not("cota", "is", null);
      if (!isAdmin) encQuery.eq("vendedor_id", userId);

      const { data: encNow, error: eErr } = await encQuery;
      if (eErr) throw eErr;

      // 3) Cruzamento por chave normalizada; 1 linha por cota não contemplada
      const linhas: any[] = [];
      for (const v of encNow ?? []) {
        if (v.contemplada === true) continue;
        const key = `${String(v.administradora || "").toLowerCase().trim()}::${String(v.grupo || "").trim()}`;
        const ginfo = gmap.get(key);
        if (!ginfo) continue; // grupo não está na assembleia da data
        linhas.push({
          administradora: v.administradora,
          grupo: String(v.grupo),
          cota: v.cota,
          referencia: (ginfo.referencia && String(ginfo.referencia).trim() !== "") ? ginfo.referencia : null,
          participantes: ginfo.participantes ?? null,
          mediana: ginfo.mediana ?? null,
          contemplados: ginfo.contemplados ?? null,
        });
      }

      setOferta(linhas);
    } catch (e: any) {
      alert(e.message ?? "Erro ao listar.");
    }
  };

  const exportarOfertaPDF = () => {
    const el = document.getElementById("relatorio-oferta");
    if (!el) return;
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return;
    const style = `<style>body{font-family:Arial,sans-serif;padding:24px}h1{margin:0 0 12px 0}.grid{width:100%;border-collapse:collapse;margin-top:12px}.grid th,.grid td{border:1px solid #e5e7eb;padding:8px;font-size:12px}.logo{height:40px;margin-bottom:12px}</style>`;
    win.document.write(
      `<html><head><title>Oferta de Lance - Consulmax</title>${style}</head><body><img src="/consulmax-logo.png" class="logo" onerror="this.style.display='none'"/><h1>Oferta de Lance</h1>${el.innerHTML}<script>window.print();setTimeout(()=>window.close(),300);</script></body></html>`
    );
    win.document.close();
  };

  if (loading) return <div className="p-6 text-sm text-gray-600">Carregando carteira…</div>;
  if (err) return <div className="p-6 text-red-600">Erro: {err}</div>;

  const tabelaOptions = TABELAS[(form.produto as Produto) || "Automóvel"] || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Carteira</h1>
          <p className="text-gray-500 text-sm">Gerencie vendas, encarteiramento e oferta de lance.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90"
        >
          + Nova Venda
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar cliente pelo nome…"
          className="w-full border rounded-xl px-3 py-2 outline-none focus:ring"
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Encarteirar</h2>
          <span className="text-sm text-gray-500">{pendentes.length} nova(s) venda(s)</span>
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
                  onOpenEditarVenda={(v) => setEditVendaModal({ open: true, venda: v })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
        <button
          className="ml-auto px-4 py-2 rounded-xl border hover:bg-gray-50"
          onClick={() => setShowCarteira((s) => !s)}
        >
          {showCarteira ? "Ocultar carteira" : "Mostrar carteira"}
        </button>
      </div>

      {showCarteira && (
        <section className="space-y-3">
          {porCliente.length === 0 && (
            <div className="text-gray-500">Nenhuma cota encarteirada ainda.</div>
          )}
          {porCliente.map((group) => (
            <ClienteBloco
              key={group.cliente.id}
              group={group}
              onSaveVenda={salvarEdicao}
              isAdmin={isAdmin}
              onViewAllDescricoes={(title, itens) =>
                setDescModal({
                  open: true,
                  title,
                  text:
                    itens
                      .map((x) => `Proposta ${x.proposta}: ${x.descricao || "—"}`)
                      .join("\n") || "Sem descrições",
                })
              }
            />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">Oferta de Lance</h2>
          <div className="text-sm text-gray-500">(Data da Assembleia)</div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={assembleia}
            onChange={(e) => setAssembleia(e.target.value)}
            className="border rounded-xl px-3 py-2"
          />
          <button
            onClick={listarOferta}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90"
          >
            Listar
          </button>
          <button
            onClick={exportarOfertaPDF}
            className="px-4 py-2 rounded-xl border hover:bg-gray-50"
          >
            Exportar PDF
          </button>
        </div>
        <div id="relatorio-oferta" className="overflow-auto">
          <table className="min-w-[880px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Referência</th>
                <th className="text-left p-2">Participantes</th>
                <th className="text-left p-2">Mediana</th>
                <th className="text-left p-2">Contemplados</th>
              </tr>
            </thead>
            <tbody>
              {oferta.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={7}>
                    Nenhum grupo com assembleia nesta data.
                  </td>
                </tr>
              )}
              {oferta.map((o, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{o.administradora}</td>
                  <td className="p-2">{o.grupo}</td>
                  <td className="p-2">{o.cota ?? "—"}</td>
                  <td className="p-2">{o.referencia ?? "—"}</td>
                  <td className="p-2">{o.participantes ?? "—"}</td>
                  <td className="p-2">{o.mediana != null ? `${o.mediana}%` : "—"}</td>
                  <td className="p-2">{o.contemplados ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Nova Venda */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Nova Venda</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Pessoa (Lead)</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.lead_id ?? ""}
                  onChange={(e) => onFormChange("lead_id", e.target.value)}
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
                <label className="text-sm text-gray-600">Telefone</label>
                <input
                  className="w-full border rounded-xl px-3 py-2 bg-gray-50"
                  value={leadMap[form.lead_id as string]?.telefone ?? ""}
                  readOnly
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">CPF *</label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  value={formatCPF(form.cpf ?? "")}
                  onChange={(e) => onFormChange("cpf", e.target.value)}
                  placeholder="000.000.000-00"
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
                <label className="text_sm text_gray-600">Vendedor</label>
                <input className="w-full border rounded-xl px-3 py-2 bg-gray-50" value={userName} readOnly />
              </div>

              <div>
                <label className="text-sm text-gray-600">Produto (Segmento)</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.produto as Produto}
                  onChange={(e) => onFormChange("produto", e.target.value as Produto)}
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
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.tabela ?? ""}
                  onChange={(e) => onFormChange("tabela", e.target.value)}
                  disabled={(TABELAS[(form.produto as Produto) || "Automóvel"] || []).length === 0}
                >
                  <option value="">
                    {(TABELAS[(form.produto as Produto) || "Automóvel"] || []).length
                      ? "Selecione a tabela…"
                      : "Sem tabelas para este segmento"}
                  </option>
                  {(TABELAS[(form.produto as Produto) || "Automóvel"] || []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Administradora</label>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.administradora as Administradora}
                  onChange={(e) =>
                    onFormChange("administradora", e.target.value as Administradora)
                  }
                >
                  {ADMINISTRADORAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
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
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border">
                Cancelar
              </button>
              <button
                onClick={registrarVenda}
                className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90"
              >
                Registrar Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver/Editar venda pendente */}
      {editVendaModal.open && editVendaModal.venda && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                Venda • {editVendaModal.venda.numero_proposta}
              </h3>
              <button
                onClick={() => setEditVendaModal({ open: false })}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
            {(() => {
              const v = editVendaModal.venda!;
              const [tmp, setTmp] = useState<Partial<Venda>>({
                lead_id: v.lead_id,
                cpf: v.cpf,
                data_venda: v.data_venda,
                produto: v.produto,
                administradora: v.administradora,
                forma_venda: v.forma_venda,
                numero_proposta: v.numero_proposta,
                valor_venda: v.valor_venda,
                tipo_venda: v.tipo_venda,
                descricao: v.descricao,
                tabela: v.tabela,
                grupo: v.grupo || "",
                data_nascimento: v.data_nascimento || "",
              });
              const Comp = () => (
                <>
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
                      <label className="text-sm text-gray-600">CPF</label>
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
                        onChange={(e) =>
                          setTmp((p) => ({ ...p, data_nascimento: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Produto</label>
                      <select
                        className="w-full border rounded-xl px-3 py-2"
                        value={tmp.produto as Produto}
                        onChange={(e) =>
                          setTmp((p) => ({ ...p, produto: e.target.value as Produto }))
                        }
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
                      <select
                        className="w-full border rounded-xl px-3 py-2"
                        value={tmp.tabela ?? ""}
                        onChange={(e) => setTmp((p) => ({ ...p, tabela: e.target.value }))}
                        disabled={
                          (TABELAS[(tmp.produto as Produto) || "Automóvel"] || []).length === 0
                        }
                      >
                        <option value="">
                          {(TABELAS[(tmp.produto as Produto) || "Automóvel"] || []).length
                            ? "Selecione a tabela…"
                            : "Sem tabelas para este segmento"}
                        </option>
                        {(TABELAS[(tmp.produto as Produto) || "Automóvel"] || []).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Administradora</label>
                      <select
                        className="w-full border rounded-xl px-3 py-2"
                        value={tmp.administradora as Administradora}
                        onChange={(e) =>
                          setTmp((p) => ({
                            ...p,
                            administradora: e.target.value as Administradora,
                          }))
                        }
                      >
                        {ADMINISTRADORAS.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Forma da Venda</label>
                      <select
                        className="w-full border rounded-xl px-3 py-2"
                        value={tmp.forma_venda as FormaVenda}
                        onChange={(e) =>
                          setTmp((p) => ({ ...p, forma_venda: e.target.value as FormaVenda }))
                        }
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
                        onChange={(e) =>
                          setTmp((p) => ({ ...p, numero_proposta: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Valor da Venda</label>
                      <input
                        className="w-full border rounded-xl px-3 py-2"
                        value={(tmp.valor_venda as any) ?? ""}
                        onChange={(e) =>
                          setTmp((p) => ({ ...p, valor_venda: Number(e.target.value) }))
                        }
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
                  <div className="text-right mt-3">
                    <button
                      className="px-4 py-2 rounded-xl border mr-2"
                      onClick={() => setEditVendaModal({ open: false })}
                    >
                      Cancelar
                    </button>
                    <button
                      className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90"
                      onClick={() => salvarEdicaoPendente(v, tmp)}
                    >
                      Salvar
                    </button>
                  </div>
                </>
              );
              return <Comp />;
            })()}
          </div>
        </div>
      )}

      {descModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{descModal.title}</h3>
              <button
                className="text-gray-500 hover:text-gray-800"
                onClick={() => setDescModal({ open: false, title: "", text: "" })}
              >
                ✕
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-gray-800 max-h-[60vh] overflow-auto">
              {descModal.text || "—"}
            </pre>
            <div className="text-right">
              <button
                className="px-4 py-2 rounded-xl border"
                onClick={() => setDescModal({ open: false, title: "", text: "" })}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carteira;
