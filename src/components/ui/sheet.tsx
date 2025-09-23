// src/components/ui/sheet.tsx
import * as React from "react"
import * as Dialog from "@radix-ui/react-dialog"

type SheetSide = "top" | "right" | "bottom" | "left"

export const Sheet = Dialog.Root
export const SheetTrigger = Dialog.Trigger
export const SheetClose = Dialog.Close

export function SheetContent({
  side = "right",
  className = "",
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Dialog.Content> & { side?: SheetSide }) {
  const sideClasses: Record<SheetSide, string> = {
    top: "inset-x-0 top-0 border-b",
    right: "inset-y-0 right-0 h-full w-96 border-l",
    bottom: "inset-x-0 bottom-0 border-t",
    left: "inset-y-0 left-0 h-full w-96 border-r",
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <Dialog.Content
        className={`fixed z-50 bg-white shadow-xl outline-none ${sideClasses[side]} ${className}`}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export function SheetHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-4 border-b ${className}`} {...props} />
}

export function SheetTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`text-lg font-semibold ${className}`} {...props} />
}

export function SheetFooter({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-4 border-t flex justify-end gap-2 ${className}`} {...props} />
}
