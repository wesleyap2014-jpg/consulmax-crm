import * as React from 'react'
export function Select({ value, onChange, children, className }:{
  value?: string, onChange?: (e:React.ChangeEvent<HTMLSelectElement>)=>void, children:React.ReactNode, className?:string
}) {
  return <select value={value} onChange={onChange} className={`w-full border rounded-2xl px-3 py-2 outline-none focus:ring-2 focus:ring-consulmax-primary ${className||''}`}>{children}</select>
}
