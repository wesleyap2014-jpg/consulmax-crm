import * as React from 'react'
import { Input } from '@/components/ui/input'
import { maskCep, onlyDigits } from '@/lib/masks'

export function CepAutoFill({ value, onValue, onAddress }:{
  value: string, onValue:(s:string)=>void,
  onAddress:(addr:{logradouro?:string;bairro?:string;cidade?:string;uf?:string})=>void
}) {
  async function fetchCep(cep:string){
    const c = onlyDigits(cep)
    if (c.length===8){
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const j = await r.json()
      if (!j.erro){
        onAddress({ logradouro:j.logradouro, bairro:j.bairro, cidade:j.localidade, uf:j.uf })
      }
    }
  }
  return (
    <Input
      value={maskCep(value||'')}
      onChange={(e)=>{ onValue(e.target.value); fetchCep(e.target.value).catch(()=>{}) }}
      placeholder="00000-000"
      maxLength={9}
    />
  )
}
