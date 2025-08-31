import * as React from 'react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

export default function Login(){
  const nav = useNavigate()
  const [email,setEmail] = React.useState('')
  const [password,setPassword] = React.useState('')
  const [error,setError] = React.useState('')

  async function onSubmit(e:React.FormEvent){
    e.preventDefault()
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); return }
    const { data: profile } = await supabase.from('users_safe').select('*').eq('auth_user_id', data.session!.user.id).single()
    if (!profile) return
    if (profile.must_change_password) {
      const newPass = prompt('Defina sua nova senha (mín. 8 caracteres):') || ''
      if (newPass.length < 8) { alert('Senha muito curta.'); await supabase.auth.signOut(); return }
      const up = await supabase.auth.updateUser({ password: newPass })
      if (up.error){ alert(up.error.message); await supabase.auth.signOut(); return }
      await supabase.from('users').update({ must_change_password:false }).eq('auth_user_id', data.session!.user.id)
    }
    nav('/lgpd')
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-6 rounded-2xl shadow grid gap-3">
        <h1 className="text-xl font-bold text-consulmax-secondary">Acesso Consulmax</h1>
        <Input placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)}/>
        <Input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Button type="submit">Entrar</Button>
      </form>
    </div>
  )
}
