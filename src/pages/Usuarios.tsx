import * as React from 'react'
import { supabase } from '@/lib/supabase'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CepAutoFill } from '@/components/forms/CepAutoFill'
import { maskCpf, onlyDigits } from '@/lib/masks'

type Row = {
  id:string; auth_user_id:string; nome:string; email:string; telefone?:string;
  cep?:string; logradouro?:string; numero?:string; bairro?:string; cidade?:string; uf?:string;
  login?:string; role:'admin'|'vendedor'|'viewer'; scopes:string[]; avatar_url?:string;
  pix_kind?:'cpf'|'email'|'celular'|'aleatoria'; pix_key?:string; cpf?:string
}

export default function Usuarios(){
  const qc = useQueryClient()
  const users = useQuery({
    queryKey:['users'],
    queryFn: async ()=>{
      const { data, error } = await supabase.from('users_safe').select('*').order('created_at',{ascending:false})
      if (error) throw error
      return data as Row[]
    }
  })

  const { register, handleSubmit, setValue, watch, reset } = useForm<Partial<Row>>({
    defaultValues: { role:'viewer', scopes: [] }
  })

  async function onCreate(v:any){
    const authId = prompt('Cole o auth_user_id (do convite Aceito em Auth > Users):')
    if (!authId) { alert('auth_user_id é obrigatório.'); return }

    if (v.pix_kind==='cpf') v.pix_key = maskCpf(onlyDigits(String(v.cpf||'')))
    if (v.pix_kind==='email') v.pix_key = v.email
    if (v.pix_kind==='celular') v.pix_key = v.telefone

    const parts = String(v.nome||'').trim().toLowerCase().split(/\s+/)
    const login = `${(parts[0]||'user')}.${(parts.slice(-1)[0]||'crm')}`

    const { error } = await supabase.from('users').insert({
      auth_user_id: authId, nome: v.nome, email: v.email, telefone: v.telefone,
      cep:v.cep, logradouro:v.logradouro, numero:v.numero, bairro:v.bairro, cidade:v.cidade, uf:v.uf,
      login, role: v.role, scopes: v.scopes||[], avatar_url: v.avatar_url, pix_kind: v.pix_kind, pix_key: v.pix_key
    })
    if (error){ alert(error.message); return }
    reset(); qc.invalidateQueries({queryKey:['users']})
    alert(`Usuário criado. Defina senha provisória pelo convite do Supabase Auth. No 1º login, ele será forçado a trocar.`)
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Novo Usuário (vincule a um Auth User convidado)</CardTitle></CardHeader>
        <CardContent>
          <form className="grid md:grid-cols-3 gap-3" onSubmit={handleSubmit(onCreate)}>
            <Input placeholder="Nome" {...register('nome',{required:true})}/>
            <Input placeholder="E-mail" {...register('email',{required:true})}/>
            <Input placeholder="Telefone" {...register('telefone')}/>
            <CepAutoFill value={watch('cep')||''} onValue={(s)=>setValue('cep',s)} onAddress={(a)=>{
              setValue('logradouro',a.logradouro||''); setValue('bairro',a.bairro||''); setValue('cidade',a.cidade||''); setValue('uf',a.uf||'')
            }}/>
            <Input placeholder="Logradouro" {...register('logradouro')}/>
            <Input placeholder="Número" {...register('numero')}/>
            <Input placeholder="Bairro" {...register('bairro')}/>
            <Input placeholder="Cidade" {...register('cidade')}/>
            <Input placeholder="UF" {...register('uf')}/>
            <Select value={watch('role')} onChange={e=>setValue('role', e.target.value as any)}>
              <option value="viewer">Viewer</option>
              <option value="vendedor">Vendedor</option>
              <option value="admin">Admin</option>
            </Select>
            <Select value={watch('pix_kind')} onChange={e=>setValue('pix_kind', e.target.value as any)}>
              <option value="">Chave PIX</option>
              <option value="cpf">CPF</option>
              <option value="email">E-mail</option>
              <option value="celular">Celular</option>
              <option value="aleatoria">Aleatória</option>
            </Select>
            <Input placeholder="Pix (se aleatória)" {...register('pix_key')}/>
            <Button type="submit">Cadastrar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Usuários</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-[900px] w-full">
            <thead><tr className="text-left text-sm"><th className="p-2">Nome</th><th className="p-2">E-mail</th><th className="p-2">Role</th><th className="p-2">CPF</th></tr></thead>
            <tbody>
              {(users.data||[]).map(u=>(
                <tr key={u.id} className="border-t">
                  <td className="p-2">{u.nome}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2">{u.cpf||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
