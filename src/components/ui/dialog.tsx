// src/components/ui/dialog.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

type DialogCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
};
const Ctx = React.createContext<DialogCtx | null>(null);

export function Dialog(props: { open?: boolean; onOpenChange?: (v: boolean) => void; children: React.ReactNode }) {
  const [internal, setInternal] = React.useState(false);
  const controlled = typeof props.open === "boolean";
  const open = controlled ? !!props.open : internal;
  const setOpen = (v: boolean) => {
    if (!controlled) setInternal(v);
    props.onOpenChange?.(v);
  };
  React.useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  return <Ctx.Provider value={{ open, setOpen }}>{props.children}</Ctx.Provider>;
}

export function DialogTrigger({ asChild, children, ...rest }: React.HTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const ctx = React.useContext(Ctx)!;
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as any, {
      ...rest,
      onClick: (e: any) => { (children as any).props?.onClick?.(e); ctx.setOpen(true); },
    });
  }
  return (
    <button {...rest} onClick={() => ctx.setOpen(true)}>
      {children}
    </button>
  );
}

export function DialogContent({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(Ctx)!;
  if (!ctx.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => ctx.setOpen(false)}
      />
      <div
        className={cn(
          "relative z-10 w-[92vw] max-w-lg rounded-2xl bg-white p-4 shadow-xl",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-2", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex items-center justify-end gap-2", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-gray-600", className)} {...props} />;
}
