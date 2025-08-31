import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useForm } from 'react-hook-form'

type Lead = { id:string; nome:string; telefone?:string; email?:string; origem?:string; descricao?:string; created_at:string }

export default function Leads(){
  const qc = useQueryClient()
  const [q,setQ] = React.useState('')
  const [page,setPage] = React.useState(0)

  const leads = useQuery({
    queryKey: ['leads', q, page],
    queryFn: async ()=>{
      let query = supabase.from('leads').select('*').order('created_at',{ascending:false}).range(page*10, page*10+9)
      if (q) query = query.ilike('nome', `%${q}%`)
      const { data, error } = await query
      if (error) throw error
      return data as Lead[]
    }
  })

  const { register, handleSubmit, reset } = useForm<Pick<Lead,'nome'|'telefone'|'email'|'origem'|'descricao'>>()

  async function createLead(values: any){
    const me = (await supabase.auth.getUser()).data.user
    const ins = await supabase.from('leads').insert({ ...values, owner_id: me!.id })
    if (ins.error) { alert(ins.error.message); return }
    reset(); qc.invalidateQueries({queryKey:['leads']})
  }

  async function remove(id:string){
    if (!confirm('Excluir lead?')) return
    const { error } = await supabase.from('leads').delete().eq('id',id)
    if (error) { alert(error.message); return }
    qc.invalidateQueries({queryKey:['leads']})
  }

  return (
    <div className="grid gap-4">
      <Card><CardContent className="grid md:grid-cols-5 gap-2">
        <Input placeholder="Buscar por nome..." value={q} onChange={e=>setQ(e.target.value)}/>
        <div className="md:col-span-4 text-sm text-consulmax-secondary/70 self-center">Resultados: {leads.data?.length ?? 0}</div>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Novo Lead</CardTitle></CardHeader>
        <CardContent>
          <form className="grid md:grid-cols-3 gap-3" onSubmit={handleSubmit(createLead)}>
            <Input placeholder="Nome" {...register('nome',{required:true})}/>
            <Input placeholder="Telefone (cel.)" {...register('telefone')}/>
            <Input placeholder="E-mail" type="email" {...register('email')}/>
            <Input placeholder="Origem (Site, Redes Sociais, Indicação...)" {...register('origem')}/>
            <Input className="md:col-span-2" placeholder="Descrição" {...register('descricao')}/>
            <Button type="submit">Criar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Leads</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-[800px] w-full">
            <thead><tr className="text-left text-sm">
              <th className="p-2">Nome</th><th className="p-2">Telefone</th><th className="p-2">E-mail</th><th className="p-2">Origem</th><th className="p-2">Ações</th>
            </tr></thead>
            <tbody>
              {(leads.data||[]).map(l=>(
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.nome}</td>
                  <td className="p-2">{l.telefone}</td>
                  <td className="p-2">{l.email}</td>
                  <td className="p-2">{l.origem}</td>
                  <td className="p-2"><Button className="mr-2" onClick={()=>remove(l.id)}>Excluir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3">
            <Button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Anterior</Button>
            <Button onClick={()=>setPage(p=>p+1)}>Próxima</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
