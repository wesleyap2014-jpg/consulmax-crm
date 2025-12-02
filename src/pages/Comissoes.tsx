// src/pages/Comissoes.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Filter as FilterIcon,
  Loader2,
  Settings,
  DollarSign,
  FileText,
  RotateCcw,
  Pencil,
  Trash2,
  Eye,
  Search,
} from "lucide-react";
import { UploadArea } from "@/components/UploadArea";

type UUID = string;

type User = {
  id: UUID;
  nome: string | null;
  email: string | null;
};

type UserSecure = {
  id: UUID;
  pix_type?: string | null;
  pix_key?: string | null;
};

type SimTable = {
  id: UUID;
  segmento: string;
  nome_tabela: string;
  admin_id?: string | null;
  admin_name?: string | null;
};

type CommissionFlow = {
  id: UUID;
  commission_id: UUID;
  parcela: number;
  vencimento: string | null;
  valor_comissao: number | null;
  valor_pago_vendedor: number | null;
  status: "previsto" | "pago" | "estorno";
  admin_receipt_date?: string | null;
  vendor_receipt_date?: string | null;
};

type Commission = {
  id: UUID;
  vendedor_id: UUID | null;
  cliente_nome?: string | null;
  numero_proposta?: string | null;
  administradora?: string | null;
  segmento?: string | null;
  tabela?: string | null;
  status: "a_pagar" | "pago" | "estorno";
  base_calculo?: number | null;
  percent_aplicado?: number | null;
  valor_total?: number | null;
  data_venda?: string | null;
  data_pagamento?: string | null;
  flow?: CommissionFlow[];
};

type VendaSemComissao = {
  id: UUID;
  vendedor_id: UUID | null;
  cliente_nome?: string | null;
  numero_proposta?: string | null;
  administradora?: string | null;
  segmento?: string | null;
  tabela?: string | null;
  data_venda?: string | null;
  valor_venda?: number | null;
};

type CommissionRule = {
  id: UUID;
  vendedor_id: UUID;
  sim_table_id: string; // aqui usamos a "chave de grupo" (admin|segmento|tabela)
  percent_padrao: number;
  fluxo_meses: number;
  fluxo_percentuais: number[];
  obs?: string | null;
};

const currencyBR = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const pct100 = (v: number | null | undefined) =>
  `${((v ?? 0) * 100).toFixed(2).replace(".", ",")}%`;

const formatISODateBR = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
};

const normalize = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const parsePctInput = (str: string): number => {
  const cleaned = str.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
};

const formatPctInput = (n: number): string =>
  (n * 100).toFixed(2).replace(".", ",");

// Cores para o donut principal
const DONUT_COLORS = ["#22c55e", "#ef4444", "#0ea5e9"];

const LineChartWrapper: React.FC<{
  data: { label: string; previsto: number; pago: number }[];
}> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip
          formatter={(value: any) =>
            currencyBR(typeof value === "number" ? value : Number(value))
          }
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="previsto"
          name="Previsto"
          dot={false}
        />
        <Line type="monotone" dataKey="pago" name="Pago" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

const ComissoesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);

  // Filtros principais
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [administradora, setAdministradora] = useState<string>("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">(
    "all",
  );

  // Dados principais
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [vendasSemComissao, setVendasSemComissao] = useState<
    VendaSemComissao[]
  >([]);

  // A pagar – busca
  const [unpaidSearch, setUnpaidSearch] = useState("");
  const [unpaidPage, setUnpaidPage] = useState(1);
  const UNPAID_PAGE_SIZE = 15;

  // Pagas – busca / paginação
  const [paidSearch, setPaidSearch] = useState("");
  const [paidPage, setPaidPage] = useState(1);
  const PAID_PAGE_SIZE = 15;

  // Overlay de pagamento / arquivos (mantido conceitualmente)
  const [payOverlayOpen, setPayOverlayOpen] = useState(false);
  const [payOverlayCommission, setPayOverlayCommission] =
    useState<Commission | null>(null);

  // Regras de comissão
  const [openRules, setOpenRules] = useState(false);
  const [ruleVendorId, setRuleVendorId] = useState<string>("");
  const [ruleAdminIdFilter, setRuleAdminIdFilter] = useState<string>("all");
  const [ruleSegmentFilter, setRuleSegmentFilter] = useState<string>("all");

  // Chave da "tabela" (grupo) atualmente em edição nas regras
  const [editingRuleGroupKey, setEditingRuleGroupKey] = useState<string | null>(
    null,
  );

  // Formulário de regra
  const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
  const [rulePercent, setRulePercent] = useState<string>("1,20");
  const [ruleMeses, setRuleMeses] = useState<number>(1);
  const [ruleFluxoPct, setRuleFluxoPct] = useState<string[]>(["100,00"]);
  const [ruleObs, setRuleObs] = useState<string>("");

  // Regras já carregadas p/ vendedor
  const [ruleRows, setRuleRows] = useState<
    (CommissionRule & {
      segmento: string;
      nome_tabela: string;
      administradora?: string | null;
    })[]
  >([]);

  // Ref para lista de regras (scroll ao clicar no "olho")
  const rulesListRef = useRef<HTMLDivElement | null>(null);

  // ====== Helpers derivados dos SimTables ======

  const adminFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    simTables.forEach((t) => {
      if (t.admin_name) {
        map.set(t.admin_name, t.admin_name);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [simTables]);

  const segmentFilterOptions = useMemo(() => {
    let subset = simTables;
    if (administradora !== "all") {
      subset = subset.filter((t) => t.admin_name === administradora);
    }
    const set = new Set<string>();
    subset.forEach((t) => {
      if (t.segmento) set.add(t.segmento);
    });
    return Array.from(set.values()).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [simTables, administradora]);

  const tabelaFilterOptions = useMemo(() => {
    let subset = simTables;
    if (administradora !== "all") {
      subset = subset.filter((t) => t.admin_name === administradora);
    }
    if (segmento !== "all") {
      subset = subset.filter((t) => t.segmento === segmento);
    }
    const set = new Set<string>();
    subset.forEach((t) => {
      if (t.nome_tabela) set.add(t.nome_tabela);
    });
    return Array.from(set.values()).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [simTables, administradora, segmento]);

  // Para Regras: grupos por admin + segmento + tabela
  type SimGroup = {
    key: string; // adminId|normSegment|normTabela
    admin_id: string | null;
    administradora: string;
    segmento: string;
    nome_tabela: string;
    ids: string[]; // ids de sim_tables pertencentes a este grupo
  };

  const simGroups: SimGroup[] = useMemo(() => {
    const groups: Record<string, SimGroup> = {};
    simTables.forEach((t) => {
      const seg = (t.segmento || "").trim();
      const name = (t.nome_tabela || "").trim();
      const adminId = t.admin_id || null;
      const adminName = (t.admin_name || "").trim() || "—";
      const key = `${adminId || "noadmin"}|${normalize(seg)}|${normalize(
        name,
      )}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          admin_id: adminId,
          administradora: adminName,
          segmento: seg,
          nome_tabela: name,
          ids: [],
        };
      }
      groups[key].ids.push(t.id);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.administradora !== b.administradora) {
        return a.administradora.localeCompare(b.administradora, "pt-BR");
      }
      if (a.segmento !== b.segmento) {
        return a.segmento.localeCompare(b.segmento, "pt-BR");
      }
      return a.nome_tabela.localeCompare(b.nome_tabela, "pt-BR");
    });
  }, [simTables]);

  const groupByKey: Record<string, SimGroup> = useMemo(() => {
    const map: Record<string, SimGroup> = {};
    simGroups.forEach((g) => {
      map[g.key] = g;
    });
    return map;
  }, [simGroups]);

  const ruleAdminOptions = useMemo(() => {
    const map = new Map<string, string>();
    simTables.forEach((t) => {
      if (t.admin_id && t.admin_name) {
        map.set(t.admin_id, t.admin_name);
      }
    });
    return Array.from(map.entries()); // [id, name]
  }, [simTables]);

  const ruleSegmentOptions = useMemo(() => {
    let subset = simTables;
    if (ruleAdminIdFilter !== "all") {
      subset = subset.filter((t) => t.admin_id === ruleAdminIdFilter);
    }
    const set = new Set<string>();
    subset.forEach((t) => {
      if (t.segmento) set.add(t.segmento);
    });
    return Array.from(set.values()).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [simTables, ruleAdminIdFilter]);

  const filteredSimGroupsForRules = useMemo(() => {
    return simGroups.filter((g) => {
      if (ruleAdminIdFilter !== "all" && g.admin_id !== ruleAdminIdFilter) {
        return false;
      }
      if (ruleSegmentFilter !== "all" && g.segmento !== ruleSegmentFilter) {
        return false;
      }
      return true;
    });
  }, [simGroups, ruleAdminIdFilter, ruleSegmentFilter]);

  // Quando trocar Administradora no filtro principal, zera segmento/tabela
  useEffect(() => {
    setSegmento("all");
    setTabela("all");
  }, [administradora]);

  // Quando trocar administradora nas regras, zera segmento
  useEffect(() => {
    setRuleSegmentFilter("all");
  }, [ruleAdminIdFilter]);

  // Quando fechar o overlay de regras, limpar edição
  useEffect(() => {
    if (!openRules) {
      setEditingRuleGroupKey(null);
      setRuleSimTableId("");
    }
  }, [openRules]);

  // ====== Carregamento inicial ======
  useEffect(() => {
    const loadBase = async () => {
      setLoading(true);
      try {
        const [{ data: u }, { data: st }, { data: us }] = await Promise.all([
          supabase
            .from("users")
            .select("id, nome, email")
            .order("nome", { ascending: true }),
          supabase
            .from("sim_tables")
            .select("id, segmento, nome_tabela, admin_id, sim_admins ( name )")
            .order("segmento", { ascending: true }),
          supabase.from("users_secure").select("id, pix_type, pix_key"),
        ]);

        setUsers((u ?? []) as User[]);
        const mappedSt: SimTable[] = (st ?? []).map((row: any) => ({
          id: row.id,
          segmento: row.segmento,
          nome_tabela: row.nome_tabela,
          admin_id: row.admin_id ?? null,
          admin_name: row.sim_admins?.name ?? null,
        }));
        setSimTables(mappedSt);
        setUsersSecure((us ?? []) as UserSecure[]);
      } catch (e) {
        console.error("Erro carregando bases:", e);
      } finally {
        setLoading(false);
      }
    };

    loadBase();
  }, []);

  const vendedorNome = (id: string | null | undefined) => {
    if (!id || id === "all") return "Todos os vendedores";
    const u = users.find((x) => x.id === id);
    return u?.nome || "Vendedor";
  };

  // ====== Fetch de comissões e vendas sem comissão ======
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // commissions
        let qb = supabase
          .from("commissions")
          .select(
            `
          id,
          vendedor_id,
          cliente_nome,
          numero_proposta,
          administradora,
          segmento,
          tabela,
          status,
          base_calculo,
          percent_aplicado,
          valor_total,
          data_venda,
          data_pagamento,
          flows:commission_flows (
            id,
            commission_id,
            parcela,
            vencimento,
            valor_comissao,
            valor_pago_vendedor,
            status,
            admin_receipt_date,
            vendor_receipt_date
          )
        `,
          )
          .order("data_venda", { ascending: false });

        if (vendedorId !== "all") {
          qb = qb.eq("vendedor_id", vendedorId);
        }
        if (administradora !== "all") {
          qb = qb.eq("administradora", administradora);
        }
        if (segmento !== "all") {
          qb = qb.eq("segmento", segmento);
        }
        if (tabela !== "all") {
          qb = qb.eq("tabela", tabela);
        }
        if (status !== "all") {
          qb = qb.eq("status", status);
        }

        const { data: commData } = await qb;

        const mappedComms: Commission[] = (commData ?? []).map((row: any) => ({
          id: row.id,
          vendedor_id: row.vendedor_id,
          cliente_nome: row.cliente_nome,
          numero_proposta: row.numero_proposta,
          administradora: row.administradora,
          segmento: row.segmento,
          tabela: row.tabela,
          status: row.status,
          base_calculo: row.base_calculo,
          percent_aplicado: row.percent_aplicado,
          valor_total: row.valor_total,
          data_venda: row.data_venda,
          data_pagamento: row.data_pagamento,
          flow: (row.flows ?? []) as CommissionFlow[],
        }));

        setCommissions(mappedComms);

        // vendas sem comissão
        let qbV = supabase
          .from("vendas_sem_comissao")
          .select(
            `
          id,
          vendedor_id,
          cliente_nome,
          numero_proposta,
          administradora,
          segmento,
          tabela,
          data_venda,
          valor_venda
        `,
          )
          .order("data_venda", { ascending: false });

        if (vendedorId !== "all") {
          qbV = qbV.eq("vendedor_id", vendedorId);
        }
        if (administradora !== "all") {
          qbV = qbV.eq("administradora", administradora);
        }
        if (segmento !== "all") {
          qbV = qbV.eq("segmento", segmento);
        }
        if (tabela !== "all") {
          qbV = qbV.eq("tabela", tabela);
        }

        const { data: vendasData } = await qbV;

        setVendasSemComissao((vendasData ?? []) as VendaSemComissao[]);
      } catch (e) {
        console.error("Erro ao carregar dados:", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [vendedorId, administradora, segmento, tabela, status]);

  // ====== Métricas / dashboards simples (previsto x pago) ======
  const resumoKpis = useMemo(() => {
    let totalPrevisto = 0;
    let totalPago = 0;

    commissions.forEach((c) => {
      const total = c.valor_total ?? 0;
      totalPrevisto += total;
      const pago = (c.flow ?? [])
        .filter((f) => f.status === "pago")
        .reduce((acc, f) => acc + (f.valor_pago_vendedor ?? 0), 0);
      totalPago += pago;
    });

    const saldo = totalPrevisto - totalPago;

    return {
      totalPrevisto,
      totalPago,
      saldo,
    };
  }, [commissions]);

  const donutData = useMemo(
    () => [
      {
        name: "Previsto",
        value: resumoKpis.totalPrevisto,
      },
      {
        name: "Pago",
        value: resumoKpis.totalPago,
      },
      {
        name: "Saldo",
        value: resumoKpis.saldo,
      },
    ],
    [resumoKpis],
  );

  // Linha mensal simples (agrupando por mês de data_venda)
  const lineData = useMemo(() => {
    const map = new Map<
      string,
      { label: string; previsto: number; pago: number }
    >();

    commissions.forEach((c) => {
      if (!c.data_venda) return;
      const d = new Date(c.data_venda);
      if (Number.isNaN(d.getTime())) return;
      const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      if (!map.has(label)) {
        map.set(label, { label, previsto: 0, pago: 0 });
      }
      const item = map.get(label)!;
      const total = c.valor_total ?? 0;
      item.previsto += total;
      const pago = (c.flow ?? [])
        .filter((f) => f.status === "pago")
        .reduce((acc, f) => acc + (f.valor_pago_vendedor ?? 0), 0);
      item.pago += pago;
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [commissions]);

  // ====== A pagar – busca (nome ou nº proposta) e paginação ======
  const rowsAPagarBase = useMemo(
    () => commissions.filter((c) => c.status === "a_pagar"),
    [commissions],
  );

  const rowsAPagarFiltered = useMemo(() => {
    const q = normalize(unpaidSearch);
    if (!q) return rowsAPagarBase;
    return rowsAPagarBase.filter((r) => {
      const byProp = normalize(r.numero_proposta || "").includes(q);
      const byName = normalize(r.cliente_nome || "").includes(q);
      return byProp || byName;
    });
  }, [rowsAPagarBase, unpaidSearch]);

  const unpaidTotalPages = Math.max(
    1,
    Math.ceil(rowsAPagarFiltered.length / UNPAID_PAGE_SIZE),
  );
  const unpaidPageRows = useMemo(() => {
    const start = (unpaidPage - 1) * UNPAID_PAGE_SIZE;
    return rowsAPagarFiltered.slice(start, start + UNPAID_PAGE_SIZE);
  }, [rowsAPagarFiltered, unpaidPage]);

  useEffect(() => {
    setUnpaidPage(1);
  }, [unpaidSearch, rowsAPagarFiltered.length]);

  // ====== Pagas – busca (nome ou nº proposta) e paginação ======
  const rowsPagasBase = useMemo(
    () => commissions.filter((c) => c.status === "pago"),
    [commissions],
  );

  const rowsPagasFiltered = useMemo(() => {
    const q = normalize(paidSearch);
    if (!q) return rowsPagasBase;
    return rowsPagasBase.filter((r) => {
      const byProp = normalize(r.numero_proposta || "").includes(q);
      const byName = normalize(r.cliente_nome || "").includes(q);
      return byProp || byName;
    });
  }, [rowsPagasBase, paidSearch]);

  const paidTotalPages = Math.max(
    1,
    Math.ceil(rowsPagasFiltered.length / PAID_PAGE_SIZE),
  );
  const paidPageRows = useMemo(() => {
    const start = (paidPage - 1) * PAID_PAGE_SIZE;
    return rowsPagasFiltered.slice(start, start + PAID_PAGE_SIZE);
  }, [rowsPagasFiltered, paidPage]);

  useEffect(() => {
    setPaidPage(1);
  }, [paidSearch, rowsPagasFiltered.length]);

  // ====== Overlay de pagamento (conceitual, mantido simples) ======
  const abrirPagamento = (c: Commission) => {
    setPayOverlayCommission(c);
    setPayOverlayOpen(true);
  };

  const fecharPagamento = () => {
    setPayOverlayOpen(false);
    setPayOverlayCommission(null);
  };

  const handleRegistrarPagamento = async () => {
    if (!payOverlayCommission) return;
    try {
      // aqui ficaria a lógica real de marcar parcelas como pagas,
      // subir comprovantes no bucket "comissoes" etc.
      alert("Simulação: pagamento registrado (implementar lógica real).");
      fecharPagamento();
    } catch (e) {
      console.error("Erro ao registrar pagamento:", e);
    }
  };

  // ====== Regras de comissão ======

  const fetchRulesForVendor = async (vId: string) => {
    if (!vId) {
      setRuleRows([]);
      return;
    }

    try {
      const { data } = await supabase
        .from("commission_rules")
        .select(
          `
        id,
        vendedor_id,
        sim_table_id,
        percent_padrao,
        fluxo_meses,
        fluxo_percentuais,
        obs
      `,
        )
        .eq("vendedor_id", vId);

      const rules = (data ?? []) as CommissionRule[];

      // map sim_table_id (real) -> groupKey
      const simIdToGroupKey: Record<string, string> = {};
      simGroups.forEach((g) => {
        g.ids.forEach((id) => {
          simIdToGroupKey[id] = g.key;
        });
      });

      type Aggreg = {
        key: string;
        admin_id: string | null;
        administradora: string;
        segmento: string;
        nome_tabela: string;
        rules: CommissionRule[];
      };

      const byGroup: Record<string, Aggreg> = {};

      rules.forEach((r) => {
        const groupKey = simIdToGroupKey[r.sim_table_id];
        // se não tiver grupo correspondente, ignora
        if (!groupKey) return;
        const g = groupByKey[groupKey];
        if (!g) return;

        if (!byGroup[groupKey]) {
          byGroup[groupKey] = {
            key: groupKey,
            admin_id: g.admin_id,
            administradora: g.administradora,
            segmento: g.segmento,
            nome_tabela: g.nome_tabela,
            rules: [],
          };
        }
        byGroup[groupKey].rules.push(r);
      });

      const rowsOut: (CommissionRule & {
        segmento: string;
        nome_tabela: string;
        administradora?: string | null;
      })[] = [];

      Object.values(byGroup).forEach((agg) => {
        const { rules: grpRules } = agg;
        if (!grpRules.length) return;

        const first = grpRules[0];
        // se todos tiverem os mesmos campos, consolidamos
        const allSamePercent = grpRules.every(
          (r) => r.percent_padrao === first.percent_padrao,
        );
        const allSameMeses = grpRules.every(
          (r) => r.fluxo_meses === first.fluxo_meses,
        );
        const allSameFluxArr = grpRules.every((r) => {
          if (!r.fluxo_percentuais || !first.fluxo_percentuais) return false;
          if (r.fluxo_percentuais.length !== first.fluxo_percentuais.length)
            return false;
          return r.fluxo_percentuais.every(
            (v, i) => v === first.fluxo_percentuais[i],
          );
        });

        const percent_padrao = allSamePercent ? first.percent_padrao : 0;
        const fluxo_meses = allSameMeses ? first.fluxo_meses : 0;
        const fluxo_percentuais = allSameFluxArr
          ? first.fluxo_percentuais
          : [];

        rowsOut.push({
          ...first,
          sim_table_id: agg.key,
          percent_padrao,
          fluxo_meses,
          fluxo_percentuais,
          segmento: agg.segmento,
          nome_tabela: agg.nome_tabela,
          administradora: agg.administradora,
        });
      });

      rowsOut.sort((a, b) => {
        if ((a.administradora || "") !== (b.administradora || "")) {
          return (a.administradora || "").localeCompare(
            b.administradora || "",
            "pt-BR",
          );
        }
        if (a.segmento !== b.segmento) {
          return a.segmento.localeCompare(b.segmento, "pt-BR");
        }
        return a.nome_tabela.localeCompare(b.nome_tabela, "pt-BR");
      });

      setRuleRows(rowsOut);
    } catch (e) {
      console.error("Erro carregando regras de comissão:", e);
      setRuleRows([]);
    }
  };

  // Carregar regras quando abrir overlay + tiver vendedor selecionado
  useEffect(() => {
    if (openRules && ruleVendorId) {
      fetchRulesForVendor(ruleVendorId);
    }
  }, [openRules, ruleVendorId, simGroups.length]);

  const handleChangeRuleMeses = (meses: number) => {
    if (!Number.isFinite(meses) || meses <= 0) {
      setRuleMeses(1);
      setRuleFluxoPct(["100,00"]);
      return;
    }
    const m = Math.max(1, Math.min(120, Math.round(meses)));
    setRuleMeses(m);
    setRuleFluxoPct((prev) => {
      const copy = prev.slice(0, m);
      while (copy.length < m) copy.push("0,00");
      return copy;
    });
  };

  const handleOpenRuleEditorForGroup = (groupKey: string) => {
    if (!ruleVendorId) {
      alert("Selecione um vendedor antes de cadastrar/editar regras.");
      return;
    }
    setRuleSimTableId(groupKey);
    setEditingRuleGroupKey(groupKey);
    const existing = ruleRows.find((r) => r.sim_table_id === groupKey);
    if (existing) {
      loadRuleToForm(existing);
    } else {
      setRulePercent("1,20");
      setRuleMeses(1);
      setRuleFluxoPct(["100,00"]);
      setRuleObs("");
    }
  };

  const loadRuleToForm = (r: CommissionRule & { sim_table_id: string }) => {
    setRuleVendorId(r.vendedor_id);
    setRuleSimTableId(r.sim_table_id);
    setRulePercent(formatPctInput(r.percent_padrao));
    handleChangeRuleMeses(r.fluxo_meses || 1);
    const arr =
      (r.fluxo_percentuais ?? []).length === r.fluxo_meses
        ? r.fluxo_percentuais
        : new Array(r.fluxo_meses).fill(1 / r.fluxo_meses);
    setRuleFluxoPct(arr.map(formatPctInput));
    setRuleObs(r.obs || "");
    setEditingRuleGroupKey(r.sim_table_id);
  };

  const saveRule = async () => {
    if (!ruleVendorId || !ruleSimTableId) {
      alert("Selecione vendedor e tabela antes de salvar.");
      return;
    }
    const group = groupByKey[ruleSimTableId];
    if (!group) {
      alert("Grupo de tabela não encontrado.");
      return;
    }

    const percentPadrao = parsePctInput(rulePercent);
    const fluxArr = ruleFluxoPct.map((s) => parsePctInput(s));
    const somaFlux = fluxArr.reduce((acc, v) => acc + v, 0);

    if (Math.abs(somaFlux - 1) > 0.001) {
      const somaPctStr = (somaFlux * 100).toFixed(2).replace(".", ",");
      if (
        !window.confirm(
          `A soma do fluxo é ${somaPctStr}%. O ideal é 100%. Deseja continuar assim mesmo?`,
        )
      ) {
        return;
      }
    }

    try {
      // upsert em todas as sim_tables deste grupo
      const rowsToUpsert = group.ids.map((simId) => ({
        vendedor_id: ruleVendorId,
        sim_table_id: simId,
        percent_padrao: percentPadrao,
        fluxo_meses: ruleMeses,
        fluxo_percentuais: fluxArr,
        obs: ruleObs || null,
      }));

      const { error } = await supabase
        .from("commission_rules")
        .upsert(rowsToUpsert, {
          onConflict: "vendedor_id,sim_table_id",
        });

      if (error) throw error;

      await fetchRulesForVendor(ruleVendorId);
      alert("Regra salva com sucesso.");
    } catch (e: any) {
      console.error("Erro ao salvar regra:", e);
      alert("Erro ao salvar regra de comissão.");
    }
  };

  const deleteRule = async (vId: string, simGroupKey: string) => {
    const group = groupByKey[simGroupKey];
    if (!group) return;
    if (!window.confirm("Tem certeza que deseja limpar essa regra?")) return;
    try {
      const { error } = await supabase
        .from("commission_rules")
        .delete()
        .eq("vendedor_id", vId)
        .in("sim_table_id", group.ids);
      if (error) throw error;
      await fetchRulesForVendor(vId);
    } catch (e) {
      console.error("Erro ao limpar regra:", e);
      alert("Erro ao limpar regra.");
    }
  };

  // ====== Render ======
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Comissões
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe comissões previstas, pagas e configure regras por
            tabela.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenRules(true)}
          >
            <Settings className="mr-2 h-4 w-4" />
            Regras de Comissão
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // reload simples
              window.location.reload();
            }}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs + gráficos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>Total Previsto</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currencyBR(resumoKpis.totalPrevisto)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Soma de todas as comissões previstas.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>Total Pago</span>
              <DollarSign className="h-4 w-4 text-sky-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currencyBR(resumoKpis.totalPago)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Somatório de parcelas já pagas ao vendedor.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>Saldo a Pagar</span>
              <DollarSign className="h-4 w-4 text-rose-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currencyBR(resumoKpis.saldo)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Diferença entre previsto e pago.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-[320px]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>Distribuição</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                >
                  {donutData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) =>
                    currencyBR(
                      typeof value === "number" ? value : Number(value),
                    )
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="h-[320px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Evolução mensal (Previsto x Pago)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            <LineChartWrapper data={lineData} />
          </CardContent>
        </Card>
      </div>

      {/* Filtros principais */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FilterIcon className="h-4 w-4" />
              Filtros
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="flex flex-col gap-2">
              <Label>Vendedor</Label>
              <Select
                value={vendedorId}
                onValueChange={(v) => setVendedorId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome || u.email || "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Administradora</Label>
              <Select
                value={administradora}
                onValueChange={(v) => setAdministradora(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {adminFilterOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Segmento</Label>
              <Select
                value={segmento}
                onValueChange={(v) => setSegmento(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {segmentFilterOptions.map((seg) => (
                    <SelectItem key={seg} value={seg}>
                      {seg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Tabela</Label>
              <Select value={tabela} onValueChange={(v) => setTabela(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {tabelaFilterOptions.map((tbl) => (
                    <SelectItem key={tbl} value={tbl}>
                      {tbl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Status da Comissão</Label>
              <Select
                value={status}
                onValueChange={(v: any) => setStatus(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="a_pagar">A pagar</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="estorno">Estorno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs de detalhe */}
      <Tabs defaultValue="a_pagar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="a_pagar">
            Detalhamento de Comissões (a pagar)
          </TabsTrigger>
          <TabsTrigger value="pagas">Comissões pagas</TabsTrigger>
          <TabsTrigger value="sem_comissao">Vendas sem comissão</TabsTrigger>
        </TabsList>

        {/* A PAGAR */}
        <TabsContent value="a_pagar" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                <span>Comissões a pagar</span>
                <div className="flex items-center gap-2">
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      value={unpaidSearch}
                      placeholder="Buscar por cliente ou nº da proposta..."
                      onChange={(e) => setUnpaidSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 pr-4">Cliente</th>
                      <th className="py-2 pr-4">Proposta</th>
                      <th className="py-2 pr-4">Administradora</th>
                      <th className="py-2 pr-4">Segmento</th>
                      <th className="py-2 pr-4">Tabela</th>
                      <th className="py-2 pr-4 text-right">
                        Comissão Total
                      </th>
                      <th className="py-2 pr-4 text-right">% Pago</th>
                      <th className="py-2 pr-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidPageRows.map((r) => {
                      const total =
                        r.valor_total ??
                        (r.base_calculo ?? 0) *
                          (r.percent_aplicado ?? 0);
                      const pago = (r.flow ?? []).reduce(
                        (acc, f) =>
                          acc + (f.valor_pago_vendedor ?? 0),
                        0,
                      );
                      const percPago =
                        total > 0 ? pago / total : 0;

                      return (
                        <tr
                          key={r.id}
                          className="border-b last:border-0"
                        >
                          <td className="py-1 pr-4">
                            {r.cliente_nome || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.numero_proposta || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.administradora || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.segmento || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.tabela || "—"}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            {currencyBR(total)}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            {pct100(percPago)}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => abrirPagamento(r)}
                            >
                              Pagar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!unpaidPageRows.length && (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-4 text-center text-xs text-muted-foreground"
                        >
                          Nenhuma comissão a pagar encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação A pagar */}
              {unpaidTotalPages > 1 && (
                <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                  <span>
                    Página {unpaidPage} de {unpaidTotalPages}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={unpaidPage <= 1}
                    onClick={() =>
                      setUnpaidPage((p) => Math.max(1, p - 1))
                    }
                  >
                    {"<"}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={unpaidPage >= unpaidTotalPages}
                    onClick={() =>
                      setUnpaidPage((p) =>
                        Math.min(unpaidTotalPages, p + 1),
                      )
                    }
                  >
                    {">"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAGAS */}
        <TabsContent value="pagas" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                <span>Comissões pagas</span>
                <div className="flex items-center gap-2">
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      value={paidSearch}
                      placeholder="Buscar por cliente ou nº da proposta..."
                      onChange={(e) => setPaidSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 pr-4">Cliente</th>
                      <th className="py-2 pr-4">Proposta</th>
                      <th className="py-2 pr-4">Administradora</th>
                      <th className="py-2 pr-4">Segmento</th>
                      <th className="py-2 pr-4">Tabela</th>
                      <th className="py-2 pr-4 text-right">
                        Comissão Total
                      </th>
                      <th className="py-2 pr-4 text-right">
                        Data Pagamento
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidPageRows.map((r) => {
                      const total =
                        r.valor_total ??
                        (r.base_calculo ?? 0) *
                          (r.percent_aplicado ?? 0);
                      return (
                        <tr
                          key={r.id}
                          className="border-b last:border-0"
                        >
                          <td className="py-1 pr-4">
                            {r.cliente_nome || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.numero_proposta || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.administradora || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.segmento || "—"}
                          </td>
                          <td className="py-1 pr-4">
                            {r.tabela || "—"}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            {currencyBR(total)}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            {r.data_pagamento
                              ? formatISODateBR(r.data_pagamento)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {!paidPageRows.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-4 text-center text-xs text-muted-foreground"
                        >
                          Nenhuma comissão paga encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação pagas */}
              {paidTotalPages > 1 && (
                <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                  <span>
                    Página {paidPage} de {paidTotalPages}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={paidPage <= 1}
                    onClick={() =>
                      setPaidPage((p) => Math.max(1, p - 1))
                    }
                  >
                    {"<"}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={paidPage >= paidTotalPages}
                    onClick={() =>
                      setPaidPage((p) =>
                        Math.min(paidTotalPages, p + 1),
                      )
                    }
                  >
                    {">"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VENDAS SEM COMISSÃO */}
        <TabsContent value="sem_comissao" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Vendas sem comissão configurada
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Aqui você enxerga as vendas que ainda não possuem
                regra de comissão aplicada.
              </p>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 pr-4">Cliente</th>
                      <th className="py-2 pr-4">Proposta</th>
                      <th className="py-2 pr-4">Administradora</th>
                      <th className="py-2 pr-4">Segmento</th>
                      <th className="py-2 pr-4">Tabela</th>
                      <th className="py-2 pr-4">Data Venda</th>
                      <th className="py-2 pr-4 text-right">
                        Valor Venda
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasSemComissao.map((v) => (
                      <tr
                        key={v.id}
                        className="border-b last:border-0"
                      >
                        <td className="py-1 pr-4">
                          {v.cliente_nome || "—"}
                        </td>
                        <td className="py-1 pr-4">
                          {v.numero_proposta || "—"}
                        </td>
                        <td className="py-1 pr-4">
                          {v.administradora || "—"}
                        </td>
                        <td className="py-1 pr-4">
                          {v.segmento || "—"}
                        </td>
                        <td className="py-1 pr-4">
                          {v.tabela || "—"}
                        </td>
                        <td className="py-1 pr-4">
                          {formatISODateBR(v.data_venda)}
                        </td>
                        <td className="py-1 pr-4 text-right">
                          {currencyBR(v.valor_venda ?? 0)}
                        </td>
                      </tr>
                    ))}
                    {!vendasSemComissao.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-4 text-center text-xs text-muted-foreground"
                        >
                          Nenhuma venda sem comissão encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Overlay de Pagamento */}
      <Dialog
        open={payOverlayOpen}
        onOpenChange={(open) => {
          if (!open) fecharPagamento();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>
              Registrar pagamento das parcelas da comissão
              selecionada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {payOverlayCommission && (
              <>
                <div className="text-sm">
                  <div>
                    <strong>Cliente:</strong>{" "}
                    {payOverlayCommission.cliente_nome ||
                      "—"}
                  </div>
                  <div>
                    <strong>Proposta:</strong>{" "}
                    {payOverlayCommission.numero_proposta ||
                      "—"}
                  </div>
                  <div>
                    <strong>Vendedor:</strong>{" "}
                    {vendedorNome(
                      payOverlayCommission.vendedor_id || null,
                    )}
                  </div>
                </div>

                <div>
                  <Label>Anexar comprovantes</Label>
                  <UploadArea bucket="comissoes" />
                </div>

                <div className="text-xs text-muted-foreground">
                  *Aqui você pode implementar a marcação das
                  parcelas pagas, datas de repasse etc. Mantive como
                  estrutura básica para não perder o que já
                  funciona.*
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharPagamento}>
              Fechar
            </Button>
            <Button onClick={handleRegistrarPagamento}>
              Registrar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overlay Regras de Comissão */}
      <Dialog
        open={openRules}
        onOpenChange={(open) => setOpenRules(open)}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <DialogTitle>Regras de Comissão</DialogTitle>
                <DialogDescription>
                  Configure percentuais e fluxo de pagamento por
                  vendedor, administradora, segmento e tabela.
                </DialogDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  rulesListRef.current?.scrollIntoView({
                    behavior: "smooth",
                  })
                }
              >
                <Eye className="mr-2 h-4 w-4" />
                Ver regras cadastradas
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Filtros do overlay de regras */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="flex flex-col gap-2">
                <Label>Vendedor</Label>
                <Select
                  value={ruleVendorId}
                  onValueChange={(v) => setRuleVendorId(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome || u.email || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Administradora</Label>
                <Select
                  value={ruleAdminIdFilter}
                  onValueChange={(v) =>
                    setRuleAdminIdFilter(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {ruleAdminOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Segmento</Label>
                <Select
                  value={ruleSegmentFilter}
                  onValueChange={(v) =>
                    setRuleSegmentFilter(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {ruleSegmentOptions.map((seg) => (
                      <SelectItem key={seg} value={seg}>
                        {seg}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col items-end justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRuleAdminIdFilter("all");
                    setRuleSegmentFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            </div>

            {/* Lista de tabelas conforme filtros + ações Cadastrar/Editar/Limpar */}
            <div className="space-y-2 rounded-md border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  Tabelas encontradas
                </span>
                {!ruleVendorId && (
                  <span className="text-xs text-amber-600">
                    Selecione um vendedor antes de cadastrar ou
                    editar regras.
                  </span>
                )}
              </div>

              <div className="max-h-[260px] overflow-y-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 pr-4">Administradora</th>
                      <th className="py-2 pr-4">Segmento</th>
                      <th className="py-2 pr-4">Tabela</th>
                      <th className="py-2 pr-4 text-right">
                        % Padrão
                      </th>
                      <th className="py-2 pr-4 text-right">
                        Meses do Fluxo
                      </th>
                      <th className="py-2 pr-4 text-right">
                        Fluxo de Pagamento
                      </th>
                      <th className="py-2 pr-4 text-right">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSimGroupsForRules.map((g) => {
                      const r = ruleRows.find(
                        (row) => row.sim_table_id === g.key,
                      );
                      const fluxoDesc =
                        r &&
                        r.fluxo_percentuais &&
                        r.fluxo_percentuais.length
                          ? r.fluxo_percentuais
                              .map((p, idx) => {
                                const num =
                                  typeof p === "number" ? p : 0;
                                return `M${idx + 1}: ${formatPctInput(num)}`;
                              })
                              .join(" | ")
                          : "—";

                      return (
                        <tr
                          key={g.key}
                          className="border-b last:border-0"
                        >
                          <td className="py-1 pr-4">
                            {g.administradora}
                          </td>
                          <td className="py-1 pr-4">
                            {g.segmento}
                          </td>
                          <td className="py-1 pr-4">
                            {g.nome_tabela}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            {r
                              ? formatPctInput(
                                  r.percent_padrao ?? 0,
                                )
                              : "—"}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            {r?.fluxo_meses || "—"}
                          </td>
                          <td className="py-1 pr-4 text-right">
                            <span className="text-xs">
                              {fluxoDesc}
                            </span>
                          </td>
                          <td className="py-1 pr-0 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!ruleVendorId}
                                onClick={() =>
                                  handleOpenRuleEditorForGroup(
                                    g.key,
                                  )
                                }
                              >
                                {r ? "Editar" : "Cadastrar"}
                              </Button>
                              {r && (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  disabled={!ruleVendorId}
                                  onClick={() =>
                                    deleteRule(
                                      ruleVendorId,
                                      g.key,
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredSimGroupsForRules.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-4 text-center text-xs text-muted-foreground"
                        >
                          Nenhuma tabela encontrada para os
                          filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Painel de edição da regra (overlay interno) */}
            {editingRuleGroupKey && (
              <div className="space-y-4 rounded-md border bg-slate-50 p-4">
                {(() => {
                  const g =
                    groupByKey[editingRuleGroupKey] || null;
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm">
                          <div>
                            <strong>Vendedor:</strong>{" "}
                            {vendedorNome(ruleVendorId)}
                          </div>
                          <div>
                            <strong>Tabela:</strong>{" "}
                            {g
                              ? `${g.administradora} – ${g.segmento} – ${g.nome_tabela}`
                              : "—"}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditingRuleGroupKey(null)
                          }
                        >
                          Fechar edição
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="flex flex-col gap-2">
                          <Label>% Padrão da comissão</Label>
                          <Input
                            value={rulePercent}
                            onChange={(e) =>
                              setRulePercent(e.target.value)
                            }
                            placeholder="1,20"
                          />
                          <p className="text-xs text-muted-foreground">
                            Percentual aplicado sobre a base de
                            cálculo.
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label>Meses do fluxo</Label>
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            value={ruleMeses}
                            onChange={(e) =>
                              handleChangeRuleMeses(
                                Number(e.target.value),
                              )
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Quantidade de meses (parcelas) do
                            fluxo de pagamento.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label>Fluxo de pagamento (%)</Label>
                        <p className="text-xs text-muted-foreground">
                          Distribua o percentual da comissão em
                          cada mês. Idealmente a soma deve ser
                          100%.
                        </p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
                          {Array.from({ length: ruleMeses }).map(
                            (_, idx) => (
                              <div
                                key={idx}
                                className="flex flex-col gap-1"
                              >
                                <span className="text-xs text-muted-foreground">
                                  Mês {idx + 1}
                                </span>
                                <Input
                                  value={ruleFluxoPct[idx] ?? ""}
                                  onChange={(e) =>
                                    setRuleFluxoPct((prev) => {
                                      const copy = [...prev];
                                      copy[idx] =
                                        e.target.value;
                                      return copy;
                                    })
                                  }
                                />
                              </div>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="md:col-span-2">
                          <Label>Observações</Label>
                          <Input
                            value={ruleObs}
                            onChange={(e) =>
                              setRuleObs(e.target.value)
                            }
                            placeholder="Regras específicas, exceções..."
                          />
                        </div>
                        <div className="flex items-end justify-end gap-2">
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => {
                              setRulePercent("1,20");
                              setRuleMeses(1);
                              setRuleFluxoPct(["100,00"]);
                              setRuleObs("");
                            }}
                          >
                            Limpar formulário
                          </Button>
                          <Button type="button" onClick={saveRule}>
                            <DollarSign className="mr-2 h-4 w-4" />
                            Salvar regra
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Lista de regras cadastradas */}
            <div
              ref={rulesListRef}
              className="max-h-[320px] overflow-y-auto rounded-md border bg-white p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  Regras cadastradas
                </span>
                {ruleVendorId && (
                  <Badge variant="outline" className="text-xs">
                    {vendedorNome(ruleVendorId)}
                  </Badge>
                )}
              </div>

              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Administradora</th>
                    <th className="py-2 pr-4">Segmento</th>
                    <th className="py-2 pr-4">Tabela</th>
                    <th className="py-2 pr-4 text-right">
                      % Padrão
                    </th>
                    <th className="py-2 pr-4 text-right">
                      Meses do Fluxo
                    </th>
                    <th className="py-2 pr-4 text-right">
                      Fluxo de Pagamento
                    </th>
                    <th className="py-2 pr-4 text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ruleRows.map((r) => {
                    const fluxoDesc =
                      r.fluxo_percentuais &&
                      r.fluxo_percentuais.length
                        ? r.fluxo_percentuais
                            .map((p, idx) => {
                              const num =
                                typeof p === "number" ? p : 0;
                              return `M${idx + 1}: ${formatPctInput(num)}`;
                            })
                            .join(" | ")
                        : "—";

                    return (
                      <tr
                        key={r.id}
                        className="border-b last:border-0"
                      >
                        <td className="py-1 pr-4">
                          {r.administradora || "—"}
                        </td>
                        <td className="py-1 pr-4">
                          {r.segmento}
                        </td>
                        <td className="py-1 pr-4">
                          {r.nome_tabela}
                        </td>
                        <td className="py-1 pr-4 text-right">
                          {formatPctInput(r.percent_padrao ?? 0)}
                        </td>
                        <td className="py-1 pr-4 text-right">
                          {r.fluxo_meses}
                        </td>
                        <td className="py-1 pr-4 text-right">
                          <span className="text-xs">
                            {fluxoDesc}
                          </span>
                        </td>
                        <td className="py-1 pr-0 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                loadRuleToForm(r)
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                deleteRule(
                                  r.vendedor_id,
                                  r.sim_table_id,
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!ruleRows.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-4 text-center text-xs text-muted-foreground"
                      >
                        Nenhuma regra cadastrada para o vendedor
                        selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenRules(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ComissoesPage;
