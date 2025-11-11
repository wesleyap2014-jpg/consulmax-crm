// src/components/ui/badge.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-transparent hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        outline: "text-foreground border-muted bg-transparent",
        destructive: "bg-destructive text-destructive-foreground border-transparent",
        muted: "bg-muted text-foreground border-transparent",

        // ✅ Novos para Consulmax
        consulmax: "bg-[#A11C27] text-white border-transparent hover:opacity-95",
        navy: "bg-[#1E293F] text-white border-transparent hover:opacity-95"
      },
      size: {
        sm: "px-2.5 py-0.5",
        md: "px-3 py-1 text-[0.78rem]"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "sm"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { badgeVariants };
