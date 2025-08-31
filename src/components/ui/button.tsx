import * as React from 'react'
import { cn } from './cn'
export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("px-4 py-2 rounded-2xl bg-consulmax-primary text-white hover:opacity-90 disabled:opacity-50", className)} {...props} />
}
