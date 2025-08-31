export const onlyDigits = (s:string) => (s||'').replace(/\D/g,'')
export const maskPhone = (v:string) =>
  onlyDigits(v).replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3")
export const maskCpf = (v:string) =>
  onlyDigits(v).replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, "$1.$2.$3-$4")
export const maskCep = (v:string) =>
  onlyDigits(v).replace(/^(\d{5})(\d{3}).*/, "$1-$2")
