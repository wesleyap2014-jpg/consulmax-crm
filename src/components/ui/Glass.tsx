import { cn } from '@/lib/cn' // se não tiver, troque por template string

export function GlassCard({ className="", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass glass-card", className)} {...p} />
}
export function GlassPanel({ className="", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass", className)} {...p} />
}
export function GlassModal({ className="", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass-modal rounded-2xl p-4", className)} {...p} />
}
export function GlassInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className="", ...rest } = props
  return <input className={cn("glass-input rounded-xl p-2.5", className)} {...rest} />
}
