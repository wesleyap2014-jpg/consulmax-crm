import React from "react";
import { CsRecord } from "./customerSuccessModel";
import { AnswerButtons, Field, YesNo, inputCls } from "./CustomerSuccessControls";

export default function Experience({ f, set }: { f: CsRecord; set: (v: CsRecord) => void }) {
  return (
    <section className="rounded-2xl border p-4">
      <h4 className="mb-3 font-extrabold">6. Experiência com o consultor</h4>
      <div className="grid gap-3 lg:grid-cols-3">
        <div>
          <Field label="De 0 a 10, qual nota você daria para o atendimento do seu consultor durante todo o processo de contratação?">
            <select
              className={inputCls}
              value={f.nota_vendedor ?? ""}
              onChange={(e) => set({ ...f, nota_vendedor: e.target.value === "" ? null : parseInt(e.target.value) })}
            >
              <option value="">Selecione…</option>
              {[0,1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <div className="mt-3">
            <Field label="O que mais influenciou você a dar essa nota?">
              <textarea className={inputCls} rows={2} value={f.motivo_nota || ""} onChange={(e) => set({ ...f, motivo_nota: e.target.value })} />
            </Field>
          </div>
        </div>
        <Field label="Você sentiu que suas dúvidas foram respondidas com clareza?">
          <AnswerButtons value={f.clareza || ""} onChange={(v) => set({ ...f, clareza: v })} />
        </Field>
        <div className="space-y-3">
          <Field label="Em algum momento você se sentiu pressionado a realizar a contratação?">
            <YesNo value={f.pressao} onChange={(v) => set({ ...f, pressao: v })} />
          </Field>
          <Field label="Você sentiu segurança nas informações que foram apresentadas para você?">
            <YesNo value={f.seguranca} onChange={(v) => set({ ...f, seguranca: v })} />
          </Field>
        </div>
      </div>
    </section>
  );
}
