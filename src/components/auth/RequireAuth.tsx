import { supabase } from '@/lib/supabase'
import * as React from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

export default function RequireAuth(){
  const nav = useNavigate()
  const [ready,setReady] = React.useState(false)
  React.useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      if (!data.session) nav('/login')
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e,session)=>{
      if (!session) nav('/login')
    })
    return ()=>{ sub.subscription.unsubscribe() }
  },[])
  if (!ready) return null
  return <Outlet/>
}
