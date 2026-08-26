import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const MAX_ICS_BYTES = 1024 * 1024

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function unfoldIcs(value: string) {
  return String(value || '').replace(/\r?\n[ \t]/g, '')
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function senderEmail(from: unknown) {
  if (!from) return ''
  if (typeof from === 'string') {
    const bracket = from.match(/<([^>]+@[^>]+)>/)
    return String(bracket?.[1] || from).trim().toLowerCase()
  }
  if (Array.isArray(from)) return senderEmail(from[0])
  if (typeof from === 'object') {
    const obj = from as Record<string, unknown>
    return String(obj.address || obj.email || obj.mail || '').trim().toLowerCase()
  }
  return ''
}

function parseCalendarReply(raw: string, fallbackEmail?: string | null) {
  const ics = unfoldIcs(raw)
  if (!/BEGIN:VCALENDAR/i.test(ics)) return null
  if (!/^METHOD:REPLY\s*$/im.test(ics)) return null

  const uidMatch = ics.match(/^UID:([^\r\n]+)$/im)
  if (!uidMatch) return null
  const uid = uidMatch[1].trim()
  const eventMatch = uid.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@consulmaxcrm$/i)
  if (!eventMatch) return null

  const attendeeLines = ics.match(/^ATTENDEE[^\r\n]*$/gim) || []
  for (const line of attendeeLines) {
    const statusMatch = line.match(/(?:^|;)PARTSTAT=([^;:]+)/i)
    const mailMatch = line.match(/:mailto:([^\s;\r\n]+)/i)
    const partstat = String(statusMatch?.[1] || '').trim().toUpperCase()
    const email = String(mailMatch?.[1] || fallbackEmail || '').trim().toLowerCase()
    if (!email || !['ACCEPTED', 'DECLINED', 'TENTATIVE'].includes(partstat)) continue
    return { eventId: eventMatch[1].toLowerCase(), email, partstat }
  }
  return null
}

function isTrustedAttachmentUrl(raw: unknown) {
  try {
    const url = new URL(String(raw || ''))
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'storage.googleapis.com' || host.endsWith('.googleapis.com') || host.endsWith('.hostinger.com') || host.endsWith('.hostingerusercontent.com')
  } catch {
    return false
  }
}

async function downloadIcs(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error(`Calendar attachment fetch failed: ${response.status}`)
    const length = Number(response.headers.get('content-length') || 0)
    if (length > MAX_ICS_BYTES) throw new Error('Calendar attachment too large')
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_ICS_BYTES) throw new Error('Calendar attachment too large')
    return text
  } finally {
    clearTimeout(timeout)
  }
}

async function applyReply(reply: { eventId: string; email: string; partstat: string }) {
  if (reply.partstat === 'TENTATIVE') {
    console.log('[agenda-mail-webhook-v2] tentative reply kept as pending', reply.eventId, reply.email)
    return { matched: false, tentative: true }
  }

  const nextStatus = reply.partstat === 'ACCEPTED' ? 'accepted' : 'declined'
  const { data: guest, error: findError } = await admin
    .from('agenda_event_guests')
    .select('id,event_id,email,rsvp_status')
    .eq('event_id', reply.eventId)
    .ilike('email', reply.email)
    .maybeSingle()

  if (findError) throw findError
  if (!guest) {
    console.log('[agenda-mail-webhook-v2] no guest match', reply.eventId, reply.email, reply.partstat)
    return { matched: false }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from('agenda_event_guests')
    .update({
      rsvp_status: nextStatus,
      responded_at: now,
      updated_at: now,
      rsvp_source: 'calendar_reply',
    })
    .eq('id', guest.id)

  if (updateError) throw updateError
  console.log('[agenda-mail-webhook-v2] rsvp updated', guest.id, nextStatus, 'calendar_reply')
  return { matched: true, status: nextStatus }
}

function parseSubjectReply(subject: string) {
  const patterns: Array<[RegExp, 'ACCEPTED' | 'DECLINED' | 'TENTATIVE']> = [
    [/^(aceito|accepted|aceptado)\s*:\s*(.+)$/i, 'ACCEPTED'],
    [/^(recusado|declined|rechazado)\s*:\s*(.+)$/i, 'DECLINED'],
    [/^(provisorio|provisório|tentative|talvez)\s*:\s*(.+)$/i, 'TENTATIVE'],
  ]
  for (const [regex, partstat] of patterns) {
    const match = String(subject || '').trim().match(regex)
    if (match) return { partstat, title: String(match[2] || '').trim() }
  }
  return null
}

async function applySubjectFallback(subject: string, email: string) {
  const parsed = parseSubjectReply(subject)
  if (!parsed || !email) return { matched: false }
  if (parsed.partstat === 'TENTATIVE') return { matched: false, tentative: true }

  const { data: guestRows, error: guestError } = await admin
    .from('agenda_event_guests')
    .select('id,event_id,email,rsvp_status')
    .ilike('email', email)
    .in('rsvp_status', ['pending', 'accepted', 'declined'])
    .limit(100)
  if (guestError) throw guestError
  if (!guestRows?.length) return { matched: false }

  const eventIds = [...new Set(guestRows.map((g) => g.event_id).filter(Boolean))]
  const { data: events, error: eventError } = await admin
    .from('agenda_eventos')
    .select('id,titulo,inicio_at')
    .in('id', eventIds)
    .limit(100)
  if (eventError) throw eventError

  const targetTitle = normalizeText(parsed.title)
  const matches = (events || []).filter((event) => normalizeText(event.titulo || '') === targetTitle)
  if (matches.length !== 1) {
    console.log('[agenda-mail-webhook-v2] subject fallback ambiguous', email, parsed.title, matches.length)
    return { matched: false, ambiguous: matches.length }
  }

  return applyReply({ eventId: matches[0].id, email, partstat: parsed.partstat })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server configuration unavailable' })

  try {
    const auth = String(req.headers.authorization || '')
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const { data: secretRow, error: secretError } = await admin
      .from('integration_webhook_secrets')
      .select('secret_sha256,is_active')
      .eq('provider', 'hostinger_mail')
      .eq('purpose', 'agenda_rsvp')
      .maybeSingle()

    if (secretError) throw secretError
    if (!secretRow?.is_active || !secretRow.secret_sha256 || sha256(token) !== secretRow.secret_sha256) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const body = req.body || {}
    if (body?.event !== 'message.received') return res.status(204).end()
    const data = body?.data || body?.message || {}
    const fallbackEmail = senderEmail(data?.from)

    const inlineSources = [String(data?.plainBody || ''), String(data?.htmlBody || ''), String(data?.text || ''), String(data?.html || '')]
    for (const source of inlineSources) {
      const reply = parseCalendarReply(source, fallbackEmail)
      if (reply) {
        await applyReply(reply)
        return res.status(204).end()
      }
    }

    const attachments = Array.isArray(data?.attachments) ? data.attachments : []
    for (const attachment of attachments) {
      const contentType = String(attachment?.contentType || attachment?.content_type || '').toLowerCase()
      const filename = String(attachment?.filename || '').toLowerCase()
      if (!contentType.startsWith('text/calendar') && !filename.endsWith('.ics')) continue
      const fileUrl = attachment?.fileUrl || attachment?.url || attachment?.downloadUrl || attachment?.download_url
      if (!isTrustedAttachmentUrl(fileUrl)) continue

      const rawIcs = await downloadIcs(String(fileUrl))
      const reply = parseCalendarReply(rawIcs, fallbackEmail)
      if (!reply) continue
      await applyReply(reply)
      return res.status(204).end()
    }

    const subjectResult = await applySubjectFallback(String(data?.subject || ''), fallbackEmail)
    if (subjectResult.matched) return res.status(204).end()

    console.log('[agenda-mail-webhook-v2] message ignored', data?.messageId || data?.id || '', {
      subject: String(data?.subject || '').slice(0, 120),
      from: fallbackEmail,
      attachmentKeys: attachments.map((a: any) => Object.keys(a || {}).sort()),
    })
    return res.status(204).end()
  } catch (err: any) {
    console.error('[agenda-mail-webhook-v2] error', err)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}
