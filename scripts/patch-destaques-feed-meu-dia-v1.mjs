import fs from "node:fs";

function replaceOnce(src, before, after, label) {
  if (!src.includes(before)) {
    console.log(`[destaques-feed-meudia-v1] ${label}: trecho não encontrado`);
    return src;
  }
  console.log(`[destaques-feed-meudia-v1] ${label}: aplicado`);
  return src.replace(before, after);
}

// 1) Cards PNG 1080x1080 dentro da aba Destaques
{
  const path = "src/components/ranking/RankingDestaques.tsx";
  let src = fs.readFileSync(path, "utf8");

  if (!src.includes('from "@/components/ranking/rankingFeedCard"')) {
    src = replaceOnce(
      src,
      'import { supabase } from "@/lib/supabaseClient";\n',
      'import { supabase } from "@/lib/supabaseClient";\nimport { downloadRankingLeaderFeedCard, downloadRankingSummaryFeedCard } from "@/components/ranking/rankingFeedCard";\n',
      "import gerador de cards",
    );
  }

  src = replaceOnce(src, '  Trophy,\n  Users,', '  Trophy,\n  Users,\n  Download,', "ícone download");

  src = replaceOnce(
    src,
`  helper,
}: {
  icon: React.ReactNode;
  label: string;
  row: HighlightRow | null;
  value: string;
  helper: string;
}) {`,
`  helper,
  onDownload,
}: {
  icon: React.ReactNode;
  label: string;
  row: HighlightRow | null;
  value: string;
  helper: string;
  onDownload?: () => void;
}) {`,
    "LeaderCard callback",
  );

  src = replaceOnce(
    src,
`          <div className="mt-2 text-xs text-slate-500">{helper}</div>
        </>`,
`          <div className="mt-2 text-xs text-slate-500">{helper}</div>
          {onDownload ? (
            <button
              type="button"
              onClick={onDownload}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-black text-[#1E293F] transition hover:border-[#B5A573] hover:bg-[#B5A573]/10"
            >
              <Download className="h-3.5 w-3.5" /> Baixar card
            </button>
          ) : null}
        </>`,
    "botão card individual",
  );

  const tableAnchor = `  const tableRows = useMemo(
    () => [...rows].sort((a, b) => b.salesVolume - a.salesVolume || b.salesCount - a.salesCount || a.name.localeCompare(b.name, "pt-BR")),
    [rows],
  );`;
  if (!src.includes("function downloadSummaryCard()")) {
    src = replaceOnce(
      src,
      tableAnchor,
`${tableAnchor}

  const selectedPeriodLabel = periodLabel(period, year, month);
  const selectedPeriodTitle = period === "week" ? "Destaques da Semana" : "Destaques do Mês";

  function downloadLeaderCard(label: string, row: HighlightRow | null, value: string, helper: string) {
    if (!row) return;
    void downloadRankingLeaderFeedCard({
      title: selectedPeriodTitle,
      periodLabel: selectedPeriodLabel,
      label,
      name: row.name,
      value,
      helper,
      avatarUrl: row.avatarUrl,
    }).catch((err) => {
      console.error("[RankingDestaques] erro ao gerar card individual", err);
      window.alert(err?.message || "Não foi possível gerar o card.");
    });
  }

  function downloadSummaryCard() {
    const items = [
      { label: "Vendas • Volume", row: leaders.volume, value: leaders.volume ? formatBRL(leaders.volume.salesVolume) : "—", helper: leaders.volume ? \`${'${leaders.volume.salesCount}'} venda(s)\` : "Sem registros" },
      { label: "Vendas • Quantidade", row: leaders.quantity, value: leaders.quantity ? \`${'${leaders.quantity.salesCount}'} venda(s)\` : "—", helper: leaders.quantity ? formatBRL(leaders.quantity.salesVolume) : "Sem registros" },
      { label: "Simulações Realizadas", row: leaders.simulations, value: leaders.simulations ? String(leaders.simulations.simulations) : "—", helper: "Leads distintos com pelo menos 1 simulação" },
      { label: "Prospecções", row: leaders.prospections, value: leaders.prospections ? String(leaders.prospections.prospections) : "—", helper: "Novos leads + novas oportunidades" },
      { label: "Qualificações", row: leaders.qualifications, value: leaders.qualifications ? String(leaders.qualifications.qualifications) : "—", helper: "Qualificações concluídas no período" },
    ].map((item) => ({
      label: item.label,
      name: item.row?.name || "Sem registros",
      value: item.value,
      helper: item.helper,
      avatarUrl: item.row?.avatarUrl || null,
    }));

    void downloadRankingSummaryFeedCard({ title: selectedPeriodTitle, periodLabel: selectedPeriodLabel, items }).catch((err) => {
      console.error("[RankingDestaques] erro ao gerar card resumo", err);
      window.alert(err?.message || "Não foi possível gerar o card resumo.");
    });
  }`,
      "funções de download",
    );
  }

  src = replaceOnce(
    src,
`          <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">`,
`          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadSummaryCard}
              disabled={loading || rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-[#B5A573]/50 bg-[#B5A573]/10 px-3 py-2 text-xs font-black text-[#1E293F] transition hover:bg-[#B5A573]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Baixar card resumo
            </button>
            <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">`,
    "botão resumo",
  );

  src = replaceOnce(
    src,
`            </button>
          </div>
        </div>
      </CardHeader>`,
`            </button>
            </div>
          </div>
        </div>
      </CardHeader>`,
    "fecha grupo de ações",
  );

  src = replaceOnce(
    src,
`                helper={leaders.volume ? \`${'${leaders.volume.salesCount}'} venda(s) no período\` : ""}
              />`,
`                helper={leaders.volume ? \`${'${leaders.volume.salesCount}'} venda(s) no período\` : ""}
                onDownload={() => downloadLeaderCard("Vendas • Volume", leaders.volume, leaders.volume ? formatBRL(leaders.volume.salesVolume) : "—", leaders.volume ? \`${'${leaders.volume.salesCount}'} venda(s) no período\` : "")}
              />`,
    "download volume",
  );

  src = replaceOnce(
    src,
`                helper={leaders.quantity ? formatBRL(leaders.quantity.salesVolume) : ""}
              />`,
`                helper={leaders.quantity ? formatBRL(leaders.quantity.salesVolume) : ""}
                onDownload={() => downloadLeaderCard("Vendas • Quantidade", leaders.quantity, leaders.quantity ? \`${'${leaders.quantity.salesCount}'} venda(s)\` : "—", leaders.quantity ? formatBRL(leaders.quantity.salesVolume) : "")}
              />`,
    "download quantidade",
  );

  src = replaceOnce(
    src,
`                helper="Leads distintos com pelo menos 1 simulação"
              />`,
`                helper="Leads distintos com pelo menos 1 simulação"
                onDownload={() => downloadLeaderCard("Simulações Realizadas", leaders.simulations, leaders.simulations ? String(leaders.simulations.simulations) : "—", "Leads distintos com pelo menos 1 simulação")}
              />`,
    "download simulações",
  );

  src = replaceOnce(
    src,
`                helper="Novos leads + novas oportunidades"
              />`,
`                helper="Novos leads + novas oportunidades"
                onDownload={() => downloadLeaderCard("Prospecções", leaders.prospections, leaders.prospections ? String(leaders.prospections.prospections) : "—", "Novos leads + novas oportunidades")}
              />`,
    "download prospecções",
  );

  src = replaceOnce(
    src,
`                helper="Qualificações concluídas no período"
              />`,
`                helper="Qualificações concluídas no período"
                onDownload={() => downloadLeaderCard("Qualificações", leaders.qualifications, leaders.qualifications ? String(leaders.qualifications.qualifications) : "—", "Qualificações concluídas no período")}
              />`,
    "download qualificações",
  );

  fs.writeFileSync(path, src);
}

// 2) A rota /ranking?tab=destaques abre diretamente a aba correta
{
  const path = "src/pages/RankingVendedores.tsx";
  let src = fs.readFileSync(path, "utf8");
  src = replaceOnce(
    src,
    '  const [section, setSection] = useState<"ranking" | "destaques">("ranking");',
    '  const [section, setSection] = useState<"ranking" | "destaques">(() => new URLSearchParams(window.location.search).get("tab") === "destaques" ? "destaques" : "ranking");',
    "deep link Destaques",
  );
  fs.writeFileSync(path, src);
}

// 3) Tarefas recorrentes no Início > Meu Dia
{
  const path = "src/pages/Inicio.tsx";
  let src = fs.readFileSync(path, "utf8");

  if (!src.includes("function isLastBusinessDayOfMonthYMD")) {
    src = replaceOnce(
      src,
      'function weekdayYMD(ymd: string) { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); }',
      'function weekdayYMD(ymd: string) { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); }\nfunction isLastBusinessDayOfMonthYMD(ymd: string) { const day = weekdayYMD(ymd); if (day === 0 || day === 6) return false; let next = addDaysYMD(ymd, 1); while ([0, 6].includes(weekdayYMD(next))) next = addDaysYMD(next, 1); return next.slice(0, 7) !== ymd.slice(0, 7); }',
      "helper último dia útil",
    );
  }

  const myDayAnchor = '    const myDay: MeuDiaAlert[] = [];';
  if (!src.includes('id: `weekly-highlights-${today}`')) {
    src = replaceOnce(
      src,
      myDayAnchor,
`${myDayAnchor}
    if (weekdayYMD(today) === 5) {
      myDay.push({
        id: \`weekly-highlights-${'${today}'}\`,
        priority: 14,
        icon: "trophy",
        title: "Gerar e enviar destaques da semana",
        desc: "Abra a aba Destaques, confira os campeões da semana e baixe o card para compartilhar com o time.",
        action: { label: "Abrir Destaques", to: "/ranking?tab=destaques" },
      });
    }
    if (isLastBusinessDayOfMonthYMD(today)) {
      myDay.push({
        id: \`monthly-highlights-${'${today}'}\`,
        priority: 15,
        icon: "trophy",
        title: "Gerar e enviar destaques do mês",
        desc: "Confira os destaques do mês e gere o card de fechamento para compartilhar com o time.",
        action: { label: "Abrir Destaques", to: "/ranking?tab=destaques" },
      });
    }`,
      "tarefas recorrentes Meu Dia",
    );
  }

  fs.writeFileSync(path, src);
}

console.log("[destaques-feed-meudia-v1] concluído");
