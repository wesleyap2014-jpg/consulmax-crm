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
    if (!email || !partstat) continue
    if (!['ACCEPTED', 'DECLINED', 'TENTATIVE'].includes(partstat)) continue
    return { eventId: eventMatch[1].toLowerCase(), email, partstat }
  }

  const fallback = String(fallbackEmail || '').trim().toLowerCase()
  const statusMatch = ics.match(/(?:^|;)PARTSTAT=([^;:\r\n]+)/i)
  if (fallback && statusMatch) {
    const partstat = String(statusMatch[1]).trim().toUpperCase()
    if (['ACCEPTED', 'DECLINED', 'TENTATIVE'].includes(partstat)) {
      return { eventId: eventMatch[1].toLowerCase(), email: fallback, partstat }
    }
  }
  return null
}

function isTrustedAttachmentUrl(raw: unknown) {
  try {
    const url = new URL(String(raw || ''))
    return url.protocol === 'https:' && (url.hostname === 'storage.googleapis.com' || url.hostname.endsWith('.googleapis.com'))
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
    console.log('[agenda-mail-webhook] tentative reply kept as pending', reply.eventId, reply.email)
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
    console.log('[agenda-mail-webhook] no guest match', reply.eventId, reply.email, reply.partstat)
    return { matched: false }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from('agenda_event_guests')
    .update({ rsvp_status: nextStatus, responded_at: now, updated_at: now })
    .eq('id', guest.id)

  if (updateError) throw updateError
  console.log('[agenda-mail-webhook] rsvp updated', guest.id, nextStatus)
  return { matched: true, status: nextStatus }
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
    const data = body?.data || {}
    const fallbackEmail = String(data?.from || '').trim().toLowerCase()

    const inlineSources = [String(data?.plainBody || ''), String(data?.htmlBody || '')]
    for (const source of inlineSources) {
      const reply = parseCalendarReply(source, fallbackEmail)
      if (reply) {
        await applyReply(reply)
        return res.status(204).end()
      }
    }

    const attachments = Array.isArray(data?.attachments) ? data.attachments : []
    for (const attachment of attachments) {
      const contentType = String(attachment?.contentType || '').toLowerCase()
      const filename = String(attachment?.filename || '').toLowerCase()
      if (!contentType.startsWith('text/calendar') && !filename.endsWith('.ics')) continue
      if (!isTrustedAttachmentUrl(attachment?.fileUrl)) continue

      const rawIcs = await downloadIcs(String(attachment.fileUrl))
      const reply = parseCalendarReply(rawIcs, fallbackEmail)
      if (!reply) continue
      await applyReply(reply)
      return res.status(204).end()
    }

    console.log('[agenda-mail-webhook] message ignored: no Consulmax calendar reply', data?.messageId || '')
    return res.status(204).end()
  } catch (err: any) {
    console.error('[agenda-mail-webhook] error', err)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}
