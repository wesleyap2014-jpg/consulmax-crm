import React from "react";
import { Download } from "lucide-react";
import type { WorkItem } from "./customerSuccessModel";
import { fmtDate, fmtMoney } from "./customerSuccessModel";
import { StatusPill } from "./CustomerSuccessControls";
import { baixarRelatorioSucessoClientePDF } from "@/lib/pdf";

export default function Table({ items, loading, open }: { items: WorkItem[]; loading: boolean; open: (i: WorkItem) => void }) {
  async function download(item: WorkItem) {
    try {
      await baixarRelatorioSucessoClientePDF(item);
    } catch (error: any) {
      alert(error?.message || "Não foi possível gerar o PDF do relatório.");
    }
  }

  return <div className="overflow-auto rounded-xl border"><table className="min-w-full text-sm">
    <thead className="bg-slate-50"><tr>
      <th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Venda</th><th className="p-2 text-left">Vendedor</th><th className="p-2 text-left">Status</th><th className="p-2 text-center">Tentativas</th><th className="p-2 text-right">Ação</th>
    </tr></thead>
    <tbody>
      {loading && <tr><td className="p-4" colSpan={6}>Carregando…</td></tr>}
      {!loading && items.map((i) => <tr key={i.venda.id} className="border-t">
        <td className="p-2"><b>{i.cliente?.nome || i.lead?.nome || "—"}</b>{!i.cliente?.id && <div className="text-xs text-amber-700">Cadastro pendente</div>}</td>
        <td className="p-2">{fmtMoney(i.venda.valor_venda)}<div className="text-xs text-slate-500">{i.venda.administradora || "—"} • G {i.venda.grupo || "—"} • C {i.venda.cota || "—"} • {fmtDate(i.venda.data_venda)}</div></td>
        <td className="p-2">{i.vendedor_nome}</td>
        <td className="p-2"><StatusPill status={i.cs.status}/></td>
        <td className="p-2 text-center font-bold">{i.cs.tentativas || 0}</td>
        <td className="p-2 text-right"><div className="inline-flex items-center gap-2">
          {i.cs.report && <button type="button" title="Baixar relatório PDF" aria-label="Baixar relatório PDF" onClick={() => download(i)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#1E293F] shadow-sm transition hover:border-[#B5A573] hover:bg-[#FBFAF5] hover:text-[#A11C27]"><Download size={16}/></button>}
          <button className="rounded-xl bg-[#A11C27] px-3 py-2 text-xs font-bold text-white" onClick={() => open(i)}>Abrir</button>
        </div></td>
      </tr>)}
    </tbody>
  </table></div>;
}
