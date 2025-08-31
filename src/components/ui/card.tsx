import * as React from 'react'
export function Card({children, className}:{children:React.ReactNode, className?:string}) {
  return <div className={`bg-white rounded-2xl shadow ${className||''}`}>{children}</div>
}
export const CardContent = ({children,className}:{children:React.ReactNode,className?:string}) =>
  <div className={`p-4 ${className||''}`}>{children}</div>
export const CardHeader = ({children,className}:{children:React.ReactNode,className?:string}) =>
  <div className={`px-4 pt-4 ${className||''}`}>{children}</div>
export const CardTitle = ({children,className}:{children:React.ReactNode,className?:string}) =>
  <h3 className={`text-lg font-bold text-consulmax-secondary ${className||''}`}>{children}</h3>
