import { supabase } from "@/lib/supabaseClient";
import type { WorkItem } from "./customerSuccessModel";

const PORTO_VELHO_OFFSET = "-04:00";
const FOLLOW_UP_PREFIX = "Follow-up Sucesso do Cliente";

type UnitLocation = { cidade: string; uf: string };

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function ymdFromParts(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function ymdTodayPortoVelho() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Porto_Velho",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return ymdFromParts(get("year"), get("month"), get("day"));
}

function addDaysYMD(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return ymdFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function weekdayYMD(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function easterSundayYMD(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymdFromParts(year, month, day);
}

function holidaySet(year: number, location: UnitLocation) {
  const holidays = new Set<string>([
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
    addDaysYMD(easterSundayYMD(year), -2),
  ]);

  const uf = normalize(location.uf).toUpperCase();
  const city = normalize(location.cidade);

  if (uf === "RO") holidays.add(`${year}-01-04`);
  if (city === "ji-parana") holidays.add(`${year}-08-16`);
  if (city === "ouro preto do oeste") holidays.add(`${year}-06-16`);

  return holidays;
}

async function loadUserLocation(authUserId: string | null): Promise<UnitLocation> {
  if (!authUserId) return { cidade: "Ji-Paraná", uf: "RO" };

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("unit_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (userError) throw userError;

  if (!(user as any)?.unit_id) return { cidade: "Ji-Paraná", uf: "RO" };

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("cidade,uf")
    .eq("id", (user as any).unit_id)
    .maybeSingle();
  if (unitError) throw unitError;

  return {
    cidade: String((unit as any)?.cidade || "Ji-Paraná"),
    uf: String((unit as any)?.uf || "RO"),
  };
}

function nextBusinessDayAfterThreeDays(location: UnitLocation) {
  let date = addDaysYMD(ymdTodayPortoVelho(), 3);

  for (let guard = 0; guard < 10; guard += 1) {
    const [year] = date.split("-").map(Number);
    const weekend = [0, 6].includes(weekdayYMD(date));
    const holiday = holidaySet(year, location).has(date);
    if (!weekend && !holiday) return date;
    date = addDaysYMD(date, 1);
  }

  return date;
}

function isoAtPortoVelho(ymd: string, hour: number, minute = 0) {
  return new Date(`${ymd}T${pad2(hour)}:${pad2(minute)}:00${PORTO_VELHO_OFFSET}`).toISOString();
}

export function formatFollowUpDateBR(ymd: string) {
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

export async function scheduleCustomerSuccessFollowUp(
  item: WorkItem,
  authUserId: string | null,
  attemptNumber: number,
) {
  if (!authUserId) throw new Error("Não foi possível identificar o usuário responsável pelo follow-up.");

  const location = await loadUserLocation(authUserId);
  const dueYmd = nextBusinessDayAfterThreeDays(location);
  const startIso = isoAtPortoVelho(dueYmd, 9, 0);
  const endIso = isoAtPortoVelho(dueYmd, 9, 30);
  const now = new Date().toISOString();
  const vendaId = String(item.venda?.id || "");
  const clientName = String(item.cliente?.nome || item.lead?.nome || "Cliente").trim();

  if (!vendaId) throw new Error("Venda não identificada para criar o follow-up.");

  const { data: pending, error: pendingError } = await supabase
    .from("agenda_eventos")
    .select("id")
    .eq("relacao_id", vendaId)
    .eq("tipo", "contato")
    .eq("origem", "auto")
    .is("completed_at", null)
    .ilike("titulo", `${FOLLOW_UP_PREFIX}%`);
  if (pendingError) throw pendingError;

  const pendingIds = (pending || []).map((row: any) => row.id).filter(Boolean);
  if (pendingIds.length) {
    const { error: closeError } = await supabase
      .from("agenda_eventos")
      .update({
        completed_at: now,
        completion_notes: `Nova tentativa de contato registrada (${attemptNumber}ª tentativa).`,
        updated_at: now,
      })
      .in("id", pendingIds);
    if (closeError) throw closeError;
  }

  const { data: created, error: createError } = await supabase
    .from("agenda_eventos")
    .insert({
      tipo: "contato",
      titulo: `${FOLLOW_UP_PREFIX} — ${clientName}`,
      cliente_id: item.cliente?.id || null,
      lead_id: item.lead?.id || item.venda?.lead_id || null,
      user_id: authUserId,
      inicio_at: startIso,
      fim_at: endIso,
      origem: "auto",
      relacao_id: vendaId,
      descricao: `Retorno automático após a ${attemptNumber}ª tentativa de contato do Sucesso do Cliente.`,
    })
    .select("id")
    .single();
  if (createError) throw createError;

  return { id: (created as any)?.id as string, dueYmd, startIso };
}
