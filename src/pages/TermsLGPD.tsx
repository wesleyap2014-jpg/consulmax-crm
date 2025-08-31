import * as React from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

export default function TermsLGPD(){
  const nav = useNavigate()
  const [uid,setUid] = React.useState<string>()
  React.useEffect(()=>{
    supabase.auth.getUser().then(({data})=> setUid(data.user?.id))
  },[])
  async function accept(){
    if (!uid) return
    await supabase.from('consents').insert({ user_id: uid, version: '1.0' })
    nav('/leads')
  }
  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6">
      <h2 className="text-xl font-bold text-consulmax-secondary mb-2">Termos de Privacidade e LGPD</h2>
      <p className="text-sm mb-4">Ao continuar, você concorda com o tratamento de dados conforme a LGPD, com registro de consentimento e opção de anonimização mediante solicitação.</p>
      <Button onClick={accept}>Aceitar e continuar</Button>
    </div>
  )
}
