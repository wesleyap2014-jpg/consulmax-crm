// src/pages/FluxoDeCaixa.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

const WESLEY_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7c0b0";

type CashFlowType = "entrada" | "saida";
type CashFlowStatus = "previsto" | "realizado";

interface CashFlow {
  id: string;
  created_by: string;
  created_at: string;
  data: string;
  tipo: CashFlowType;
  categoria: string;
  subcategoria: string | null;
  descricao: string | null;
  valor: number;
  status: CashFlowStatus;
  origem: string | null;
  origem_id: string | null;
  competencia_mes: number;
  competencia_ano: number;
  is_fixa: boolean;
}

interface CashFlowForm {
  data: string;
  tipo: CashFlowType;
  categoria: string;
  subcategoria: string;
  descricao: string;
  valor: string;
  status: CashFlowStatus;
  origem: string;
  is_fixa: boolean;
}

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);

const todayISO = new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();

const FluxoDeCaixa: React.FC = () => {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CashFlowStatus>(
    "realizado"
  );
  const [tipoFilter, setTipoFilter] = useState<"all" | CashFlowType>("all");
  const [categoriaFilter, setCategoriaFilter] = useState("");

  const [items, setItems] = useState<CashFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CashFlow | null>(null);
  const [form, setForm] = useState<CashFlowForm>({
    data: todayISO,
    tipo: "entrada",
    categoria: "",
    subcategoria: "",
    descricao: "",
    valor: "",
    status: "realizado",
    origem: "",
    is_fixa: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 1) Garante que só você tenha acesso à página
  useEffect(() => {
    const checkUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        setHasAccess(false);
        setCheckingAccess(false);
        return;
      }

      const allowed = data.user.id === WESLEY_ID;
      setHasAccess(allowed);
      setCheckingAccess(false);
    };

    checkUser();
  }, []);

  // 2) Carrega os lançamentos do ano selecionado
  useEffect(() => {
    if (!hasAccess) return;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from("cash_flows")
        .select("*")
        .eq("competencia_ano", year)
        .order("data", { ascending: true });

      if (error) {
        console.error("Erro ao carregar cash_flows", error);
        setLoadError("Não foi possível carregar o fluxo de caixa.");
        setItems([]);
      } else {
        setItems((data || []) as CashFlow[]);
      }
      setLoading(false);
    };

    load();
  }, [year, hasAccess]);

  // 3) Filtro de lançamentos para a tabela
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (month !== "all" && item.competencia_mes !== month) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (tipoFilter !== "all" && item.tipo !== tipoFilter) return false;
      if (
        categoriaFilter &&
        !item.categoria.toLowerCase().includes(categoriaFilter.toLowerCase())
      )
        return false;
      return true;
    });
  }, [items, month, statusFilter, tipoFilter, categoriaFilter]);

  // 4) Resumo do período filtrado
  const resumo = useMemo(() => {
    const entradas = filteredItems
      .filter((i) => i.tipo === "entrada")
      .reduce((acc, i) => acc + Number(i.valor || 0), 0);
    const saidas = filteredItems
      .filter((i) => i.tipo === "saida")
      .reduce((acc, i) => acc + Number(i.valor || 0), 0);
    const resultado = entradas - saidas;
    return { entradas, saidas, resultado };
  }, [filteredItems]);

  // 5) Saldo inicial e final do mês (se algum mês estiver selecionado)
  const saldoMes = useMemo(() => {
    if (month === "all") {
      return {
        saldoInicial: null as number | null,
        saldoFinal: null as number | null,
      };
    }

    // acumulado até o fim do mês selecionado (considerando filtro de status)
    const ateMes = items.filter((item) => {
      if (item.competencia_ano !== year) return false;
      if (item.competencia_mes > month) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      return true;
    });

    const totalEntradasAteMes = ateMes
      .filter((i) => i.tipo === "entrada")
      .reduce((acc, i) => acc + Number(i.valor || 0), 0);
    const totalSaidasAteMes = ateMes
      .filter((i) => i.tipo === "saida")
      .reduce((acc, i) => acc + Number(i.valor || 0), 0);
    const resultadoAteMes = totalEntradasAteMes - totalSaidasAteMes;

    const saldoFinal = resultadoAteMes;
    const saldoInicial = saldoFinal - resumo.resultado;

    return { saldoInicial, saldoFinal };
  }, [items, month, year, statusFilter, resumo.resultado]);

  // 6) Dados para o gráfico de barras (ano todo, somente realizados)
  const chartData = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, idx) => ({
      mes: MONTH_LABELS[idx],
      numeroMes: idx + 1,
      entradas: 0,
      saidas: 0,
      resultado: 0,
    }));

    const realizados = items.filter((i) => i.status === "realizado");
    for (const item of realizados) {
      const bucket = base[item.competencia_mes - 1];
      if (!bucket) continue;
      if (item.tipo === "entrada") {
        bucket.entradas += Number(item.valor || 0);
      } else {
        bucket.saidas += Number(item.valor || 0);
      }
    }

    base.forEach((row) => {
      row.resultado = row.entradas - row.saidas;
    });

    return base;
  }, [items]);

  // ====== helpers de formulário ======

  const resetForm = () => {
    setForm({
      data: todayISO,
      tipo: "entrada",
      categoria: "",
      subcategoria: "",
      descricao: "",
      valor: "",
      status: "realizado",
      origem: "",
      is_fixa: false,
    });
    setFormError(null);
    setEditingItem(null);
  };

  const openNew = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (item: CashFlow) => {
    setEditingItem(item);
    setForm({
      data: item.data,
      tipo: item.tipo,
      categoria: item.categoria,
      subcategoria: item.subcategoria || "",
      descricao: item.descricao || "",
      valor: String(item.valor ?? ""),
      status: item.status,
      origem: item.origem || "",
      is_fixa: item.is_fixa,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleFormChange = (
    field: keyof CashFlowForm,
    value: string | boolean
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setFormError(null);

    if (!form.data) {
      setFormError("Informe a data.");
      return;
    }
    if (!form.categoria.trim()) {
      setFormError("Informe a categoria.");
      return;
    }
    if (!form.valor || isNaN(Number(form.valor))) {
      setFormError("Informe um valor numérico.");
      return;
    }

    const valorNumber = Number(form.valor);
    if (valorNumber < 0) {
      setFormError("O valor deve ser positivo.");
      return;
    }

    const dateObj = new Date(form.data);
    if (Number.isNaN(dateObj.getTime())) {
      setFormError("Data inválida.");
      return;
    }

    const competencia_mes = dateObj.getMonth() + 1;
    const competencia_ano = dateObj.getFullYear();

    const payload = {
      data: form.data,
      tipo: form.tipo,
      categoria: form.categoria.trim(),
      subcategoria: form.subcategoria.trim() || null,
      descricao: form.descricao.trim() || null,
      valor: valorNumber,
      status: form.status,
      origem: form.origem.trim() || null,
      competencia_mes,
      competencia_ano,
      is_fixa: form.is_fixa,
    };

    setSaving(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from("cash_flows")
          .update(payload)
          .eq("id", editingItem.id);

        if (error) {
          console.error("Erro ao atualizar lançamento", error);
          setFormError("Erro ao salvar lançamento.");
        } else {
          setItems((prev) =>
            prev.map((it) =>
              it.id === editingItem.id
                ? {
                    ...it,
                    ...payload,
                    id: it.id,
                    created_at: it.created_at,
                    created_by: it.created_by,
                    origem_id: it.origem_id,
                  }
                : it
            )
          );
          setModalOpen(false);
        }
      } else {
        const { data, error } = await supabase
          .from("cash_flows")
          .insert(payload)
          .select("*")
          .single();

        if (error) {
          console.error("Erro ao criar lançamento", error);
          setFormError("Erro ao salvar lançamento.");
        } else if (data) {
          setItems((prev) => [...prev, data as CashFlow]);
          setModalOpen(false);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CashFlow) => {
    const ok = window.confirm(
      "Tem certeza que deseja excluir este lançamento?"
    );
    if (!ok) return;

    const { error } = await supabase
      .from("cash_flows")
      .delete()
      .eq("id", item.id);

    if (error) {
      console.error("Erro ao excluir lançamento", error);
      alert("Não foi possível excluir o lançamento.");
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  // ======= RENDER =======

  if (checkingAccess) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500 text-sm">Verificando acesso...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="bg-white/80 shadow-lg rounded-2xl px-6 py-4">
          <p className="text-sm text-gray-700">
            Acesso restrito. Esta página é exclusiva do administrador.
          </p>
        </div>
      </div>
    );
  }

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Fluxo de Caixa
          </h1>
          <p className="text-sm text-gray-500">
            Controle de entradas e saídas mês a mês.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={openNew}
            className="inline-flex items-center rounded-full bg-[#A11C27] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#8d1822] transition-colors"
          >
            + Novo lançamento
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white/80 backdrop-blur border border-gray-100 shadow-sm rounded-2xl p-4 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Ano */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Ano</span>
            <select
              className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Mês */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Mês</span>
            <select
              className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
              value={month === "all" ? "all" : String(month)}
              onChange={(e) => {
                const value = e.target.value;
                setMonth(value === "all" ? "all" : Number(value));
              }}
            >
              <option value="all">Ano todo</option>
              {MONTH_LABELS.map((label, idx) => (
                <option key={label} value={idx + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Status</span>
            <select
              className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | CashFlowStatus)
              }
            >
              <option value="all">Todos</option>
              <option value="realizado">Realizados</option>
              <option value="previsto">Previstos</option>
            </select>
          </div>

          {/* Tipo */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Tipo</span>
            <select
              className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
              value={tipoFilter}
              onChange={(e) =>
                setTipoFilter(e.target.value as "all" | CashFlowType)
              }
            >
              <option value="all">Entradas e saídas</option>
              <option value="entrada">Somente entradas</option>
              <option value="saida">Somente saídas</option>
            </select>
          </div>

          {/* Categoria (texto livre) */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">
              Categoria (filtro)
            </span>
            <input
              type="text"
              className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
              placeholder="Ex.: Comissão, Despesa Fixa..."
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
        {/* Saldo inicial */}
        <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Saldo inicial</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {saldoMes.saldoInicial === null
              ? "—"
              : currency(saldoMes.saldoInicial)}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            Considerando acumulado do ano até o mês selecionado.
          </p>
        </div>

        {/* Entradas */}
        <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">
            Entradas ({statusFilter === "all" ? "todas" : statusFilter})
          </p>
          <p className="mt-1 text-xl font-semibold text-emerald-700">
            {currency(resumo.entradas)}
          </p>
        </div>

        {/* Saídas */}
        <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">
            Saídas ({statusFilter === "all" ? "todas" : statusFilter})
          </p>
          <p className="mt-1 text-xl font-semibold text-red-700">
            {currency(resumo.saidas)}
          </p>
        </div>

        {/* Saldo final */}
        <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Saldo do período</p>
          <p
            className={`mt-1 text-xl font-semibold ${
              resumo.resultado >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {currency(resumo.resultado)}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            Entradas - saídas no filtro atual.
          </p>
        </div>
      </div>

      {/* Gráfico de barras */}
      <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Fluxo anual ({year})
          </h2>
          <span className="text-[11px] text-gray-400">
            Somente lançamentos realizados.
          </span>
        </div>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: any) =>
                  currency(typeof value === "number" ? value : Number(value))
                }
              />
              <Legend />
              <Bar dataKey="entradas" name="Entradas" />
              <Bar dataKey="saidas" name="Saídas" />
              <Bar dataKey="resultado" name="Resultado" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela de lançamentos */}
      <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Lançamentos ({filteredItems.length})
          </h2>
          {loading && (
            <span className="text-[11px] text-gray-400">
              Carregando lançamentos...
            </span>
          )}
        </div>

        {loadError && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
            {loadError}
          </div>
        )}

        <div className="overflow-x-auto -mx-3 md:mx-0">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead>
              <tr className="bg-gray-50/60">
                <th className="px-3 py-2 text-left font-medium text-gray-500">
                  Data
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">
                  Tipo
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">
                  Categoria
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">
                  Subcategoria
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">
                  Descrição
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">
                  Status
                </th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">
                  Valor
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-500">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-4 text-center text-xs text-gray-400"
                  >
                    Nenhum lançamento encontrado para o filtro selecionado.
                  </td>
                </tr>
              )}

              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {new Date(item.data).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        item.tipo === "entrada"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {item.tipo === "entrada" ? "Entrada" : "Saída"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {item.categoria}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                    {item.subcategoria || "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-xs truncate">
                    {item.descricao || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        item.status === "realizado"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {item.status === "realizado"
                        ? "Realizado"
                        : "Previsto"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span
                      className={
                        item.tipo === "entrada"
                          ? "text-emerald-700 font-medium"
                          : "text-red-700 font-medium"
                      }
                    >
                      {currency(Number(item.valor || 0))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-[11px] text-[#1E293F] hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-[11px] text-red-600 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Rodapé com total do período */}
            {filteredItems.length > 0 && (
              <tfoot className="bg-gray-50/60">
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-2 text-right text-[11px] font-medium text-gray-600"
                  >
                    Resultado no filtro:
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] font-semibold text-gray-900">
                    {currency(resumo.resultado)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal de Novo / Editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingItem ? "Editar lançamento" : "Novo lançamento"}
              </h3>
              <button
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">Data</span>
                <input
                  type="date"
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  value={form.data}
                  onChange={(e) => handleFormChange("data", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">Tipo</span>
                <select
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  value={form.tipo}
                  onChange={(e) =>
                    handleFormChange("tipo", e.target.value as CashFlowType)
                  }
                >
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">
                  Categoria
                </span>
                <input
                  type="text"
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  placeholder="Ex.: Comissão Recebida, Despesa Fixa..."
                  value={form.categoria}
                  onChange={(e) =>
                    handleFormChange("categoria", e.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">
                  Subcategoria
                </span>
                <input
                  type="text"
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  placeholder="Ex.: Aluguel, Meta Ads, Salário..."
                  value={form.subcategoria}
                  onChange={(e) =>
                    handleFormChange("subcategoria", e.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs font-medium text-gray-500">
                  Descrição
                </span>
                <input
                  type="text"
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  placeholder="Detalhes do lançamento (opcional)"
                  value={form.descricao}
                  onChange={(e) =>
                    handleFormChange("descricao", e.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">
                  Valor (R$)
                </span>
                <input
                  type="number"
                  step="0.01"
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  value={form.valor}
                  onChange={(e) => handleFormChange("valor", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">
                  Status
                </span>
                <select
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  value={form.status}
                  onChange={(e) =>
                    handleFormChange(
                      "status",
                      e.target.value as CashFlowStatus
                    )
                  }
                >
                  <option value="realizado">Realizado</option>
                  <option value="previsto">Previsto</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">
                  Origem (opcional)
                </span>
                <input
                  type="text"
                  className="rounded-xl border-gray-200 text-sm focus:border-[#A11C27] focus:ring-[#A11C27]"
                  placeholder="Ex.: Manual, Comissão, Venda..."
                  value={form.origem}
                  onChange={(e) =>
                    handleFormChange("origem", e.target.value)
                  }
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-2 mt-1">
                <input
                  id="is_fixa"
                  type="checkbox"
                  className="rounded border-gray-300 text-[#A11C27] focus:ring-[#A11C27]"
                  checked={form.is_fixa}
                  onChange={(e) =>
                    handleFormChange("is_fixa", e.target.checked)
                  }
                />
                <label
                  htmlFor="is_fixa"
                  className="text-xs text-gray-600 cursor-pointer"
                >
                  Marcar como despesa fixa recorrente
                </label>
              </div>
            </div>

            {formError && (
              <div className="mb-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-1.5 text-xs rounded-full bg-[#A11C27] text-white font-medium hover:bg-[#8d1822] disabled:opacity-60"
                disabled={saving}
              >
                {saving
                  ? "Salvando..."
                  : editingItem
                  ? "Salvar alterações"
                  : "Salvar lançamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FluxoDeCaixa;
