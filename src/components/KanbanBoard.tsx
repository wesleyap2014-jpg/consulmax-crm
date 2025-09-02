import React, { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Stage, stages, stageLabels, updateOpportunityStage } from "@/services/opportunities";

type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  segmento: string;
  valor_credito: number;
  observacao: string | null;
  score: number;
  estagio: string;           // legado com acento
  stage?: Stage;             // enum novo (alguns registros podem não ter; trate como "novo")
  expected_close_at: string | null;
  created_at: string;
};

type Props = {
  items: Oportunidade[];
  onChanged?: (updated: Oportunidade[]) => void; // para refletir no pai
};

const columnStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  minWidth: 260,
  width: 260,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  cursor: "grab",
};

function Column(props: React.PropsWithChildren<{ id: Stage; title: string; count: number }>) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });
  return (
    <div ref={setNodeRef} style={{ ...columnStyle, outline: isOver ? "2px solid #A11C27" : "none" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {props.title} <span style={{ color: "#64748b" }}>({props.count})</span>
      </div>
      {props.children}
    </div>
  );
}

function Card({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    ...cardStyle,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

export default function KanbanBoard({ items, onChanged }: Props) {
  // Normaliza stage faltando -> "novo"
  const [data, setData] = useState<Oportunidade[]>(
    items.map((o) => ({ ...o, stage: (o.stage as Stage) ?? "novo" }))
  );

  const grouped = useMemo(() => {
    const g: Record<Stage, Oportunidade[]> = {
      novo: [],
      qualificando: [],
      proposta: [],
      negociacao: [],
      fechado_ganho: [],
      fechado_perdido: [],
    };
    for (const o of data) {
      const s = (o.stage as Stage) ?? "novo";
      g[s].push(o);
    }
    return g;
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function onDragEnd(evt: DragEndEvent) {
    const cardId = evt.active?.id as string | undefined;
    const overCol = evt.over?.id as Stage | undefined;
    if (!cardId || !overCol) return;

    const current = data.find((d) => d.id === cardId);
    if (!current || current.stage === overCol) return;

    // Otimismo: atualiza UI antes de salvar
    const previous = current.stage as Stage;
    setData((prev) =>
      prev.map((p) => (p.id === cardId ? { ...p, stage: overCol } : p))
    );

    try {
      await updateOpportunityStage(cardId, overCol);
      const updated = data.map((p) => (p.id === cardId ? { ...p, stage: overCol } : p));
      onChanged?.(updated);
    } catch (err: any) {
      // Reverte em caso de erro
      console.error(err);
      setData((prev) =>
        prev.map((p) => (p.id === cardId ? { ...p, stage: previous } : p))
      );
      alert("Não foi possível mover a oportunidade: " + err.message);
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {stages.map((s) => (
          <Column key={s} id={s} title={stageLabels[s]} count={grouped[s].length}>
            {grouped[s].map((o) => (
              <Card key={o.id} id={o.id}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{o.segmento}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Valor:{" "}
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(o.valor_credito)}
                  {" · "}Score: {"★".repeat(o.score)}
                </div>
              </Card>
            ))}
          </Column>
        ))}
      </DndContext>
    </div>
  );
}
