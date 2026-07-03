import fs from 'fs';

const file = 'src/pages/GestaoDeGrupos.tsx';
let src = fs.readFileSync(file, 'utf8');

const helperAnchor = `function toPct4(v: number | null | undefined): string {
  if (v == null) return "—";
  const str = Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `${str}%`;
}
`;

const helperInsert = `function toPct4(v: number | null | undefined): string {
  if (v == null) return "—";
  const str = Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return str + "%";
}

function formatStrategyPct(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(value)) + "%";
}

function formatLanceStrategy(strategy: any): string {
  const opcoes = Array.isArray(strategy?.opcoes) ? strategy.opcoes : [];
  if (!opcoes.length) return "—";
  const parts = opcoes
    .map((op: any) => {
      const tipo = String(op?.tipo || "").trim();
      const pct = op?.percentual != null ? formatStrategyPct(Number(op.percentual)) : String(op?.percentual_formatado || "").trim();
      if (tipo && pct) return tipo + ": " + pct;
      return tipo || pct;
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : "—";
}

function statusCotaLabel(v: any): string {
  if (v?.contemplada === true) return "Contemplada";
  if (v?.inad === true) return "Inadimplente";
  return "Ativa";
}
`;

if (!src.includes('function formatLanceStrategy')) {
  if (!src.includes(helperAnchor)) throw new Error('patch-gestao-oferta-lance-strategy-v1: helper anchor not found');
  src = src.replace(helperAnchor, helperInsert);
}

const typeOld = `type OfertaRow = {
  administradora: string;
  grupo: string;
  cota: string | null;
  referencia: number | null;
  participantes: number | null;
  mediana: number | null;
  contemplados: number | null;
  cliente: string | null;
  descricao: string | null;
  contemplada: boolean;
};
`;
const typeNew = `type OfertaRow = {
  administradora: string;
  grupo: string;
  cota: string | null;
  cliente: string | null;
  estrategia_lance: string;
  status: string;
  referencia: number | null;
  participantes: number | null;
  mediana: number | null;
  contemplados: number | null;
};
`;
if (!src.includes('estrategia_lance: string;')) {
  if (!src.includes(typeOld)) throw new Error('patch-gestao-oferta-lance-strategy-v1: OfertaRow type anchor not found');
  src = src.replace(typeOld, typeNew);
}

const selectOld = `.select("*")
        .eq("status", "encarteirada")
        .eq("codigo", "00")
        .in("grupo", Array.from(gruposDigits));
`;
const selectNew = `.select("*")
        .eq("status", "encarteirada")
        .eq("codigo", "00")
        .in("grupo", Array.from(gruposDigits));
`;
// The codigo = 00 predicate already removes cancelled quotas.
if (!src.includes(selectOld)) throw new Error('patch-gestao-oferta-lance-strategy-v1: vendas select anchor not found');
src = src.replace(selectOld, selectNew);

const descBlock = `      const descCandidates = [
        "vendas_descrecao",
        "vendas_descricao",
        "descricao",
        "descrição",
        "descricao_venda",
        "descricaoVenda",
        "venda_descricao",
        "obs",
        "observacao",
        "observação",
      ];

      const leadKey: string | null = leadCandidates.find((k) => k in sample) ?? null;
      const descKey: string | null = descCandidates.find((k) => k in sample) ?? null;
`;
const descReplacement = `      const leadKey: string | null = leadCandidates.find((k) => k in sample) ?? null;
`;
if (src.includes(descBlock)) src = src.replace(descBlock, descReplacement);

const descUseBlock = `        const descVal = descKey ? v?.[descKey] : null;
        const descricao = descVal ?? v?.vendas_descrecao ?? v?.vendas_descricao ?? v?.descricao ?? null;

        out.push({
          administradora: g.administradora,
          grupo: normalizeGroupDigits(g.codigo),
          cota: v.cota != null ? String(v.cota) : null,
          referencia: ref,
          participantes: g.participantes,
          mediana: med,
          contemplados: contem,
          cliente,
          descricao,
          contemplada: Boolean(v?.contemplada === true),
        });
`;
const descUseReplacement = `        out.push({
          administradora: g.administradora,
          grupo: normalizeGroupDigits(g.codigo),
          cota: v.cota != null ? String(v.cota) : null,
          cliente,
          estrategia_lance: formatLanceStrategy(v?.estrategia_lance),
          status: statusCotaLabel(v),
          referencia: ref,
          participantes: g.participantes,
          mediana: med,
          contemplados: contem,
        });
`;
if (src.includes(descUseBlock)) src = src.replace(descUseBlock, descUseReplacement);

const pdfCssOld = `      th:nth-child(1), td:nth-child(1) { width: 15%; }
      th:nth-child(2), td:nth-child(2) { width: 10%; }
      th:nth-child(3), td:nth-child(3) { width: 8%;  }
      th:nth-child(4), td:nth-child(4) { width: 20%; }
      th:nth-child(5), td:nth-child(5) { width: 10%; text-align: right; }
      th:nth-child(6), td:nth-child(6) { width: 10%; text-align: right; }
      th:nth-child(7), td:nth-child(7) { width: 10%; text-align: right; }
      th:nth-child(8), td:nth-child(8) { width: 10%; text-align: right; }
      .descricao-row td { font-size: 11px; color:#444; border-top-color:#f0f0f0; }
      .descricao-label { font-weight:600; color:#111; margin-right:6px; }
      .tag-contemplada { display:inline-block; padding:2px 6px; font-size:10px; border-radius:999px; border:1px solid #d4f1d6; background:#f0fbf1; color:#0f6b1b; margin-left:6px }
`;
const pdfCssNew = `      th:nth-child(1), td:nth-child(1) { width: 11%; }
      th:nth-child(2), td:nth-child(2) { width: 7%; }
      th:nth-child(3), td:nth-child(3) { width: 7%; }
      th:nth-child(4), td:nth-child(4) { width: 17%; }
      th:nth-child(5), td:nth-child(5) { width: 18%; }
      th:nth-child(6), td:nth-child(6) { width: 9%; }
      th:nth-child(7), td:nth-child(7) { width: 8%; text-align: right; }
      th:nth-child(8), td:nth-child(8) { width: 8%; text-align: right; }
      th:nth-child(9), td:nth-child(9) { width: 8%; text-align: right; }
      th:nth-child(10), td:nth-child(10) { width: 7%; text-align: right; }
`;
if (src.includes(pdfCssOld)) src = src.replace(pdfCssOld, pdfCssNew);

const tableHeadOld = `          <tr>
            <th>Administradora</th>
            <th>Grupo</th>
            <th>Cota</th>
            <th>Cliente</th>
            <th>Referência</th>
            <th>Participantes</th>
            <th>Mediana</th>
            <th>Contemplados</th>
          </tr>
`;
const tableHeadNew = `          <tr>
            <th>Administradora</th>
            <th>Grupo</th>
            <th>Cota</th>
            <th>Cliente</th>
            <th>Estratégia/Lance</th>
            <th>Status</th>
            <th>Referência</th>
            <th>Participantes</th>
            <th>Mediana</th>
            <th>Contemplados</th>
          </tr>
`;
if (src.includes(tableHeadOld)) src = src.replace(tableHeadOld, tableHeadNew);

const scriptOld = `          <script>
            Array.from(document.querySelectorAll("tbody tr.descricao-row td")).forEach(function(td){
              var txt = (td.textContent || "").trim();
              if (/^Descrição:\\s*—\\s*$/.test(txt)) {
                td.parentElement.style.display = "none";
              } else {
                td.innerHTML = td.innerHTML.replace(/^\\s*Descrição:\\s*/,'<span class="descricao-label">Descrição:</span>');
              }
            });
            window.addEventListener('load', function () {
              window.print();
              setTimeout(function(){ window.close(); }, 300);
            });
          </script>
`;
const scriptNew = `          <script>
            window.addEventListener('load', function () {
              window.print();
              setTimeout(function(){ window.close(); }, 300);
            });
          </script>
`;
if (src.includes(scriptOld)) src = src.replace(scriptOld, scriptNew);

const screenHeadOld = `                <tr>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-left">Cota</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Referência</th>
                  <th className="p-2 text-left">Participantes</th>
                  <th className="p-2 text-left">Mediana</th>
                  <th className="p-2 text-left">Contemplados</th>
                </tr>
`;
const screenHeadNew = `                <tr>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-left">Cota</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Estratégia/Lance</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Referência</th>
                  <th className="p-2 text-left">Participantes</th>
                  <th className="p-2 text-left">Mediana</th>
                  <th className="p-2 text-left">Contemplados</th>
                </tr>
`;
if (src.includes(screenHeadOld)) src = src.replace(screenHeadOld, screenHeadNew);

src = src.replace(/colSpan=\{8\}/g, 'colSpan={10}');
src = src.replace('min-w-[1080px]', 'min-w-[1280px]');

const rowOld = `                    <React.Fragment key={`${o.administradora}-${o.grupo}-${o.cota}-${i}`}>
                      <tr className="odd:bg-muted/30">
                        <td className="p-2">{o.administradora}</td>
                        <td className="p-2">{o.grupo}</td>
                        <td className="p-2">{o.cota ?? "—"}</td>
                        <td className="p-2">
                          {o.cliente ?? "—"}
                          {o.contemplada && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-[2px] rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                              Contemplada
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right">{o.referencia ?? "—"}</td>
                        <td className="p-2 text-right">{o.participantes ?? "—"}</td>
                        <td className="p-2 text-right">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>
                        <td className="p-2 text-right">{o.contemplados ?? "—"}</td>
                      </tr>
                      <tr className="odd:bg-muted/30 descricao-row">
                        <td className="p-2 text-xs text-muted-foreground" colSpan={8}>
                          <span className="font-medium text-foreground">Descrição: </span>
                          {o.descricao?.trim() ? o.descricao : "—"}
                        </td>
                      </tr>
                    </React.Fragment>
`;
const rowNew = `                    <tr key={`${o.administradora}-${o.grupo}-${o.cota}-${i}`} className="odd:bg-muted/30">
                      <td className="p-2">{o.administradora}</td>
                      <td className="p-2">{o.grupo}</td>
                      <td className="p-2">{o.cota ?? "—"}</td>
                      <td className="p-2">{o.cliente ?? "—"}</td>
                      <td className="p-2">{o.estrategia_lance || "—"}</td>
                      <td className="p-2">{o.status || "Ativa"}</td>
                      <td className="p-2 text-right">{o.referencia ?? "—"}</td>
                      <td className="p-2 text-right">{o.participantes ?? "—"}</td>
                      <td className="p-2 text-right">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>
                      <td className="p-2 text-right">{o.contemplados ?? "—"}</td>
                    </tr>
`;
if (src.includes(rowOld)) src = src.replace(rowOld, rowNew);

fs.writeFileSync(file, src);
console.log('patch-gestao-oferta-lance-strategy-v1 applied');
