import React from "react";

type Props = React.PropsWithChildren<{
  /** Largura mínima da área da tabela (em px) para forçar scroll horizontal no mobile */
  minWidth?: number;
  /** Classe extra opcional no wrapper */
  className?: string;
}>;

export default function TableScroll({ children, minWidth = 980, className }: Props) {
  return (
    <div className={`overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0 ${className || ""}`}>
      {/* Usamos um container com minWidth para que a tabela force o scroll quando necessário */}
      <div style={{ minWidth }} className="inline-block w-full">
        {children}
      </div>
    </div>
  );
}
