import fs from "node:fs";

const file = "src/pages/MarketingContentCenter.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(label, from, to) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.log(`[social-accounts] ${label}: âncora não encontrada`);
    return;
  }
  src = src.replace(from, to);
  changed = true;
  console.log(`[social-accounts] ${label}: aplicado`);
}

replaceOnce(
  "retorno OAuth",
  `  useEffect(() => {\n    loadAll();\n  }, []);`,
  `  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);\n    const requestedTab = params.get("tab");\n    if (requestedTab) setActiveTab(requestedTab);\n    const socialStatus = params.get("social");\n    const socialProvider = params.get("provider");\n    const socialCount = params.get("count");\n    const socialMessage = params.get("message");\n    if (socialStatus === "connected") {\n      setNotice(\`Conta conectada com sucesso\${socialProvider ? \` em \${socialProvider}\` : ""}\${socialCount ? \` · \${socialCount} conta(s) encontrada(s)\` : ""}.\`);\n    } else if (socialStatus === "error") {\n      setError(socialMessage || "Não foi possível concluir a autorização da rede social.");\n    }\n    if (socialStatus) window.history.replaceState({}, "", window.location.pathname);\n    loadAll();\n  }, []);`,
);

replaceOnce(
  "funções sociais reais",
  `  const pendingApprovals = variants.filter((item) => item.status === "aprovacao");`,
  `  async function socialApi(path: string, body?: any, method = "POST") {\n    const { data } = await supabase.auth.getSession();\n    const token = data.session?.access_token;\n    if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");\n    const response = await fetch(path, {\n      method,\n      headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },\n      ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),\n    });\n    const result = await response.json();\n    if (!response.ok || !result?.ok) throw new Error(result?.message || "A operação na rede social falhou.");\n    return result;\n  }\n\n  async function connectSocialProvider(provider: string, label: string) {\n    setSaving(true);\n    setError(null);\n    setNotice(null);\n    try {\n      const result = await socialApi("/api/marketing/social-connect", { provider });\n      if (result.connected) {\n        setNotice(\`\${label} conectado e validado.\`);\n        await loadAll();\n        setActiveTab("config");\n        return;\n      }\n      if (result.auth_url) {\n        window.location.assign(result.auth_url);\n        return;\n      }\n      throw new Error(\`\${label}: a rede não retornou uma URL de autorização.\`);\n    } catch (err: any) {\n      setError(err?.message || \`Erro ao conectar \${label}.\`);\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  async function syncInstagramAccount(accountId: string) {\n    setSaving(true);\n    setError(null);\n    setNotice(null);\n    try {\n      const result = await socialApi("/api/marketing/instagram-sync", { account_id: accountId });\n      setNotice(\`Instagram @\${result.username || "conta"} sincronizado · \${result.media_count || 0} conteúdo(s) recente(s) lido(s).\`);\n      await loadAll();\n    } catch (err: any) {\n      setError(err?.message || "Erro ao sincronizar Instagram.");\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  async function uploadInstagramMedia(variant: Variant, files: FileList | null) {\n    if (!files?.length || !userId) return;\n    setSaving(true);\n    setError(null);\n    setNotice(null);\n    try {\n      for (let index = 0; index < files.length; index += 1) {\n        const file = files[index];\n        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");\n        const path = \`\${userId}/instagram/\${variant.id}/\${Date.now()}-\${index}-\${safeName}\`;\n        const { error: uploadError } = await supabase.storage.from("marketing-content-assets").upload(path, file, { upsert: false });\n        if (uploadError) throw uploadError;\n        const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "other";\n        if (kind === "other") throw new Error("O Instagram aceita aqui apenas imagem ou vídeo.");\n        const { error: assetError } = await supabase.from("marketing_content_assets").insert({\n          content_id: variant.content_id,\n          variant_id: variant.id,\n          kind,\n          file_path: path,\n          file_name: file.name,\n          mime_type: file.type || null,\n          file_size_bytes: file.size,\n          created_by: userId,\n        });\n        if (assetError) throw assetError;\n      }\n      setNotice(\`\${files.length} mídia(s) anexada(s) à versão do Instagram.\`);\n    } catch (err: any) {\n      setError(err?.message || "Erro ao anexar mídia ao Instagram.");\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  async function publishInstagramVariant(variant: Variant) {\n    if (!window.confirm("Publicar este conteúdo agora no Instagram conectado? Esta ação é real e ficará visível no perfil.")) return;\n    setSaving(true);\n    setError(null);\n    setNotice(null);\n    try {\n      const result = await socialApi("/api/marketing/instagram-publish", { variant_id: variant.id });\n      setNotice(\`Publicado com sucesso no Instagram\${result.username ? \` @\${result.username}\` : ""}.\`);\n      await loadAll();\n      setActiveTab("publicacoes");\n    } catch (err: any) {\n      setError(err?.message || "Erro ao publicar no Instagram.");\n      await loadAll();\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  const pendingApprovals = variants.filter((item) => item.status === "aprovacao");`,
);

replaceOnce(
  "ações de mídia Instagram em variante aprovada",
  `{variant.status === "rascunho" ? <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => sendToApproval(variant)}>Enviar à aprovação</Button> : null}`,
  `{variant.status === "rascunho" ? <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => sendToApproval(variant)}>Enviar à aprovação</Button> : null}{variant.provider === "instagram" && variant.status === "aprovado" ? <div className="mt-3 space-y-2"><label className="flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent"><Upload className="mr-1.5 h-3.5 w-3.5" />Anexar mídia<input className="hidden" type="file" multiple={variant.format === "carrossel"} accept="image/*,video/*" onChange={(event) => { uploadInstagramMedia(variant, event.target.files); event.currentTarget.value = ""; }} /></label><Button size="sm" className="w-full bg-[#A11C27] hover:bg-[#8b1822]" disabled={saving} onClick={() => publishInstagramVariant(variant)}><Send className="mr-1.5 h-3.5 w-3.5" />Publicar agora</Button></div> : null}`,
);

replaceOnce(
  "sincronizar conta Instagram",
  `<p className="mt-1 text-xs text-slate-400">{account.editorial_role || account.account_type || "Função editorial não definida"}</p></div>`,
  `<p className="mt-1 text-xs text-slate-400">{account.editorial_role || account.account_type || "Função editorial não definida"}</p>{account.provider === "instagram" ? <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs" disabled={saving} onClick={() => syncInstagramAccount(account.id)}><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Sincronizar agora</Button> : null}</div>`,
);

replaceOnce(
  "botão OAuth",
  `<Button variant="outline" className="mt-3 w-full" onClick={() => setNotice(\`\${provider.label}: estrutura OAuth preparada no banco. A ativação exige cadastrar o app oficial e suas credenciais no backend.\`)}>+ Conectar conta</Button>`,
  `<Button variant="outline" className="mt-3 w-full" disabled={saving} onClick={() => connectSocialProvider(provider.key, provider.label)}>{providerAccounts.length ? "+ Adicionar outra conta" : "+ Conectar conta"}</Button>`,
);

replaceOnce(
  "copy publicação real",
  `Fila operacional separada da criação. A publicação real será executada pelas autorizações OAuth de cada conta.`,
  `Fila operacional real. Conteúdos aprovados podem ser publicados diretamente nas contas autorizadas e o retorno da plataforma fica registrado no CRM.`,
);

if (changed) fs.writeFileSync(file, src);
console.log("[social-accounts] patch concluído");
