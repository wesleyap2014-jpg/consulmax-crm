import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CurrencyInput } from '@/components/forms/CurrencyInput'

const SEGMENTOS = ['Automóvel','Imóvel','Motocicleta','Serviços','Pesados','Imóvel Estendido'] as const
type Estagio = 'Novo'|'Qualificação'|'Proposta'|'Negociação'|'Convertido'|'Perdido'

export default function Oportunidades(){
  const qc = useQueryClient()
  const leads = useQuery({
    queryKey: ['opps/leads'],
    queryFn: async ()=>{
      const { data, error } = await supabase.from('leads').select('id,nome,origem')
      if (error) throw error
      return data
    }
  })
  const vendedores = useQuery({
    queryKey: ['opps/vendedores'],
    queryFn: async ()=>{
      const { data, error } = await supabase.from('users_safe').select('auth_user_id,nome,role').in('role',['vendedor','admin'])
      if (error) throw error
      return data
    }
  })
  const opps = useQuery({
    queryKey: ['opps/list'],
    queryFn: async ()=>{
      const { data, error } = await supabase.from('oportunidades')
        .select('id,lead_id,segmento,valor_credito,estagio,score,vendedor_id,origem,created_at')
        .neq('estagio','Convertido').neq('estagio','Perdido')
        .order('created_at',{ascending:false})
      if (error) throw error
      return data
    }
  })

  const { register, handleSubmit, setValue, watch, reset } = useForm<{
    lead_id:string; vendedor_id:string; segmento:string; valor_credito:number; observacao?:string; score:number; estagio:Estagio
  }>({ defaultValues: { estagio: 'Novo', score: 3, segmento: 'Automóvel', valor_credito: 0 } })

  async function createOpp(v:any){
    if (!v.vendedor_id){ alert('Selecione um vendedor.'); return }
    const lead = leads.data?.find(x=>x.id===v.lead_id)
    const ins = await supabase.from('oportunidades').insert({ ...v, origem: lead?.origem || null })
    if (ins.error) { alert(ins.error.message); return }
    reset(); qc.invalidateQueries({queryKey:['opps/list']})
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Nova Oportunidade</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(createOpp)} className="grid md:grid-cols-3 gap-3">
            <Select value={watch('lead_id')} onChange={e=>setValue('lead_id',e.target.value)}>
              <option value="">Selecione um Lead</option>
              {(leads.data||[]).map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}
            </Select>

            <Select value={watch('vendedor_id')} onChange={e=>setValue('vendedor_id',e.target.value)}>
              <option value="">Selecione um Vendedor</option>
              {(vendedores.data||[]).map(v=><option key={v.auth_user_id} value={v.auth_user_id}>{v.nome}</option>)}
            </Select>

            <Select value={watch('segmento')} onChange={e=>setValue('segmento',e.target.value)}>
              {SEGMENTOS.map(s=><option key={s} value={s}>{s}</option>)}
            </Select>

            <CurrencyInput value={watch('valor_credito')} onValue={(n)=>setValue('valor_credito', n)} />
            <Input placeholder="Observação" {...register('observacao')}/>
            <Select value={String(watch('score'))} onChange={e=>setValue('score', Number(e.target.value))}>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{'★'.repeat(n)}</option>)}
            </Select>

            <Select value={watch('estagio')} onChange={e=>setValue('estagio', e.target.value as Estagio)}>
              {(['Novo','Qualificação','Proposta','Negociação','Convertido','Perdido'] as Estagio[]).map(s=><option key={s} value={s}>{s}</option>)}
            </Select>

            <Button type="submit">Criar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Oportunidades (ativas)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-[900px] w-full">
            <thead><tr className="text-left text-sm">
              <th className="p-2">Lead</th>
              <th className="p-2">Valor</th>
              <th className="p-2">Segmento</th>
              <th className="p-2">Estágio</th>
              <th className="p-2">Score</th>
              <th className="p-2">Vendedor</th>
            </tr></thead>
            <tbody>
              {(opps.data||[]).map(o=>(
                <tr key={o.id} className="border-t">
                  <td className="p-2">{leads.data?.find(l=>l.id===o.lead_id)?.nome}</td>
                  <td className="p-2">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(o.valor_credito||0))}</td>
                  <td className="p-2">{o.segmento}</td>
                  <td className="p-2">{o.estagio}</td>
                  <td className="p-2">{'★'.repeat(o.score||0)}</td>
                  <td className="p-2">{vendedores.data?.find(v=>v.auth_user_id===o.vendedor_id)?.nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
