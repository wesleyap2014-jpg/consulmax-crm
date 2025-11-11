// src/components/ui/button.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  // base
  "inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-sm font-medium",
  {
    variants: {
      variant: {
        // mantém seu padrão
        default: "bg-consulmax-primary text-white hover:opacity-90 disabled:opacity-50",
        secondary:
          "bg-consulmax-navy/10 text-consulmax-navy hover:opacity-90 disabled:opacity-50",
        outline:
          "border border-input bg-white text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        ghost:
          "bg-transparent hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        destructive:
          "bg-red-600 text-white hover:opacity-90 disabled:opacity-50",
        link: "bg-transparent text-consulmax-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 rounded-xl",
        lg: "h-11 px-6 rounded-2xl text-base",
        icon: "h-10 w-10 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export default Button;
