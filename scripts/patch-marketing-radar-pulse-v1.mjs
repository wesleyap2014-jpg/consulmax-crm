import fs from "node:fs";

const socialFile = "api/marketing/_social.ts";
let source = fs.readFileSync(socialFile, "utf8");
const from = `      "pages_show_list",\n      "pages_read_engagement",\n      "pages_manage_posts",\n      "pages_manage_engagement",`;
const to = `      "pages_show_list",\n      "pages_read_engagement",\n      "business_management",\n      "instagram_basic",\n      "instagram_content_publish",\n      "instagram_manage_comments",\n      "instagram_manage_insights",\n      "pages_manage_metadata",\n      "pages_manage_posts",\n      "pages_manage_engagement",`;

if (!source.includes(to)) {
  const candidates = [
    `      "pages_show_list",\n      "pages_read_engagement",\n      "instagram_basic",\n      "instagram_content_publish",\n      "instagram_manage_comments",\n      "instagram_manage_insights",\n      "pages_manage_metadata",\n      "pages_manage_posts",\n      "pages_manage_engagement",`,
    `      "pages_show_list",\n      "pages_read_engagement",\n      "instagram_basic",\n      "pages_manage_posts",\n      "pages_manage_engagement",`,
    from,
  ];
  const candidate = candidates.find((item) => source.includes(item));
  if (!candidate) throw new Error("[patch-marketing-radar-pulse-v1] âncora de escopos Meta não encontrada");
  source = source.replace(candidate, to);
  fs.writeFileSync(socialFile, source);
  console.log("[patch-marketing-radar-pulse-v1] escopos Meta da Central atualizados");
} else {
  console.log("[patch-marketing-radar-pulse-v1] escopos Meta já aplicados");
}

const callbackFile = "api/marketing/social-callback.ts";
let callback = fs.readFileSync(callbackFile, "utf8");
const callbackFrom = `  const pages = await fetchJson(\n    \`https://graph.facebook.com/\${META_GRAPH_VERSION}/me/accounts?limit=100&fields=id,name,access_token,picture{url}\`,\n    { headers: { Authorization: \`Bearer \${accessToken}\` } },\n  );\n\n  const saved: any[] = [];\n  for (const page of pages?.data || []) {\n    const pageToken = String(page?.access_token || accessToken);\n    saved.push(await saveSocialAccount({\n      provider: "facebook",\n      providerAccountId: String(page.id),\n      username: page.name || null,\n      displayName: page.name || "Página do Facebook",\n      accountType: "page",\n      avatarUrl: page?.picture?.data?.url || null,\n      editorialRole: "Marca / Página",\n      scopes,\n      accessToken: pageToken,\n      expiresAt: addSeconds(expiresIn),\n      connectedBy: userId,\n      metadata: { page_id: page.id, meta_user_token_expires_in: expiresIn || null },\n      providerPayload: { page_id: page.id },\n    }));\n  }\n\n  if (!saved.length) throw new Error("Nenhuma Página do Facebook autorizada foi encontrada.");`;

const callbackTo = `  const pages = await fetchJson(\n    \`https://graph.facebook.com/\${META_GRAPH_VERSION}/me/accounts?limit=100&fields=id,name,access_token,picture{url},instagram_business_account{id,username}\`,\n    { headers: { Authorization: \`Bearer \${accessToken}\` } },\n  );\n\n  let pageRows: any[] = Array.isArray(pages?.data) ? pages.data : [];\n  let pageDiscoverySource = "me/accounts";\n\n  if (!pageRows.length) {\n    try {\n      const assigned = await fetchJson(\n        \`https://graph.facebook.com/\${META_GRAPH_VERSION}/me/assigned_pages?limit=100&fields=id,name,picture{url},tasks\`,\n        { headers: { Authorization: \`Bearer \${accessToken}\` } },\n      );\n      if (Array.isArray(assigned?.data) && assigned.data.length) {\n        pageRows = assigned.data;\n        pageDiscoverySource = "me/assigned_pages";\n      }\n    } catch (error) {\n      console.warn("[social-callback] fallback me/assigned_pages indisponível.", error);\n    }\n  }\n\n  const saved: any[] = [];\n  for (const rawPage of pageRows) {\n    let page: any = { ...rawPage };\n    let pageToken = String(page?.access_token || "");\n\n    if (!pageToken && page?.id) {\n      try {\n        const details = await fetchJson(\n          \`https://graph.facebook.com/\${META_GRAPH_VERSION}/\${encodeURIComponent(String(page.id))}?fields=id,name,access_token,picture{url},instagram_business_account{id,username}\`,\n          { headers: { Authorization: \`Bearer \${accessToken}\` } },\n        );\n        page = { ...page, ...details };\n        pageToken = String(details?.access_token || "");\n      } catch (error) {\n        console.warn("[social-callback] detalhes/token da Página indisponíveis; usando token do usuário.", page?.id, error);\n      }\n    }\n\n    if (!pageToken) pageToken = accessToken;\n    saved.push(await saveSocialAccount({\n      provider: "facebook",\n      providerAccountId: String(page.id),\n      username: page.name || null,\n      displayName: page.name || "Página do Facebook",\n      accountType: "page",\n      avatarUrl: page?.picture?.data?.url || null,\n      editorialRole: "Marca / Página",\n      scopes,\n      accessToken: pageToken,\n      expiresAt: addSeconds(expiresIn),\n      connectedBy: userId,\n      metadata: {\n        page_id: page.id,\n        meta_user_token_expires_in: expiresIn || null,\n        page_discovery_source: pageDiscoverySource,\n        tasks: Array.isArray(page?.tasks) ? page.tasks : [],\n        instagram_business_account: page?.instagram_business_account || null,\n      },\n      providerPayload: {\n        page_id: page.id,\n        page_discovery_source: pageDiscoverySource,\n        instagram_business_account: page?.instagram_business_account || null,\n      },\n    }));\n  }\n\n  if (!saved.length) {\n    const hasBusinessManagement = scopes.includes("business_management");\n    throw new Error(\n      hasBusinessManagement\n        ? "Nenhuma Página do Facebook foi encontrada, inclusive entre as Páginas atribuídas ao Business Portfolio."\n        : "A Página parece estar no Business Portfolio. Adicione business_management à configuração Radar Consulmax e autorize novamente.",\n    );\n  }`;

if (!callback.includes(callbackTo)) {
  if (!callback.includes(callbackFrom)) throw new Error("[patch-marketing-radar-pulse-v1] âncora do callback Meta não encontrada");
  callback = callback.replace(callbackFrom, callbackTo);
  fs.writeFileSync(callbackFile, callback);
  console.log("[patch-marketing-radar-pulse-v1] fallback de Business Portfolio aplicado ao callback Meta");
} else {
  console.log("[patch-marketing-radar-pulse-v1] fallback de Business Portfolio já aplicado");
}

const radarFile = "api/marketing/radar-run.ts";
let radar = fs.readFileSync(radarFile, "utf8");
const radarFrom = "engagementRates.filter((value) => value > 0)";
const radarTo = "engagementRates.filter((value: number) => value > 0)";
if (!radar.includes(radarTo)) {
  if (!radar.includes(radarFrom)) throw new Error("[patch-marketing-radar-pulse-v1] âncora de tipagem do Radar não encontrada");
  radar = radar.replace(radarFrom, radarTo);
  fs.writeFileSync(radarFile, radar);
  console.log("[patch-marketing-radar-pulse-v1] tipagem do Radar corrigida");
} else {
  console.log("[patch-marketing-radar-pulse-v1] tipagem do Radar já corrigida");
}
