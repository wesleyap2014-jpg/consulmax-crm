// src/components/ui/textarea.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Quando true, aplica estilo de erro e aria-invalid */
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex w-full min-h-[96px] rounded-2xl border bg-white px-3 py-2 text-sm",
          "placeholder:text-gray-400 transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E293F] focus-visible:border-[#1E293F]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-red-500 focus-visible:ring-red-500" : "border-gray-200",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
