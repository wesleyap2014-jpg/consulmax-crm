import fs from "node:fs";

function replaceOnce(text, anchor, replacement, label) {
  if (!text.includes(anchor)) throw new Error(`Newsletter templates: ${label} anchor not found`);
  return text.replace(anchor, replacement);
}

// -----------------------------------------------------------------------------
// MarketingNewsletterPanel.tsx
// -----------------------------------------------------------------------------
const panelPath = "src/pages/MarketingNewsletterPanel.tsx";
let panel = fs.readFileSync(panelPath, "utf8");

if (!panel.includes("template_id: string | null;")) {
  panel = replaceOnce(
    panel,
    "  campaign_id: string | null;\n",
    "  campaign_id: string | null;\n  template_id: string | null;\n",
    "Newsletter type",
  );
}

if (!panel.includes("type NewsletterTemplateOption =")) {
  const anchor = `type CampaignOption = {\n  id: string;\n  name: string;\n};\n`;
  const addition = `${anchor}\ntype NewsletterTemplateOption = {\n  id: string;\n  name: string;\n  slug: string;\n  description: string | null;\n  category: string;\n  is_default: boolean;\n};\n`;
  panel = replaceOnce(panel, anchor, addition, "template option type");
}

if (!panel.includes('    template_id: "",')) {
  panel = replaceOnce(
    panel,
    '    campaign_id: "",\n',
    '    campaign_id: "",\n    template_id: "",\n',
    "empty form template id",
  );
}

if (!panel.includes("const [templates, setTemplates]")) {
  panel = replaceOnce(
    panel,
    "  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);\n",
    "  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);\n  const [templates, setTemplates] = useState<NewsletterTemplateOption[]>([]);\n",
    "templates state",
  );
}

if (!panel.includes("templateRes")) {
  panel = replaceOnce(
    panel,
    `    const [newsletterRes, campaignRes] = await Promise.all([\n      supabase.from("marketing_newsletters").select("*").order("created_at", { ascending: false }),\n      supabase.from("marketing_campaigns").select("id,name").order("created_at", { ascending: false }),\n    ]);`,
    `    const [newsletterRes, campaignRes, templateRes] = await Promise.all([\n      supabase.from("marketing_newsletters").select("*").order("created_at", { ascending: false }),\n      supabase.from("marketing_campaigns").select("id,name").order("created_at", { ascending: false }),\n      supabase.from("marketing_newsletter_templates").select("id,name,slug,description,category,is_default").eq("status", "ativo").order("is_default", { ascending: false }).order("name", { ascending: true }),\n    ]);`,
    "load templates",
  );

  panel = replaceOnce(
    panel,
    "    setCampaigns((campaignRes.data || []) as CampaignOption[]);\n",
    "    setCampaigns((campaignRes.data || []) as CampaignOption[]);\n    setTemplates((templateRes.data || []) as NewsletterTemplateOption[]);\n",
    "set templates",
  );
}

if (!panel.includes("defaultTemplate = templates.find")) {
  panel = replaceOnce(
    panel,
    `  function openNew() {\n    setEditingId(null);\n    setBannerFile(null);\n    setForm(emptyForm());\n    setDialogOpen(true);\n  }`,
    `  function openNew() {\n    setEditingId(null);\n    setBannerFile(null);\n    const initial = emptyForm();\n    const defaultTemplate = templates.find((template) => template.is_default) || templates[0];\n    if (defaultTemplate) initial.template_id = defaultTemplate.id;\n    setForm(initial);\n    setDialogOpen(true);\n  }`,
    "open new default template",
  );
}

if (!panel.includes("template_id: item.template_id")) {
  panel = replaceOnce(
    panel,
    "      campaign_id: item.campaign_id || \"\",\n",
    "      campaign_id: item.campaign_id || \"\",\n      template_id: item.template_id || templates.find((template) => template.is_default)?.id || \"\",\n",
    "edit template id",
  );
}

if (!panel.includes("template_id: form.template_id")) {
  panel = replaceOnce(
    panel,
    "        campaign_id: form.campaign_id || null,\n",
    "        campaign_id: form.campaign_id || null,\n        template_id: form.template_id || templates.find((template) => template.is_default)?.id || null,\n",
    "save template id",
  );
}

if (!panel.includes('Field label="Modelo / layout"')) {
  const campaignField = `            <Field label="Campanha"><NativeSelect allowEmpty emptyLabel="Sem campanha" value={form.campaign_id} onChange={(value) => setForm((current) => ({ ...current, campaign_id: value }))} options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} /></Field>`;
  const templateField = `            <Field label="Modelo / layout"><NativeSelect value={form.template_id} onChange={(value) => setForm((current) => ({ ...current, template_id: value }))} options={templates.map((template) => ({ value: template.id, label: template.name }))} /></Field>\n            ${campaignField}`;
  panel = replaceOnce(panel, campaignField, templateField, "template field");
}

if (!panel.includes("Modelo selecionado:")) {
  const contentField = `            <div className="md:col-span-2"><Field label="Conteúdo da newsletter"><Textarea rows={12} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Escreva ou gere o conteúdo completo da newsletter" /></Field></div>`;
  const selectedTemplateInfo = `            {form.template_id && templates.find((template) => template.id === form.template_id) && (\n              <div className="md:col-span-2 rounded-2xl border border-[#B5A573]/30 bg-[#B5A573]/10 px-4 py-3 text-sm text-[#1E293F]">\n                <span className="font-semibold">Modelo selecionado:</span> {templates.find((template) => template.id === form.template_id)?.name}\n                <p className="mt-1 text-xs text-slate-600">{templates.find((template) => template.id === form.template_id)?.description || "Layout visual da newsletter."}</p>\n              </div>\n            )}\n${contentField}`;
  panel = replaceOnce(panel, contentField, selectedTemplateInfo, "template description");
}

fs.writeFileSync(panelPath, panel, "utf8");

// -----------------------------------------------------------------------------
// newsletter-dispatch-run.ts
// -----------------------------------------------------------------------------
const dispatchPath = "api/marketing/newsletter-dispatch-run.ts";
let dispatch = fs.readFileSync(dispatchPath, "utf8");

if (!dispatch.includes("  template_id: string | null;")) {
  dispatch = replaceOnce(
    dispatch,
    `type Newsletter = {\n  id: string;\n`,
    `type Newsletter = {\n  id: string;\n  template_id: string | null;\n`,
    "dispatch newsletter template id",
  );
}

if (!dispatch.includes("type NewsletterTemplate =")) {
  const anchor = `type Dispatch = {`;
  const typeBlock = `type NewsletterTemplate = {\n  id: string;\n  name: string;\n  slug: string;\n  html_template: string;\n};\n\n${anchor}`;
  dispatch = replaceOnce(dispatch, anchor, typeBlock, "dispatch template type");
}

if (!dispatch.includes("function renderTemplateHtml(")) {
  const start = dispatch.indexOf("function renderHtml(newsletter: Newsletter, recipient: QueueRecipient, bannerUrl: string) {");
  const end = dispatch.indexOf("\nfunction rawMessage(", start);
  if (start < 0 || end < 0) throw new Error("Newsletter templates: renderHtml block not found");

  const replacement = `function renderTemplateHtml(templateHtml: string, newsletter: Newsletter, recipient: QueueRecipient, bannerUrl: string) {\n  const ctaUrl = safeHttpUrl(newsletter.cta_url);\n  const greeting = firstName(recipient.name);\n  const values: Record<string, string> = {\n    preheader: escapeHtml(newsletter.preheader || ""),\n    title: escapeHtml(newsletter.title),\n    greeting: greeting ? \`<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">Olá, \${escapeHtml(greeting)}.</p>\` : "",\n    content: paragraphs(newsletter.content),\n    banner: bannerUrl ? \`<tr><td><img src="\${escapeHtml(bannerUrl)}" alt="" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;"></td></tr>\` : "",\n    cta: ctaUrl && newsletter.cta_text ? \`<div style="margin:28px 0 8px;"><a href="\${escapeHtml(ctaUrl)}" style="display:inline-block;background:#A11C27;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:14px;">\${escapeHtml(newsletter.cta_text)}</a></div>\` : "",\n    from_email: escapeHtml(FROM_EMAIL),\n  };\n\n  return Object.entries(values).reduce(\n    (html, [key, value]) => html.replaceAll(\`{{\${key}}}\`, value),\n    templateHtml,\n  );\n}\n\nasync function loadNewsletterTemplate(templateId?: string | null) {\n  if (templateId) {\n    const { data, error } = await db\n      .from("marketing_newsletter_templates")\n      .select("id,name,slug,html_template")\n      .eq("id", templateId)\n      .eq("status", "ativo")\n      .maybeSingle();\n    if (error) throw error;\n    if (data) return data as NewsletterTemplate;\n  }\n\n  const { data, error } = await db\n    .from("marketing_newsletter_templates")\n    .select("id,name,slug,html_template")\n    .eq("status", "ativo")\n    .eq("is_default", true)\n    .limit(1)\n    .maybeSingle();\n  if (error) throw error;\n  if (!data) throw new Error("Nenhum modelo ativo de newsletter foi encontrado.");\n  return data as NewsletterTemplate;\n}\n`;

  dispatch = dispatch.slice(0, start) + replacement + dispatch.slice(end);
}

if (!dispatch.includes('select("id,title,subject,preheader,content,cta_text,cta_url,banner_file_path,banner_external_url,scheduled_for,template_id")')) {
  dispatch = replaceOnce(
    dispatch,
    `.select("id,title,subject,preheader,content,cta_text,cta_url,banner_file_path,banner_external_url,scheduled_for")`,
    `.select("id,title,subject,preheader,content,cta_text,cta_url,banner_file_path,banner_external_url,scheduled_for,template_id")`,
    "dispatch newsletter select",
  );
}

if (!dispatch.includes("const selectedTemplate = await loadNewsletterTemplate")) {
  dispatch = replaceOnce(
    dispatch,
    `      const imageUrl = await bannerUrl(newsletter);\n      session ||= await openSmtpSession();`,
    `      const imageUrl = await bannerUrl(newsletter);\n      const selectedTemplate = await loadNewsletterTemplate(newsletter.template_id);\n      session ||= await openSmtpSession();`,
    "load selected template",
  );

  dispatch = replaceOnce(
    dispatch,
    `          const html = renderHtml(newsletter, recipient, imageUrl);`,
    `          const html = renderTemplateHtml(selectedTemplate.html_template, newsletter, recipient, imageUrl);`,
    "render selected template",
  );
}

fs.writeFileSync(dispatchPath, dispatch, "utf8");
console.log("Newsletter template integration patch applied");
