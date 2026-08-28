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
  "função conectar",
  `  const pendingApprovals = variants.filter((item) => item.status === "aprovacao");`,
  `  async function connectSocialProvider(provider: string, label: string) {\n    setSaving(true);\n    setError(null);\n    setNotice(null);\n    try {\n      const { data } = await supabase.auth.getSession();\n      const token = data.session?.access_token;\n      if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");\n      const response = await fetch("/api/marketing/social-connect", {\n        method: "POST",\n        headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },\n        body: JSON.stringify({ provider }),\n      });\n      const result = await response.json();\n      if (!response.ok || !result?.ok) {\n        const missing = Array.isArray(result?.missing) && result.missing.length ? \` Configuração pendente: \${result.missing.join(", ")}.\` : "";\n        throw new Error(\`\${result?.message || \`Não foi possível conectar \${label}.\`}\${missing}\`);\n      }\n      if (result.connected) {\n        setNotice(\`\${label} conectado e validado.\`);\n        await loadAll();\n        setActiveTab("config");\n        return;\n      }\n      if (result.auth_url) {\n        window.location.assign(result.auth_url);\n        return;\n      }\n      throw new Error(\`\${label}: a rede não retornou uma URL de autorização.\`);\n    } catch (err: any) {\n      setError(err?.message || \`Erro ao conectar \${label}.\`);\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  const pendingApprovals = variants.filter((item) => item.status === "aprovacao");`,
);

replaceOnce(
  "botão OAuth",
  `<Button variant="outline" className="mt-3 w-full" onClick={() => setNotice(\`\${provider.label}: estrutura OAuth preparada no banco. A ativação exige cadastrar o app oficial e suas credenciais no backend.\`)}>+ Conectar conta</Button>`,
  `<Button variant="outline" className="mt-3 w-full" disabled={saving} onClick={() => connectSocialProvider(provider.key, provider.label)}>{providerAccounts.length ? "+ Adicionar outra conta" : "+ Conectar conta"}</Button>`,
);

if (changed) fs.writeFileSync(file, src);
console.log("[social-accounts] patch concluído");
