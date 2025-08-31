import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const brl = (v:number | string) =>
  new Intl.NumberFormat('pt-BR',{ style:'currency', currency:'BRL'}).format(Number(v||0))

export const dt = (d: Date | string | number) => format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR })
