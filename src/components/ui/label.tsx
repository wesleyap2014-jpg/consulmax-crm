import * as React from 'react'
export function Label({children, htmlFor}:{children:React.ReactNode, htmlFor?:string}) {
  return <label htmlFor={htmlFor} className="text-sm font-semibold text-consulmax-secondary">{children}</label>
}
