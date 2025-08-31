import * as React from 'react'
import { cn } from './cn'
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("w-full border rounded-2xl px-3 py-2 outline-none focus:ring-2 focus:ring-consulmax-primary", className)} {...props} />
)
Input.displayName = 'Input'
