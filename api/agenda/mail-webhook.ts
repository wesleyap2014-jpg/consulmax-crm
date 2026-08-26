import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
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
    console.log('[agenda-mail-webhook] payload', JSON.stringify(body))
    return res.status(204).end()
  } catch (err: any) {
    console.error('[agenda-mail-webhook] error', err)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
}
