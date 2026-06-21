export type AnyRow = Record<string, any>;

export type SearchMode = "credito" | "parcela";
export type EmbedDecision = "ia" | "sim" | "nao";
export type RadarSegment = "Automóvel" | "Imóvel" | "Serviços";
export type AdminFilter = "todas" | "bb" | "embracon" | "maggi";

export type AdminRow = {
  id: string;
  name: string;
  slug?: string | null;
  behavior?: AnyRow | null;
  rules?: AnyRow | null;
};

export type RadarInput = {
  modo: SearchMode;
  administradora: AdminFilter;
  segmento: RadarSegment;
  creditoLiquido: string;
  parcelaDesejada: string;
  lanceProprio: string;
  prazoContemplacao: string;
  usarEmbutido: EmbedDecision;
  probabilidadeMinima: string;
};

export type RadarSourceData = {
  admins: AdminRow[];
  bbGroups: AnyRow[];
  embraconTables: AnyRow[];
  maggiGroups: AnyRow[];
};

export type RadarCalculation = {
  creditoContratado: number;
  creditoLiquido: number;
  parcelaInicial: number;
  parcelaAposContemplacao: number;
  parcelaEstimada: number;
  lanceProprio: number;
  lanceProprioPct: number;
  lanceEmbutido: number;
  lanceEmbutidoPct: number;
  lanceTotal: number;
  lanceTotalPct: number;
  valorCategoria: number;
  saldoDevedor: number;
  prazoTotal: number;
  prazoRestante: number;
  taxaAdmPct: number;
  fundoReservaPct: number;
  seguroPct: number;
  antecipacaoPct?: number;
  antecipacaoParcelas?: number;
  limitadorParcelaPct?: number;
};

export type RadarScoreBreakdown = {
  credito: number;
  parcela: number;
  lance: number;
  perfilGrupo: number;
  entregas: number;
  taxaAdm: number;
  fundoReserva: number;
  assembleia: number;
  total: number;
};

export type RadarOffer = RadarCalculation & {
  id: string;
  admin: AdminRow;
  adminKey: Exclude<AdminFilter, "todas">;
  table: AnyRow;
  group?: AnyRow | null;
  score: number;
  scoreBreakdown: RadarScoreBreakdown;
  scoreLabel: string;
  poderCompra: number;
  lanceProprioDisponivel: number;
  lanceProprioSobra: number;
  quantidadeCotas: number;
  entregaMediaEsperada: number | null;
  entregaUltimaAssembleia: number | null;
  entregaIndicePct: number | null;
  proximaAssembleia?: string | null;
  probabilidadeContemplacao: number;
  prazoContemplacaoDesejado: number;
  segmento: string;
  nomeTabela: string;
  grupoCodigo?: string | null;
  estrategia: string;
  motivos: string[];
  alertas: string[];
  simulatorPath: string;
  simulatorParams: Record<string, string>;
};

export type EngineContext = {
  input: RadarInput;
  admin: AdminRow;
};

export type EngineResult = RadarOffer[];
