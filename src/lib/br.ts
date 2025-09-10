export const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");

export const normalizePhoneBR = (v?: string|null) => {
  const d = onlyDigits(v || "").replace(/^0+/, "");
  // aceita 10 ou 11 dígitos. não força DDI aqui.
  return d;
};

export const waLink = (raw?: string|null, text?: string) => {
  const d = normalizePhoneBR(raw);
  if (!d) return null;
  const withDDI = d.startsWith("55") ? d : `55${d}`;
  const url = new URL(`https://wa.me/${withDDI}`);
  if (text) url.searchParams.set("text", text);
  return url.toString();
};

export const maskPhone = (v: string) => {
  const d = normalizePhoneBR(v).slice(0, 11);
  const p1 = d.slice(0,2), p2=d.slice(2,3), p3=d.slice(3,7), p4=d.slice(7);
  return [p1 ? `(${p1})` : "", p2, p3 && ` ${p3}`, p4 && `-${p4}`].filter(Boolean).join("");
};

export const maskCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
};

export const maskCEP = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0,5)}-${d.slice(5)}` : d;
};
