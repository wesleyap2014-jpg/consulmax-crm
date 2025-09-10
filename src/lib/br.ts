// src/lib/br.ts

/** Somente dígitos */
export const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");

/** Máscara de telefone BR ( (DD) 9 9999-9999 ) */
export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 3);
  const p3 = d.slice(3, 7);
  const p4 = d.slice(7, 11);
  let out = "";
  if (p1) out += `(${p1}) `;
  if (p2) out += p2 + (p3 ? " " : "");
  if (p3) out += p3;
  if (p4) out += "-" + p4;
  return out.trim();
}

/** Remove máscara de telefone */
export function unmaskPhone(v: string) {
  return onlyDigits(v);
}

/** CPF: 000.000.000-00 */
export function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "-" + p4;
  return out;
}

/** CNPJ: 00.000.000/0000-00 */
export function maskCNPJ(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "/" + p4;
  if (p5) out += "-" + p5;
  return out;
}

/** CEP: 00000-000 */
export function maskCEP(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 5) return d;
  return d.slice(0, 5) + "-" + d.slice(5);
}

/** Link de WhatsApp (auto 55 para números de 10–11 dígitos sem DDI) */
export function waLink(phone?: string | null, text?: string) {
  const raw = String(phone || "");
  let d = onlyDigits(raw);
  if (!d) return null;

  // se já começa com 55, mantém; se tiver 10–11 dígitos (formato BR), prefixa 55
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) {
    d = `55${d}`;
  }
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${d}${q}`;
}

/** Formata moeda BRL */
export function brMoney(v?: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** YYYY-MM-DD (local date -> string) */
export function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO começo/fim do dia em localtime */
export function dayISO(d: Date, end = false) {
  const z = new Date(d);
  if (end) z.setHours(23, 59, 59, 999);
  else z.setHours(0, 0, 0, 0);
  return z.toISOString();
}

/** DateTime legível pt-BR */
export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Date legível dd/mm/aaaa */
export function fmtDateBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
