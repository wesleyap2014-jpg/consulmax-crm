import fs from "node:fs";

const bridgeTemplatePath = "scripts/templates/CanvaProductionBridge.visual-prompt.tsx";
const bridgeRuntimePath = "src/components/marketing/CanvaProductionBridge.tsx";
const productionPath = "src/components/marketing/ProductionWorkspaceV2.tsx";
const centerPath = "src/pages/MarketingContentCenter.tsx";

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`[approval-caption-v2] ${label}: anchor not found`);
  return text.replace(from, to);
}

function patchBridge(path) {
  if (!fs.existsSync(path)) return;
  let text = fs.readFileSync(path, "utf8");

  text = replaceOnce(
    text,
    'import { Textarea } from "@/components/ui/textarea";\n',
    'import { Textarea } from "@/components/ui/textarea";\nimport ProductionCaptionPanel, { captionRequiredForFormat } from "./ProductionCaptionPanel";\n',
    `${path} caption import`,
  );

  const functionStart = text.indexOf("  async function requestApproval() {");
  const functionEnd = text.indexOf("\n\n  const canvaPrompts", functionStart);
  if (functionStart < 0 || functionEnd < 0) throw new Error(`[approval-caption-v2] ${path} requestApproval boundaries not found`);

  const replacement = `  async function requestApproval() {
    setBusy(true);
    try {
      const { data: finalAssets, error: finalError } = await supabase
        .from("marketing_content_assets")
        .select("id")
        .eq("production_order_id", order.id)
        .in("asset_role", FINAL_ROLES)
        .limit(1);
      if (finalError) throw finalError;
      if (!finalAssets?.length) throw new Error("Faça upload da peça final antes de solicitar aprovação.");
      if (!order.variant_id) throw new Error("Esta ordem não está vinculada a uma versão editorial.");

      if (captionRequiredForFormat(String(order.format || ""))) {
        const { data: variantData, error: captionError } = await supabase
          .from("marketing_content_variants")
          .select("caption")
          .eq("id", order.variant_id)
          .maybeSingle();
        if (captionError) throw captionError;
        if (!String(variantData?.caption || "").trim()) {
          throw new Error("Gere ou preencha a legenda desta publicação antes de solicitar aprovação.");
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Usuário não identificado.");
      const now = new Date().toISOString();

      const { error: variantError } = await supabase.from("marketing_content_variants").update({
        status: "aprovacao",
        updated_at: now,
      }).eq("id", order.variant_id);
      if (variantError) throw variantError;

      const { error: approvalError } = await supabase.from("marketing_content_approvals").insert({
        variant_id: order.variant_id,
        status: "pending",
        requested_by: user.id,
        requested_at: now,
        decision_note: "Peça final enviada pela Produção e aguardando aprovação final.",
      });
      if (approvalError) throw approvalError;

      const metadata = {
        ...(order.metadata || {}),
        last_submitted_for_approval_at: now,
      };
      const { error: updateError } = await supabase.from("marketing_production_orders").update({
        status: "pronto_aprovacao",
        sent_for_approval_at: now,
        metadata,
        updated_at: now,
      }).eq("id", order.id);
      if (updateError) throw updateError;
      onNotice?.("Peça encaminhada para Aprovações e removida da fila de Produção.");
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao solicitar aprovação.");
    } finally {
      setBusy(false);
    }
  }`;
  text = text.slice(0, functionStart) + replacement + text.slice(functionEnd);

  const uploadAnchor = '    <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-[#B5A573]/50';
  if (!text.includes("<ProductionCaptionPanel")) {
    if (!text.includes(uploadAnchor)) throw new Error(`[approval-caption-v2] ${path} upload anchor not found`);
    text = text.replace(
      uploadAnchor,
      '    <ProductionCaptionPanel order={order} onNotice={onNotice} onError={onError} onChanged={onChanged} />\n' + uploadAnchor,
    );
  }

  fs.writeFileSync(path, text, "utf8");
}

patchBridge(bridgeTemplatePath);
patchBridge(bridgeRuntimePath);

if (fs.existsSync(productionPath)) {
  let text = fs.readFileSync(productionPath, "utf8");

  if (!text.includes('rejeitado: "Rejeitado"')) {
    text = text.replace('  ajuste_solicitado: "Ajuste solicitado",\n', '  ajuste_solicitado: "Ajuste solicitado",\n  rejeitado: "Rejeitado",\n');
  }

  const memoAnchor = `  const variantById = useMemo(() => new Map(variants.map((item) => [item.id, item])), [variants]);\n  const assetsByOrder = useMemo(() => {`;
  const memoReplacement = `  const variantById = useMemo(() => new Map(variants.map((item) => [item.id, item])), [variants]);\n  const productionOrders = useMemo(() => orders.filter((item) => !["pronto_aprovacao", "aprovado", "rejeitado"].includes(item.status)), [orders]);\n  const assetsByOrder = useMemo(() => {`;
  text = replaceOnce(text, memoAnchor, memoReplacement, "production queue filter");
  text = text.replace("{orders.map((order) => {", "{productionOrders.map((order) => {");
  text = text.replace("{!orders.length ? <div", "{!productionOrders.length ? <div");

  const returnNoteAnchor = '<p className="mt-1 text-xs text-slate-500">Conteúdo-Mãe: {content?.title || "—"}</p>';
  const returnNoteReplacement = `${returnNoteAnchor}{order.status === "ajuste_solicitado" && order.metadata?.approval_return_note ? <div className="mt-3 rounded-xl border border-[#A11C27]/20 bg-[#A11C27]/5 px-3 py-2 text-xs leading-5 text-[#1E293F]"><strong className="text-[#A11C27]">Ajustes solicitados na aprovação:</strong> {order.metadata.approval_return_note}</div> : null}`;
  text = replaceOnce(text, returnNoteAnchor, returnNoteReplacement, "production return note");

  fs.writeFileSync(productionPath, text, "utf8");
}

if (fs.existsSync(centerPath)) {
  let text = fs.readFileSync(centerPath, "utf8");

  const tabsImport = 'import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";\n';
  const approvalImport = 'import ContentApprovalQueueV2 from "@/components/marketing/ContentApprovalQueueV2";\n';
  if (!text.includes(approvalImport.trim())) {
    text = replaceOnce(text, tabsImport, tabsImport + approvalImport, "approval queue import");
  }

  if (!text.includes('rejeitado: "Rejeitado"')) {
    text = text.replace('    aprovado: "Aprovado",\n', '    aprovado: "Aprovado",\n    rejeitado: "Rejeitado",\n');
  }

  const oldCalendar = '  const calendarVariants = variants.filter((item) => item.planned_at).sort((a, b) => String(a.planned_at).localeCompare(String(b.planned_at)));';
  const newCalendar = '  const calendarVariants = variants.filter((item) => item.status === "aprovado" || Boolean(item.planned_at)).sort((a, b) => { if (!a.planned_at && !b.planned_at) return String(a.created_at).localeCompare(String(b.created_at)); if (!a.planned_at) return -1; if (!b.planned_at) return 1; return String(a.planned_at).localeCompare(String(b.planned_at)); });';
  text = replaceOnce(text, oldCalendar, newCalendar, "calendar receives approved items");

  const approvalsStart = text.indexOf('          <TabsContent value="aprovacoes" className="space-y-4">');
  const calendarStart = text.indexOf('          <TabsContent value="calendario" className="space-y-4">', approvalsStart);
  if (approvalsStart < 0 || calendarStart < 0) throw new Error("[approval-caption-v2] approvals tab boundaries not found");
  const approvalBlock = `          <TabsContent value="aprovacoes" className="space-y-4">
            <div><h2 className="text-xl font-semibold text-[#1E293F]">Aprovação final</h2><p className="text-sm text-slate-500">Revise a peça final e, quando o formato exigir, a legenda. Aprovar envia ao Calendário; Devolver retorna à Produção com orientações de ajuste da imagem.</p></div>
            <ContentApprovalQueueV2
              userId={userId}
              variants={variants}
              contents={contents}
              saving={saving}
              onChanged={loadAll}
              onNotice={setNotice}
              onError={setError}
            />
          </TabsContent>

`;
  text = text.slice(0, approvalsStart) + approvalBlock + text.slice(calendarStart);

  text = text.replace(
    '<span className="text-sm text-slate-600">{fmtDate(variant.planned_at)}</span>',
    '<span className="text-sm text-slate-600">{variant.planned_at ? fmtDate(variant.planned_at) : "Aguardando agendamento"}</span>',
  );
  text = text.replace(
    '<Empty title="Calendário sem itens agendados" description="A estrutura está pronta; quando uma versão receber data/hora, ela passa a aparecer neste calendário unificado." />',
    '<Empty title="Calendário sem conteúdos" description="Conteúdos aprovados aparecem aqui primeiro como aguardando agendamento e depois recebem data/hora para publicação." />',
  );

  fs.writeFileSync(centerPath, text, "utf8");
}

console.log("[approval-caption-v2] aprovação visual, devolução, reprovação, calendário e legendas integrados");
