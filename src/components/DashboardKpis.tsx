import { useEffect, useState } from "react";
import { getKpiByStage } from "../services/kpiService";

export default function DashboardKpis() {
  const [kpis, setKpis] = useState<any[]>([]);

  useEffect(() => {
    getKpiByStage().then(setKpis).catch(console.error);
  }, []);

  return (
    <div>
      <h2>KPIs por estágio</h2>
      <ul>
        {kpis.map((kpi) => (
          <li key={kpi.stage}>
            {kpi.stage}: {kpi.opp_count} oportunidades — R$ {kpi.total_valor}
          </li>
        ))}
      </ul>
    </div>
  );
}
