import * as React from 'react'
import Decimal from 'decimal.js'
import { Input } from '@/components/ui/input'

export function CurrencyInput({ value, onValue, ...rest }:{
  value?: number, onValue: (n:number)=>void
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [txt,setTxt] = React.useState('')
  React.useEffect(()=>{
    const n = Number(value||0)
    setTxt(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n))
  },[value])
  function parse(s:string){
    const raw = s.replace(/[R$\s.]/g,'').replace(',','.')
    return Number(new Decimal(raw||0).div(100).toNumber())
  }
  return (
    <Input
      {...rest}
      value={txt}
      onChange={e=>{
        setTxt(e.target.value)
        onValue(parse(e.target.value))
      }}
      inputMode="numeric"
    />
  )
}
