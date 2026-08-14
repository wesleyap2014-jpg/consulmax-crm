import { useEffect } from "react";
import OportunidadesPipelineV8 from "./OportunidadesPipelineV8";

const C = {
  navy: "#1E293F",
  gold: "#B5A573",
  slate: "#64748b",
};

const normalizeText = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function findSection(modal: HTMLElement, title: string) {
  const heading = Array.from(modal.querySelectorAll("h3")).find(
    (node) => normalizeText(node.textContent) === normalizeText(title),
  ) as HTMLElement | undefined;
  return (heading?.parentElement || null) as HTMLElement | null;
}

function applyCardStyle(card: HTMLElement | null) {
  if (!card) return;
  Object.assign(card.style, {
    display: "block",
    minWidth: "0",
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(30,41,63,.10)",
    borderRadius: "18px",
    padding: "13px",
    background: "white",
    boxShadow: "none",
    margin: "0",
  });

  const heading = card.querySelector("h3") as HTMLElement | null;
  if (heading) {
    Object.assign(heading.style, {
      margin: "2px 0 9px",
      color: C.navy,
      fontSize: "16px",
      lineHeight: "1.2",
      fontWeight: "800",
    });
  }
}

function ensureAndamentoCard(contextCard: HTMLElement) {
  contextCard.dataset.crmAndamentoCard = "true";
  applyCardStyle(contextCard);
  contextCard.style.display = "grid";
  contextCard.style.gap = "9px";

  let heading = contextCard.querySelector(
    '[data-crm-andamento-heading="true"]',
  ) as HTMLElement | null;

  if (!heading) {
    const existing = Array.from(contextCard.childNodes);
    const details = document.createElement("div");
    details.dataset.crmAndamentoDetails = "true";
    Object.assign(details.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      flexWrap: "wrap",
      color: "#334155",
      fontSize: "12px",
    });
    existing.forEach((node) => details.appendChild(node));

    heading = document.createElement("div");
    heading.dataset.crmAndamentoHeading = "true";

    const eyebrow = document.createElement("div");
    eyebrow.textContent = "Contexto da oportunidade";
    Object.assign(eyebrow.style, {
      color: C.gold,
      fontSize: "10px",
      textTransform: "uppercase",
      letterSpacing: "1px",
      fontWeight: "900",
    });

    const title = document.createElement("h3");
    title.textContent = "Andamento Comercial";
    Object.assign(title.style, {
      margin: "2px 0 0",
      color: C.navy,
      fontSize: "16px",
      lineHeight: "1.2",
      fontWeight: "800",
    });

    heading.append(eyebrow, title);
    contextCard.append(heading, details);
  }
}

function ensureLayoutStyles() {
  if (document.getElementById("crm-treatment-v9-layout")) return;
  const style = document.createElement("style");
  style.id = "crm-treatment-v9-layout";
  style.textContent = `
    .crm-treatment-v9-follow-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
      width: 100%;
      min-width: 0;
    }
    @media (max-width: 900px) {
      .crm-treatment-v9-follow-row {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

export default function OportunidadesPipelineV9() {
  useEffect(() => {
    ensureLayoutStyles();

    const organize = () => {
      const treatTitle = Array.from(document.querySelectorAll("h2")).find((node) =>
        normalizeText(node.textContent).startsWith("tratar oportunidade"),
      ) as HTMLElement | undefined;
      if (!treatTitle) return;

      const modalHeader = treatTitle.parentElement;
      const modal = modalHeader?.parentElement as HTMLElement | null;
      if (!modal) return;

      const v8Host = modal.querySelector(
        '[data-crm-treatment-v8="true"]',
      ) as HTMLElement | null;
      const enhancement = v8Host?.firstElementChild as HTMLElement | null;
      if (!enhancement) return;

      const aiCard = Array.from(enhancement.querySelectorAll("section")).find((section) =>
        normalizeText(section.textContent).includes("direcao da ia"),
      ) as HTMLElement | undefined;

      const followUpCard = Array.from(enhancement.querySelectorAll("section")).find((section) =>
        normalizeText(section.querySelector("h3")?.textContent) === "follow up",
      ) as HTMLElement | undefined;

      const simulationsCard = Array.from(enhancement.querySelectorAll("section")).find((section) => {
        const text = normalizeText(section.querySelector("h3")?.textContent);
        return text === "propostas" || text === "simulacoes do periodo";
      }) as HTMLElement | undefined;

      const dataCard = findSection(modal, "Dados comerciais");
      const meetingCard = findSection(modal, "Agendamento de reunião");
      const historyCard =
        findSection(modal, "Histórico de anotações") ||
        findSection(modal, "Anotações e Follow Ups");

      const contextCard = Array.from(enhancement.children).find((child) => {
        const element = child as HTMLElement;
        return (
          element.dataset.crmAndamentoCard === "true" ||
          normalizeText(element.textContent).includes("oportunidade criada ha")
        );
      }) as HTMLElement | undefined;

      if (!aiCard || !followUpCard || !simulationsCard || !contextCard) return;

      applyCardStyle(aiCard);
      applyCardStyle(dataCard);
      ensureAndamentoCard(contextCard);
      applyCardStyle(followUpCard);
      applyCardStyle(historyCard);
      applyCardStyle(simulationsCard);
      applyCardStyle(meetingCard);

      if (historyCard) {
        const h3 = historyCard.querySelector("h3") as HTMLElement | null;
        if (h3 && h3.textContent !== "Anotações e Follow Ups") {
          h3.textContent = "Anotações e Follow Ups";
        }
      }

      const simTitle = simulationsCard.querySelector("h3") as HTMLElement | null;
      if (simTitle && simTitle.textContent !== "Simulações do Período") {
        simTitle.textContent = "Simulações do Período";
      }
      const simEyebrow = simulationsCard.querySelector("div > div") as HTMLElement | null;
      if (
        simEyebrow &&
        normalizeText(simEyebrow.textContent) === "simulacoes do periodo"
      ) {
        simEyebrow.textContent = "Propostas";
      }

      let followRow = enhancement.querySelector(
        '[data-crm-followup-notes-row="true"]',
      ) as HTMLElement | null;
      if (!followRow) {
        followRow = document.createElement("div");
        followRow.dataset.crmFollowupNotesRow = "true";
        followRow.className = "crm-treatment-v9-follow-row";
      }

      if (followUpCard.parentElement !== followRow) followRow.appendChild(followUpCard);
      if (historyCard && historyCard.parentElement !== followRow) followRow.appendChild(historyCard);

      const desired: HTMLElement[] = [
        aiCard,
        ...(dataCard ? [dataCard] : []),
        contextCard,
        followRow,
        simulationsCard,
        ...(meetingCard ? [meetingCard] : []),
      ];

      desired.forEach((node, index) => {
        const current = enhancement.children[index] as HTMLElement | undefined;
        if (current !== node) enhancement.insertBefore(node, current || null);
      });

      Array.from(enhancement.children).forEach((child) => {
        const element = child as HTMLElement;
        if (desired.includes(element)) return;
        const hasVisibleContent = normalizeText(element.textContent).length > 0;
        if (!hasVisibleContent) element.style.display = "none";
      });
    };

    organize();
    const observer = new MutationObserver(organize);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <OportunidadesPipelineV8 />;
}
