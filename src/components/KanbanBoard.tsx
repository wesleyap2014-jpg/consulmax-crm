// src/components/KanbanBoard.tsx
import React, { useMemo, useState } from "react";
import { DndContext, DragEndEvent, closestCorners } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabaseClient";

export type DbStage =
  | "novo"
  | "qualificando"
  | "proposta"
  | "negociacao"
  | "fechado_ganho"
  | "fechado_perdido";

export type KanbanItem = {
  id: string;
  // coluna nova (enum no banco)
  stage?: DbStage | null;
  // coluna legada (texto) — pode existir em registros antigos
  estagio?: string | null;

  // alguns campos úteis para exibir no card
  lead_id?: string | null;
  vendedor_id?: string | null;
  valor_credito?: number | null;
  segmento?: string | null;
};

type Props = {
  items: KanbanItem[];
  onChanged?: (items: KanbanItem[]) => void;
};

const COLUMNS: { id: DbStage; title: string }[] = [
  { id: "novo",             title: "Novo" },
  { id: "qualificando",     title: "Qualificando" },
  { id: "proposta",         title: "Proposta" },
  { id: "negociacao",       title: "Negociação" },
  { id: "fechado_ganho",    title: "Fechado (Ganho)" },
  { id: "fechado_perdido",  title: "Fechado (Perdido)" },
];

/** Converte o legado `estagio` textual em um valor do enum `stage` */
function normalizeStage(item: KanbanItem): DbStage {
  if (item.stage) return item.stage;
  const e = (item.estagio || "").toLowerCase();
  switch (e) {
    case "novo":
      return "novo";
    case "qualificação":
    case "qualificacao":
    case "qualificando":
      return "qualificando";
    case "proposta":
      return "proposta";
    case "negociação":
    case "negociacao":
      return "negociacao";
    case "convertido":
    case "fechado (ganho)":
      return "fechado_ganho";
    case "perdido":
    case "fechado (perdido)":
      return "fechado_perdido";
    default:
      return "novo";
  }
}

function Column({
  id,
  title,
  children,
}: {
  id: DbStage;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: 300,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 2px 12px rgba(0,0,0,.06)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      data-column-id={id}
    >
      <div style={{ fontWeight: 700, color: "#334155", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Card({ item }: { item: KanbanItem }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 10,
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div style={{ fontWeight: 600, color: "#0f172a" }}>
        {item.segmento || "Oportunidade"}
      </div>
      <div style={{ fontSize: 12, color: "#475569" }}>
        {item.valor_credito
          ? new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(item.valor_credito)
          : "—"}
      </div>
    </div>
  );
}

export default function KanbanBoard({ items, onChanged }: Props) {
  // estado local para trabalhar visualmente
  const [data, setData] = useState<KanbanItem[]>(
    (items || []).map((it) => ({ ...it, stage: normalizeStage(it) }))
  );

  // agrupa por coluna
  const byColumn = useMemo(() => {
    const map: Record<DbStage, KanbanItem[]> = {
      novo: [],
      qualificando: [],
      proposta: [],
      negociacao: [],
      fechado_ganho: [],
      fechado_perdido: [],
    };
    for (const it of data) map[normalizeStage(it)].push(it);
    return map;
  }, [data]);

  async function persistStage(opportunityId: string, newStage: DbStage) {
    // RPC no Supabase (ajuste nomes dos parâmetros se o seu SQL diferir)
    const { error } = await supabase.rpc("update_opportunity_stage", {
      p_id: opportunityId,
      p_new_stage: newStage,
      p_reason: null,
    });
    if (error) throw error;
  }

  async function onDragEnd(evt: DragEndEvent) {
    const activeId = String(evt.active.id);

    // destino (coluna) — detecta tanto por container quanto por data-attr
    const overContainer = (evt.over?.data?.current as any)?.containerId as DbStage | undefined;
    const overFromAttr =
      (evt.over?.node?.getAttribute("data-column-id") as DbStage | null) || null;
    const destination = overContainer || overFromAttr || undefined;
    if (!destination) return;

    const idx = data.findIndex((i) => i.id === activeId);
    if (idx < 0) return;

    const currentStage = normalizeStage(data[idx]);
    if (currentStage === destination) return;

    // otimismo: move local
    const next = [...data];
    next[idx] = { ...next[idx], stage: destination };
    setData(next);
    onChanged?.(next);

    try {
      await persistStage(activeId, destination);
    } catch (e: any) {
      alert("Falha ao atualizar estágio: " + e.message);
      // rollback se deu erro
      setData(data);
      onChanged?.(data);
    }
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
        {COLUMNS.map((col) => (
          <Column key={col.id} id={col.id} title={col.title}>
            <SortableContext
              items={byColumn[col.id].map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div
                data-column-id={col.id}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {byColumn[col.id].map((it) => (
                  <Card key={it.id} item={it} />
                ))}
                {!byColumn[col.id].length && (
                  <div
                    style={{
                      color: "#94a3b8",
                      fontSize: 12,
                      textAlign: "center",
                      padding: 6,
                    }}
                  >
                    (vazio)
                  </div>
                )}
              </div>
            </SortableContext>
          </Column>
        ))}
      </div>
    </DndContext>
  );
}
