import React from "react";
import { CsRecord } from "./customerSuccessModel";
import { AnswerButtons, Field } from "./CustomerSuccessControls";

export default function Costs({ f, set }: { f: CsRecord; set: (v: CsRecord) => void }) {
  return (
    <section className="rounded-2xl border p-4">
      <h4 className="mb-3 font-extrabold">5. Parcelas, reajustes e custos</h4>
      <div className="space-y-3">
        <Field label="Foi explicado para você que tanto o crédito quanto as parcelas podem sofrer reajustes ao longo do plano, de acordo com as regras previstas no contrato e no seu grupo?">
          <AnswerButtons value={f.reajustes || ""} onChange={(v) => set({ ...f, reajustes: v })} />
        </Field>
        <Field label="Durante a contratação, ficaram claros para você os custos que fazem parte do consórcio, como a taxa de administração e, quando houver, fundo de reserva, seguro ou outros componentes previstos no seu plano?">
          <AnswerButtons value={f.custos || ""} onChange={(v) => set({ ...f, custos: v })} />
        </Field>
        <Field label="Você sabe quando vence a sua próxima parcela?">
          <AnswerButtons value={f.vencimento || ""} onChange={(v) => set({ ...f, vencimento: v })} />
        </Field>
      </div>
    </section>
  );
}
