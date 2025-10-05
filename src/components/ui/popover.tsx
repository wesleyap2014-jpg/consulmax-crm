// src/components/ui/popover.tsx
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

// util simples para juntar classes
function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

const Popover = PopoverPrimitive.Root;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;
const PopoverTrigger = PopoverPrimitive.Trigger;

/**
 * Trigger seguro que SEMPRE usa <button> nativo (evita problema de forwardRef).
 * Use <PopoverButton> no lugar de <PopoverTrigger asChild> + <Button>.
 */
const PopoverButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(({ className, ...props }, ref) => (
  <PopoverTrigger asChild>
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm",
        "bg-white hover:bg-muted focus:outline-none",
        className
      )}
      {...props}
    />
  </PopoverTrigger>
));
PopoverButton.displayName = "PopoverButton";

/**
 * Conteúdo do popover com classes neutras (sem depender de tokens bg-popover/text-popover-foreground)
 */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    align?: "start" | "center" | "end";
  }
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded-md border bg-white p-2 text-foreground shadow-md outline-none",
        // animações (opcional)
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2",
        "data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";

export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverTrigger,
  PopoverButton,
  PopoverContent,
};
