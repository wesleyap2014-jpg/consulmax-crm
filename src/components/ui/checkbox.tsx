// src/components/ui/checkbox.tsx
import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className = "", ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={`h-4 w-4 shrink-0 rounded border border-gray-300
      data-[state=checked]:bg-gray-900 data-[state=checked]:border-gray-900
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400
      transition-colors ${className}`}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-white">
      {/* simples “check” usando SVG para não depender de ícones */}
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = "Checkbox"
