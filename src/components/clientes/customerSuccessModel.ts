export type CsStatus = "pendente" | "agendado" | "em_validacao" | "validado" | "atencao" | "divergencia" | "critico";
export type Answer = "" | "sim" | "parcial" | "nao" | "nao_soube";

export type CustomerSuccessStrongPoint = {
  comportamento: string;
  evidencia: string;
  reforcar: string;
};

export type CustomerSuccessAttentionPoint = {
  comportamento: string;
  evidencia: string;
  risco: string;
  como_melhorar: string;
};

export type CustomerSuccessReport = {
  versao: number;
  gerado_em: string;
  gerado_por: string;
  resumo_executivo: string;
  voz_do_cliente: string;
  fofa: {
    forcas: string[];
    oportunidades: string[];
    fraquezas: string[];
    ameacas: string[];
  };
  pontos_fortes: CustomerSuccessStrongPoint[];
  pontos_atencao: CustomerSuccessAttentionPoint[];
  acoes_recomendadas: string[];
  conclusao: string;
};

export type CsRecord = {
  status: CsStatus;
  tentativas?: number;
  contato_em?: string | null;
  proximo_contato_em?: string | null;
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
  objetivo?: string;
  uso_credito?: string;
  credito?: string;
  parcela?: string;
  estrategia?: string;
  expectativa?: string;
  contemplacao?: Answer;
  lance?: Answer;
  lance_embutido?: Answer;
  reajustes?: Answer;
  custos?: Answer;
  vencimento?: Answer;
  promessa_prazo?: boolean | null;
  promessa_contemplacao?: boolean | null;
  relato_promessa?: string;
  nota_vendedor?: number | null;
  motivo_nota?: string;
  clareza?: Answer;
  pressao?: boolean | null;
  seguranca?: boolean | null;
  duvida_final?: string;
  providencia?: string;
  google_review?: boolean;
  google_review_em?: string | null;
  obs?: string;
  report?: CustomerSuccessReport | null;
  updated_at?: string | null;
};

export type WorkItem = { venda: any; lead: any; cliente: any; vendedor_nome: string; cs: CsRecord };
export const CS_START_DATE = "2026-08-01";
export const GOOGLE_REVIEW_URL = String(import.meta.env.VITE_GOOGLE_REVIEW_URL || "").trim();
export const STATUS: Record<CsStatus, string> = {
  pendente: "Pendente",
  agendado: "Contato agendado",
  em_validacao: "Em validação",
  validado: "Validado",
  atencao: "Atenção",
  divergencia: "Divergência",
  critico: "Crítico",
};
export function parsePayload(raw?: string | null) {
  const t = String(raw || "").trim();
  if (!t) return {};
  const s = t.startsWith("CMX_JSON:") ? t.slice(9).trim() : t;
  try { return JSON.parse(s); } catch { return { obs_internas: t }; }
}
export const serializePayload = (p: any) => `CMX_JSON:${JSON.stringify(p)}`;
export const fmtMoney = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtDate = (v?: string | null) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—";
export const fmtDateTime = (v?: string | null) => v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
export function waNumber(v?: string | null) {
  const d = String(v || "").replace(/\D/g, "");
  return (d.length === 10 || d.length === 11) ? `55${d}` : d;
}
export function normalizeCs(v: any): CsRecord {
  return { ...(v || {}), status: STATUS[v?.status as CsStatus] ? v.status : "pendente", tentativas: Number(v?.tentativas || 0) };
}
