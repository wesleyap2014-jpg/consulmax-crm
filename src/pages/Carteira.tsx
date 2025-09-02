// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ---------------- Tipos ---------------- */
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
  data_venda: string; // ISO (yyyy-mm-dd)
  vendedor_id: string;
  produto: Produto;
  administradora: Administradora;
  forma_venda: FormaVenda;
  numero_proposta: string;
  valor_venda: number;
  tipo_venda: "Normal" | "Contemplada";
  descricao: string | null;
  status: "nova" | "encarteirada";
  grupo: string | null;
  cota: string | null;
  codigo: string | null; // '00' ativa; outro -> cancelada
  encarteirada_em: string | null;
  created_at: string;
};

/** --------------- Constantes --------------- */
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

const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);

const isAtiva = (codigo: string | null) => (codigo?.trim() ?? "") === "00";

/** ----------------------------------------------------------------
 *  Linhas (componentes separados) — evita hooks dentro de .map()
 * ----------------------------------------------------------------*/
type LinhaEncarteirarProps = {
  venda: Venda;
  lead?: Lead;
  onSubmit: (vendaId: string, grupo: string, cota: string, codigo: string) => Promise<void>;
};
const LinhaEncarteirar: React.FC<LinhaEncarteirarProps> = ({ venda, lead, onSubmit }) => {
  const [grupo, setGrupo] = useState("");
  const [cota, setCota] = useState("");
  const [codigo, setCodigo] = useState("");
  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="font-medium">{lead?.nome ?? "—"}</div>
        <div className="text-xs text-gray-500">{lead?.telefone ?? "—"}</div>
      </td>
      <td className="p-2">{venda.administradora}</td>
      <td className="p-2">{venda.numero_proposta}</td>
      <td className="p-2">
        <input value={grupo} onChange={(e) => setGrupo(e.target.value)} className="border rounded px-2 py-1 w-28" />
      </td>
      <td className="p-2">
        <input value={cota} onChange={(e) => setCota(e.target.value)} className="border rounded px-2 py-1 w-20" />
      </td>
      <td className="p-2">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="border rounded px-2 py-1 w-20" />
      </td>
      <td className="p-2">{currency(venda.valor_venda ?? 0)}</td>
      <td className="p-2">
        <button
          className="px-3 py-1 rounded bg-[#A11C27] text-white hover:opacity-90"
          onClick={() => onSubmit(venda.id, grupo, cota, codigo)}
        >
          ENCARTEIRAR
        </button>
      </td>
    </tr>
  );
};

type LinhaCotaProps = {
  venda: Venda;
  onSave: (patch: Partial<Venda>) => Promise<void>;
};
const LinhaCota: React.FC<LinhaCotaProps> = ({ venda, onSave }) => {
  const ativa = isAtiva(venda.codigo);
  const [edit, setEdit] = useState(false);
  const [grupo, setGrupo] = useState(venda.grupo ?? "");
  const [cota, setCota] = useState(venda.cota ?? "");
  const [codigo, setCodigo] = useState(venda.codigo ?? "");
  const [valor, setValor] = useState<number>(venda.valor_venda);

  return (
    <tr className="border-t">
      <td className="p-2">
        <span className={`px-2 py-1 rounded-full text-xs ${ativa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {ativa ? "Ativa" : "Cancelada"}
        </span>
      </td>
      <td className="p-2">{venda.administradora}</td>
      <td className="p-2">{venda.numero_proposta}</td>
      <td className="p-2">
        {edit ? <input className="border rounded px-2 py-1 w-24" value={grupo} onChange={(e) => setGrupo(e.target.value)} /> : venda.grupo ?? "—"}
      </td>
      <td className="p-2">
        {edit ? <input className="border rounded px-2 py-1 w-20" value={cota} onChange={(e) => setCota(e.target.value)} /> : venda.cota ?? "—"}
      </td>
      <td className="p-2">
        {edit ? <input className="border rounded px-2 py-1 w-20" value={codigo} onChange={(e) => setCodigo(e.target.value)} /> : venda.codigo ?? "—"}
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
        {edit ? (
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded bg-[#1E293F] text-white hover:opacity-90"
              onClick={() => {
                setEdit(false);
                onSave({ grupo, cota, codigo, valor_venda: valor });
              }}
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
        )}
      </td>
    </tr>
  );
};

/** ----------------------------------------------------------------
 *  Bloco de Cliente (controla o "open")
 * ----------------------------------------------------------------*/
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
};
const ClienteBloco: React.FC<ClienteBlocoProps> = ({ group, onSaveVenda }) => {
  const [open, setOpen] = useState(false);
  const segs = Array.from(group.segmentos).join("; ");

  return (
    <div className="border rounded-2xl p-4">
      <button className="w-full text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between">
          <div className="font-medium">
            {group.cliente.nome}
            <span className="text-xs text-gray-500 ml-2">{group.cliente.telefone ?? ""}</span>
          </div>
          <div className="text-sm text-gray-600">
            Total Ativas: <strong>{currency(group.totalAtivas)}</strong> • Qtd: <strong>{group.qtdAtivas}</strong> • Segmentos: {segs}
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-3 overflow-auto">
          <table className="min-w-[720px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Proposta</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2">Editar</th>
              </tr>
            </thead>
            <tbody>
              {group.itens.map((v) => (
                <LinhaCota key={v.id} venda={v} onSave={(patch) => onSaveVenda(v, patch)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/** --------------- Página --------------- */
const Carteira: React.FC = () => {
  /** Sessão / Dados base */
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, Lead>>({});

  const [pendentes, setPendentes] = useState<Venda[]>([]);
  const [encarteiradas, setEncarteiradas] = useState<Venda[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>("");

  /** Pesquisa */
  const [q, setQ] = useState<string>("");

  /** Nova Venda (modal) */
  const [showModal, setShowModal] = useState<boolean>(false);
  const [form, setForm] = useState<Partial<Venda>>({
    cpf: "",
    data_venda: new Date().toISOString().slice(0, 10),
    produto: "Automóvel",
    administradora: "Embracon",
    forma_venda: "Parcela Cheia",
    tipo_venda: "Normal",
    descricao: "",
  });

  /** Oferta de Lance */
  const [assembleia, setAssembleia] = useState<string>(new Date().toISOString().slice(0, 10));
  const [oferta, setOferta] = useState<
    Array<{ administradora: string; grupo: string; cota: string; referencia?: string | null; participantes?: number | null; maior_perc_ll?: number | null; contemplados?: number | null }>
  >([]);

  /** ----------------- Effects ----------------- */
  useEffect(() => {
    let alive = true;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const fetchWithRetry = async <T,>(fn: () => Promise<T>, label: string, tries = 3): Promise<T> => {
      let lastErr: any;
      for (let i = 1; i <= tries; i++) {
        try {
          return await fn();
        } catch (e: any) {
          lastErr = e;
          console.warn(`[Carteira] Falhou ${label} (tentativa ${i}/${tries})`, e);
          await sleep(300 * i);
        }
      }
      throw new Error(`${label}: ${lastErr?.message ?? "Falha de rede"}`);
    };

    (async () => {
      try {
        setLoading(true);
        setErr("");

        // 1) Sessão / usuário
        const session = await fetchWithRetry(async () => (await supabase.auth.getUser()).data, "auth.getUser");
        const uid = session?.user?.id ?? "";
        if (alive) {
          setUserId(uid);
          setUserName(session?.user?.user_metadata?.nome ?? session?.user?.email ?? "Vendedor");
        }

        // 2) Leads
        const leadsData = await fetchWithRetry(async () => {
          const { data, error } = await supabase.from("leads").select("id,nome,telefone").order("nome", { ascending: true });
          if (error) throw error;
          return data ?? [];
        }, "select leads");
        if (alive) {
          setLeads(leadsData);
          setLeadMap(Object.fromEntries(leadsData.map((l: any) => [l.id, l])));
        }

        // 3) Vendas pendentes
        const pend = await fetchWithRetry(async () => {
          const { data, error } = await supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
          if (error) throw error;
          return data ?? [];
        }, "select vendas (pendentes)");

        // 4) Vendas encarteiradas
        const enc = await fetchWithRetry(async () => {
          const { data, error } = await supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false });
          if (error) throw error;
          return data ?? [];
        }, "select vendas (encarteiradas)");

        if (alive) {
          setPendentes(pend);
          setEncarteiradas(enc);
        }
      } catch (e: any) {
        console.error(e);
        setErr(e.message || "Falha ao carregar dados da Carteira.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /** ----------------- Helpers ----------------- */
  const pendentesComNome = useMemo(
    () => pendentes.map((v) => ({ venda: v, lead: leadMap[v.lead_id] })),
    [pendentes, leadMap]
  );

  const encarteiradasFiltradas = useMemo(() => {
    if (!q.trim()) return encarteiradas;
    const ql = q.toLowerCase();
    return encarteiradas.filter((v) => leadMap[v.lead_id]?.nome?.toLowerCase().includes(ql));
  }, [q, encarteiradas, leadMap]);

  const totalAtivas = useMemo(
    () => encarteiradas.reduce((acc, v) => (isAtiva(v.codigo) ? acc + (v.valor_venda || 0) : acc), 0),
    [encarteiradas]
  );
  const totalCanceladas = useMemo(
    () => encarteiradas.reduce((acc, v) => (!isAtiva(v.codigo) ? acc + (v.valor_venda || 0) : acc), 0),
    [encarteiradas]
  );

  const porCliente: ClienteGroup[] = useMemo(() => {
    const map: Record<
      string,
      { cliente: Lead; itens: Venda[]; totalAtivas: number; qtdAtivas: number; segmentos: Set<string> }
    > = {};
    for (const v of encarteiradasFiltradas) {
      const lead = leadMap[v.lead_id];
      if (!lead) continue;
      const key = lead.id;
      if (!map[key]) map[key] = { cliente: lead, itens: [], totalAtivas: 0, qtdAtivas: 0, segmentos: new Set() };
      map[key].itens.push(v);
      if (isAtiva(v.codigo)) {
        map[key].totalAtivas += v.valor_venda || 0;
        map[key].qtdAtivas += 1;
      }
      map[key].segmentos.add(v.produto);
    }
    return Object.values(map);
  }, [encarteiradasFiltradas, leadMap]);

  /** ----------------- Actions ----------------- */
  const openModal = () => setShowModal(true);
  const closeModal = () => setShowModal(false);
  const onFormChange = (k: keyof Venda, val: any) => setForm((f) => ({ ...f, [k]: val }));

  const registrarVenda = async () => {
    try {
      if (!form.lead_id) throw new Error("Selecione o Lead.");
      if (!form.cpf?.trim()) throw new Error("CPF é obrigatório.");
      if (!form.numero_proposta?.trim()) throw new Error("Número da proposta é obrigatório.");
      const valor = Number((form.valor_venda as any)?.toString().replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(valor)) throw new Error("Valor da venda inválido.");

      const payload = {
        lead_id: form.lead_id,
        cpf: (form.cpf ?? "").trim(),
        data_venda: form.data_venda,
        vendedor_id: userId,
        produto: form.produto,
        administradora: form.administradora,
        forma_venda: form.forma_venda,
        numero_proposta: form.numero_proposta,
        valor_venda: valor,
        tipo_venda: form.tipo_venda ?? "Normal",
        descricao: form.descricao ?? "",
        status: "nova",
      };

      const { error } = await supabase.from("vendas").insert(payload as any);
      if (error) throw error;

      const { data: pend } = await supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false });
      setPendentes(pend ?? []);

      setForm({
        cpf: "",
        data_venda: new Date().toISOString().slice(0, 10),
        produto: "Automóvel",
        administradora: "Embracon",
        forma_venda: "Parcela Cheia",
        tipo_venda: "Normal",
        descricao: "",
      });
      closeModal();
    } catch (e: any) {
      alert(e.message ?? "Erro ao registrar venda.");
    }
  };

  const encarteirar = async (vendaId: string, grupo: string, cota: string, codigo: string) => {
    try {
      if (!grupo?.trim() || !cota?.trim() || !codigo?.trim()) throw new Error("Preencha Grupo, Cota e Código.");
      const { error } = await supabase
        .from("vendas")
        .update({ grupo, cota, codigo, status: "encarteirada", encarteirada_em: new Date().toISOString() })
        .eq("id", vendaId);
      if (error) throw error;

      const [{ data: pend }, { data: enc }] = await Promise.all([
        supabase.from("vendas").select("*").eq("status", "nova").order("created_at", { ascending: false }),
        supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false }),
      ]);
      setPendentes(pend ?? []);
      setEncarteiradas(enc ?? []);
    } catch (e: any) {
      alert(e.message ?? "Erro ao encarteirar.");
    }
  };

  const salvarEdicao = async (v: Venda, patch: Partial<Venda>) => {
    try {
      const { error } = await supabase.from("vendas").update(patch).eq("id", v.id);
      if (error) throw error;
      const { data: enc } = await supabase.from("vendas").select("*").eq("status", "encarteirada").order("created_at", { ascending: false });
      setEncarteiradas(enc ?? []);
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar edição.");
    }
  };

  const listarOferta = async () => {
    try {
      const { data: grupos, error } = await supabase
        .from("gestao_grupos")
        .select("administradora,grupo,referencia,participantes,maior_perc_ll,contemplados,data_assembleia")
        .eq("data_assembleia", assembleia);
      if (error) throw error;

      const mapGroup = new Map<string, any>();
      for (const g of grupos ?? []) mapGroup.set(`${g.administradora}::${g.grupo}`, g);

      const linhas: any[] = [];
      for (const v of encarteiradas) {
        if (v.grupo && v.cota) {
          const key = `${v.administradora}::${v.grupo}`;
          const info = mapGroup.get(key);
          linhas.push({
            administradora: v.administradora,
            grupo: v.grupo,
            cota: v.cota,
            referencia: info?.referencia ?? null,
            participantes: info?.participantes ?? null,
            maior_perc_ll: info?.maior_perc_ll ?? null,
            contemplados: info?.contemplados ?? null,
          });
        }
      }
      setOferta(linhas);
    } catch (e: any) {
      alert((e.message ?? "Erro ao listar.") + "\nSe a tabela 'gestao_grupos' ainda não existe, pode ignorar por enquanto.");
    }
  };

  const exportarPDF = () => {
    const el = document.getElementById("relatorio-carteira");
    if (!el) return;
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return;

    const style = `
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        h1,h2 { margin: 0 0 12px 0; }
        .muted { color:#6b7280; font-size:12px }
        .grid { width:100%; border-collapse: collapse; margin-top: 12px; }
        .grid th, .grid td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; }
        .totais { display:flex; gap:16px; margin:8px 0 16px 0; }
        .logo { height: 40px; margin-bottom: 12px; }
      </style>
    `;

    win.document.write(`
      <html>
        <head><title>Relatório - Carteira Consulmax</title>${style}</head>
        <body>
          <img src="/consulmax-logo.png" class="logo" onerror="this.style.display='none'"/>
          <h1>Carteira - Consulmax</h1>
          <div class="muted">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
          <div class="totais">
            <strong>Total Ativas: ${currency(totalAtivas)}</strong>
            <strong>Total Canceladas: ${currency(totalCanceladas)}</strong>
          </div>
          ${el.innerHTML}
          <script>window.print(); setTimeout(()=>window.close(), 300);</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  /** ----------------- UI ----------------- */
  if (loading) return <div className="p-6 text-sm text-gray-600">Carregando carteira…</div>;
  if (err) return <div className="p-6 text-red-600">Erro: {err}</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Topo */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Carteira</h1>
          <p className="text-gray-500 text-sm">Gerencie vendas, encarteiramento e oferta de lance.</p>
        </div>
        <button onClick={openModal} className="px-4 py-2 rounded-xl bg-[#1E293F] text-white hover:opacity-90">
          + Nova Venda
        </button>
      </div>

      {/* Pesquisa */}
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar cliente pelo nome…"
          className="w-full border rounded-xl px-3 py-2 outline-none focus:ring"
        />
        <button onClick={exportarPDF} className="px-4 py-2 rounded-xl border hover:bg-gray-50">Exportar PDF</button>
      </div>

      {/* Encarteirar */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Encarteirar</h2>
          <span className="text-sm text-gray-500">{pendentes.length} nova(s) venda(s)</span>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[720px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Cliente</th>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Proposta</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2 w-40">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pendentesComNome.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={8}>Sem novas vendas para encarteirar.</td>
                </tr>
              )}
              {pendentesComNome.map(({ venda, lead }) => (
                <LinhaEncarteirar
                  key={venda.id}
                  venda={venda}
                  lead={lead}
                  onSubmit={encarteirar}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totais */}
      <div className="flex items-center gap-4">
        <div className="px-4 py-3 rounded-2xl bg-[#1E293F] text-white">
          Ativas: <strong className="ml-1">{currency(totalAtivas)}</strong>
        </div>
        <div className="px-4 py-3 rounded-2xl bg-gray-100">
          Canceladas: <strong className="ml-1">{currency(totalCanceladas)}</strong>
        </div>
      </div>

      {/* Carteira (lista por cliente) */}
      <section id="relatorio-carteira" className="space-y-3">
        {porCliente.length === 0 && <div className="text-gray-500">Nenhuma cota encarteirada ainda.</div>}
        {porCliente.map((group) => (
          <ClienteBloco key={group.cliente.id} group={group} onSaveVenda={salvarEdicao} />
        ))}
      </section>

      {/* Oferta de Lance */}
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
        <button onClick={listarOferta} className="px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90">Listar</button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[720px] w-full border border-gray-200 rounded-xl">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Adm</th>
                <th className="text-left p-2">Grupo</th>
                <th className="text-left p-2">Cota</th>
                <th className="text-left p-2">Referência</th>
                <th className="text-left p-2">Participantes</th>
                <th className="text-left p-2">Maior % de LL</th>
                <th className="text-left p-2">Contemplados</th>
              </tr>
            </thead>
            <tbody>
              {oferta.length === 0 && (
                <tr><td className="p-3 text-gray-500" colSpan={7}>Nenhuma cota encontrada para a data.</td></tr>
              )}
              {oferta.map((o, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{o.administradora}</td>
                  <td className="p-2">{o.grupo}</td>
                  <td className="p-2">{o.cota}</td>
                  <td className="p-2">{o.referencia ?? "—"}</td>
                  <td className="p-2">{o.participantes ?? "—"}</td>
                  <td className="p-2">{o.maior_perc_ll != null ? `${o.maior_perc_ll}%` : "—"}</td>
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
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-800">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pessoa */}
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
                  value={form.cpf ?? ""}
                  onChange={(e) => onFormChange("cpf", e.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>

              {/* Dados da Venda */}
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
                <label className="text-sm text-gray-600">Vendedor</label>
                <input className="w-full border rounded-xl px-3 py-2 bg-gray-50" value={userName} readOnly />
              </div>

              <div>
                <label className="text-sm text-gray-600">Produto</label>
                <select className="w-full border rounded-xl px-3 py-2" value={form.produto as Produto} onChange={(e) => onFormChange("produto", e.target.value as Produto)}>
                  {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Administradora</label>
                <select className="w-full border rounded-xl px-3 py-2" value={form.administradora as Administradora} onChange={(e) => onFormChange("administradora", e.target.value as Administradora)}>
                  {ADMINISTRADORAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Forma da Venda</label>
                <select className="w-full border rounded-xl px-3 py-2" value={form.forma_venda as FormaVenda} onChange={(e) => onFormChange("forma_venda", e.target.value as FormaVenda)}>
                  {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Número da Proposta *</label>
                <input className="w-full border rounded-xl px-3 py-2" value={form.numero_proposta ?? ""} onChange={(e) => onFormChange("numero_proposta", e.target.value)} />
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
                <select className="w-full border rounded-xl px-3 py-2" value={form.tipo_venda ?? "Normal"} onChange={(e) => onFormChange("tipo_venda", e.target.value)}>
                  <option>Normal</option>
                  <option>Contemplada</option>
                </select>
              </div>

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
              <button onClick={closeModal} className="px-4 py-2 rounded-xl border">Cancelar</button>
              <button onClick={registrarVenda} className="px-4 py-2 rounded-xl bg-[#A11C27] text-white hover:opacity-90">Registrar Venda</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carteira;
