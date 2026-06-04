import React from "react";
import AtendimentoWhatsApp from "../AtendimentoWhatsApp";
import { WhatsAppModuleHeader } from "./WhatsAppShell";

export default function WhatsAppAtendimento() {
  return (
    <div className="space-y-5">
      <WhatsAppModuleHeader
        title="Atendimento WhatsApp"
        subtitle="Kanban de tickets, chat, dados do cliente e ações rápidas para operação diária."
      />

      <div className="rounded-[28px] border border-white/80 bg-white/70 p-3 shadow-xl shadow-slate-900/5 backdrop-blur">
        <AtendimentoWhatsApp />
      </div>
    </div>
  );
}
