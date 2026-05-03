// /api/client-context.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body)
}

function parseBody(req: VercelRequest) {
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body)
  return req.body || {}
}

function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D+/g, '')
}

function brMoney(value: any) {
  const n = Number(value || 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function uniqById<T extends { id?: string }>(rows: T[]) {
  const map = new Map<string, T>()
  for (const row of rows) {
    if (row?.id) map.set(row.id, row)
  }
  return Array.from(map.values())
}

async function getAuthUserId(req: VercelRequest) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) return null
  const jwt = authHeader.replace('Bearer ', '')
  const { data } = await admin.auth.getUser(jwt)
  return data?.user?.id ?? null
}

async function safeSelectSingle(table: string, column: string, value: string) {
  if (!value) return null
  const { data, error } = await admin.from(table).select('*').eq(column, value).maybeSingle()
  if (error) return null
  return data
}

async function safeSelectMany(table: string, column: string, value: string) {
  if (!value) return []
  const { data, error } = await admin.from(table).select('*').eq(column, value).limit(300)
  if (error) return []
  return data || []
}

async function safeMeetingNotes(agendaEventoId: string) {
  const { data, error } = await admin
    .from('meeting_notes')
    .select('*')
    .eq('agenda_evento_id', agendaEventoId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return []
  return data || []
}

function buildCarteira(vendas: any[]) {
  const ativas = vendas.filter((v) => String(v?.codigo || '') === '00' && !v?.cancelada_em)
  const canceladas = vendas.filter((v) => String(v?.codigo || '') !== '00' || !!v?.cancelada_em)
  const contempladas = vendas.filter((v) => !!v?.contemplada || !!v?.data_contemplacao)
  const inadimplentes = vendas.filter((v) => !!v?.inad || !!v?.inad_em || /inad/i.test(String(v?.status || '')))

  const totalAtivo = ativas.reduce((acc, v) => acc + Number(v?.valor_venda || 0), 0)
  const totalGeral = vendas.reduce((acc, v) => acc + Number(v?.valor_venda || 0), 0)

  const segmentos = Array.from(new Set(vendas.map((v) => v?.segmento).filter(Boolean)))
  const administradoras = Array.from(new Set(vendas.map((v) => v?.administradora).filter(Boolean)))

  const ultimasCotas = vendas
    .slice()
    .sort((a, b) => String(b?.data_venda || b?.created_at || '').localeCompare(String(a?.data_venda || a?.created_at || '')))
    .slice(0, 12)
    .map((v) => ({
      id: v.id,
      administradora: v.administradora || '—',
      segmento: v.segmento || v.produto || '—',
      grupo: v.grupo || '—',
      cota: v.cota || '—',
      codigo: v.codigo || '—',
      status: v.contemplada ? 'Contemplada' : (String(v.codigo || '') === '00' ? 'Ativa' : 'Cancelada'),
      valor_venda: Number(v.valor_venda || 0),
      valor_venda_fmt: brMoney(v.valor_venda || 0),
      data_venda: v.data_venda || null,
    }))

  return {
    qtd_total: vendas.length,
    qtd_ativas: ativas.length,
    qtd_canceladas: canceladas.length,
    qtd_contempladas: contempladas.length,
    qtd_inadimplentes: inadimplentes.length,
    total_ativo: totalAtivo,
    total_ativo_fmt: brMoney(totalAtivo),
    total_geral: totalGeral,
    total_geral_fmt: brMoney(totalGeral),
    segmentos,
    administradoras,
    ultimas_cotas: ultimasCotas,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(res, 500, { error: 'Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    }

    const authUserId = await getAuthUserId(req)
    if (!authUserId) return json(res, 401, { error: 'Usuário não autenticado.' })

    const body = parseBody(req)
    const agendaEventoId = String(body?.agenda_evento_id || '').trim()
    if (!agendaEventoId) return json(res, 400, { error: 'agenda_evento_id é obrigatório.' })

    const { data: evento, error: evError } = await admin
      .from('agenda_eventos')
      .select('id,cliente_id,lead_id,titulo,tipo,inicio_at,fim_at,user_id')
      .eq('id', agendaEventoId)
      .maybeSingle()

    if (evError) return json(res, 500, { error: evError.message })
    if (!evento) return json(res, 404, { error: 'Evento não encontrado.' })

    const cliente = evento.cliente_id ? await safeSelectSingle('clientes', 'id', evento.cliente_id) : null
    const lead = evento.lead_id ? await safeSelectSingle('leads', 'id', evento.lead_id) : null

    const vendasBuckets: any[][] = []
    if (evento.lead_id) vendasBuckets.push(await safeSelectMany('vendas', 'lead_id', evento.lead_id))
    if (cliente?.lead_id && cliente.lead_id !== evento.lead_id) vendasBuckets.push(await safeSelectMany('vendas', 'lead_id', cliente.lead_id))
    if (cliente?.cpf) vendasBuckets.push(await safeSelectMany('vendas', 'cpf', cliente.cpf))

    const cpfDigits = onlyDigits(cliente?.cpf)
    if (cpfDigits && cpfDigits !== cliente?.cpf) vendasBuckets.push(await safeSelectMany('vendas', 'cpf', cpfDigits))

    const phone = onlyDigits(cliente?.telefone || lead?.telefone)
    if (phone) vendasBuckets.push(await safeSelectMany('vendas', 'telefone', phone))

    const email = String(cliente?.email || lead?.email || '').trim()
    if (email) vendasBuckets.push(await safeSelectMany('vendas', 'email', email))

    const vendas = uniqById(vendasBuckets.flat())
    const carteira = buildCarteira(vendas)
    const meeting_notes = await safeMeetingNotes(agendaEventoId)

    return json(res, 200, {
      ok: true,
      evento,
      cliente,
      lead,
      carteira,
      meeting_notes,
    })
  } catch (err: any) {
    return json(res, 500, { error: err?.message || 'Erro inesperado.' })
  }
}
