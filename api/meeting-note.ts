// /api/meeting-note.ts
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

    const authHeader = req.headers.authorization || ''
    if (!authHeader.startsWith('Bearer ')) return json(res, 401, { error: 'Usuário não autenticado.' })

    const jwt = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await admin.auth.getUser(jwt)
    const authUserId = userData?.user?.id ?? null
    if (authError || !authUserId) return json(res, 401, { error: 'Sessão inválida.' })

    const body = parseBody(req)
    const agendaEventoId = String(body?.agenda_evento_id || '').trim()
    const rawNotes = String(body?.raw_notes || '').trim()
    const nextSteps = String(body?.next_steps || '').trim()

    if (!agendaEventoId) return json(res, 400, { error: 'agenda_evento_id é obrigatório.' })
    if (!rawNotes) return json(res, 400, { error: 'raw_notes é obrigatório.' })

    const { data: evento, error: evError } = await admin
      .from('agenda_eventos')
      .select('id,cliente_id,lead_id,user_id,titulo,tipo,video_room_id')
      .eq('id', agendaEventoId)
      .maybeSingle()

    if (evError) return json(res, 500, { error: evError.message })
    if (!evento) return json(res, 404, { error: 'Evento não encontrado.' })

    const { data: note, error: noteError } = await admin
      .from('meeting_notes')
      .insert({
        agenda_evento_id: evento.id,
        cliente_id: evento.cliente_id,
        lead_id: evento.lead_id,
        raw_notes: rawNotes,
        next_steps: nextSteps,
      })
      .select('*')
      .single()

    if (noteError) return json(res, 500, { error: noteError.message })

    const completedAt = new Date().toISOString()

    const { error: updateError } = await admin
      .from('agenda_eventos')
      .update({ video_status: 'finished', completed_at: completedAt, completion_notes: rawNotes })
      .eq('id', evento.id)

    if (updateError) return json(res, 500, { error: updateError.message })

    if (evento.video_room_id) {
      await admin.from('video_rooms').update({ status: 'finished', updated_at: completedAt }).eq('id', evento.video_room_id)
    } else {
      await admin.from('video_rooms').update({ status: 'finished', updated_at: completedAt }).eq('agenda_evento_id', evento.id)
    }

    await admin
      .from('video_sessions')
      .update({ status: 'finished', ended_at: completedAt })
      .eq('agenda_evento_id', evento.id)

    return json(res, 200, { ok: true, note })
  } catch (err: any) {
    return json(res, 500, { error: err?.message || 'Erro inesperado.' })
  }
}
