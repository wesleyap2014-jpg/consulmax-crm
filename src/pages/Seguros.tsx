import { ShieldCheck } from "lucide-react";

export default function Seguros() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur md:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#1E293F] text-white shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A11C27]">
              Pós-venda / Carteira
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1E293F] md:text-3xl">
              Seguros
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Estrutura criada para a gestão da carteira de seguros ativos da Consulmax.
              O desenho funcional desta tela será definido na próxima etapa.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
