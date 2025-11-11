import * as React from 'react'

type DivProps = React.HTMLAttributes<HTMLDivElement> & {
  className?: string
  children?: React.ReactNode
}

export function Card({ children, className, ...rest }: DivProps) {
  return (
    <div className={`bg-white rounded-2xl shadow ${className || ''}`} {...rest}>
      {children}
    </div>
  )
}

export const CardContent = ({ children, className, ...rest }: DivProps) => (
  <div className={`p-4 ${className || ''}`} {...rest}>
    {children}
  </div>
)

export const CardHeader = ({ children, className, ...rest }: DivProps) => (
  <div className={`px-4 pt-4 ${className || ''}`} {...rest}>
    {children}
  </div>
)

export const CardTitle = ({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement> & {
  className?: string
  children?: React.ReactNode
}) => (
  <h3
    className={`text-lg font-bold text-consulmax-secondary ${className || ''}`}
    {...rest}
  >
    {children}
  </h3>
)

/** ✅ Novo: para rodapé dos cards (resolvem os imports do GiroDeCarteira.tsx) */
export const CardFooter = ({ children, className, ...rest }: DivProps) => (
  <div className={`px-4 pb-4 pt-0 flex items-center gap-2 ${className || ''}`} {...rest}>
    {children}
  </div>
)

/** (Opcional) descrição curta abaixo do título */
export const CardDescription = ({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement> & {
  className?: string
  children?: React.ReactNode
}) => (
  <p className={`px-4 pt-1 text-sm text-gray-500 ${className || ''}`} {...rest}>
    {children}
  </p>
)
