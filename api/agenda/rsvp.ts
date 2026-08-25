import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function shell(title: string, content: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#1E293F"><div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px"><div style="width:min(520px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:22px;box-shadow:0 18px 50px rgba(30,41,63,.12);overflow:hidden"><div style="background:#1E293F;padding:26px 28px;color:#fff"><div style="color:#E0CE8C;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Consulmax • Agenda</div><h1 id="rsvp-title" style="margin:8px 0 0;font-size:24px">${escapeHtml(title)}</h1></div><div id="rsvp-content" style="padding:28px">${content}</div></div></div></body></html>`
}

function resultPage(title: string, message: string, meetingUrl?: string | null) {
  return shell(title, `<p style="margin:0;color:#475569;line-height:1.65;font-size:16px">${escapeHtml(message)}</p>${meetingUrl ? `<a href="${escapeHtml(meetingUrl)}" style="margin-top:22px;display:inline-block;background:#A11C27;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:11px">Abrir sala da reunião</a>` : ''}<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Você já pode fechar esta página.</p>`)
}

function autoConfirmPage(token: string, response: string) {
  const safeToken = JSON.stringify(token)
  const safeResponse = JSON.stringify(response)
  const loading = `<div style="display:flex;align-items:center;gap:12px"><div style="width:20px;height:20px;border:3px solid #e2e8f0;border-top-color:#A11C27;border-radius:50%;animation:spin .8s linear infinite"></div><p style="margin:0;color:#475569;line-height:1.6">Registrando sua resposta…</p></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`
  const script = `<script>(async()=>{try{const r=await fetch('/api/agenda/rsvp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${safeToken},response:${safeResponse}})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível registrar.');document.getElementById('rsvp-title').textContent=j.title||'Resposta registrada';document.getElementById('rsvp-content').innerHTML='<p style="margin:0;color:#475569;line-height:1.65;font-size:16px">'+(j.message||'Sua resposta foi registrada.')+'</p>'+(j.meetingUrl?'<a href="'+j.meetingUrl+'" style="margin-top:22px;display:inline-block;background:#A11C27;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:11px">Abrir sala da reunião</a>':'')+'<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Você já pode fechar esta página.</p>';}catch(e){document.getElementById('rsvp-title').textContent='Não foi possível confirmar';document.getElementById('rsvp-content').innerHTML='<p style="margin:0;color:#475569;line-height:1.65;font-size:16px">Tente novamente em alguns instantes.</p>';}})();</script>`
  return shell('Confirmando presença', loading) + script
}

async function registerResponse(token: string, response: string) {
  const { data: guest, error } = await admin
    .from('agenda_event_guests')
    .select('id,event_id,name,email,rsvp_status')
    .eq('rsvp_token', token)
    .maybeSingle()

  if (error) throw error
  if (!guest) return { status: 404, body: { error: 'Convite não encontrado.' } }

  const nextStatus = response === 'accepted' ? 'accepted' : 'declined'
  const { error: updateError } = await admin
    .from('agenda_event_guests')
    .update({ rsvp_status: nextStatus, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', guest.id)
  if (updateError) throw updateError

  const { data: event } = await admin
    .from('agenda_eventos')
    .select('titulo,inicio_at,videocall_url,meeting_link')
    .eq('id', guest.event_id)
    .maybeSingle()

  const accepted = nextStatus === 'accepted'
  return {
    status: 200,
    body: {
      ok: true,
      title: accepted ? 'Presença confirmada' : 'Resposta registrada',
      message: accepted
        ? `Sua presença em “${event?.titulo || 'Compromisso Consulmax'}” foi confirmada com sucesso.`
        : `Registramos que você não poderá participar de “${event?.titulo || 'Compromisso Consulmax'}”.`,
      meetingUrl: accepted ? (event?.videocall_url || event?.meeting_link || null) : null,
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).send('Configuração indisponível.')

  if (req.method === 'GET') {
    const token = String(req.query.token || '').trim()
    const response = String(req.query.response || '').trim().toLowerCase()
    if (!token || !['accepted', 'declined'].includes(response)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.status(400).send(resultPage('Link inválido', 'Não foi possível identificar esta confirmação.'))
    }

    // O GET não altera dados. A confirmação é feita via POST executado no navegador,
    // reduzindo o risco de scanners de segurança de e-mail confirmarem presença sozinhos.
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(autoConfirmPage(token, response))
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const token = String(body.token || '').trim()
      const response = String(body.response || '').trim().toLowerCase()
      if (!token || !['accepted', 'declined'].includes(response)) {
        return res.status(400).json({ error: 'Resposta inválida.' })
      }
      const result = await registerResponse(token, response)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(result.status).json(result.body)
    } catch (err: any) {
      console.error('[agenda-rsvp]', err)
      return res.status(500).json({ error: err?.message || 'Não foi possível registrar sua resposta.' })
    }
  }

  return res.status(405).send('Método não permitido.')
}
