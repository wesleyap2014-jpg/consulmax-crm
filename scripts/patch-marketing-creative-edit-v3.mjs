import fs from "node:fs";

const path = "src/pages/MarketingCreativeLibraryV2.tsx";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(anchor, replacement, label) {
  if (!text.includes(anchor)) throw new Error(`[creative-edit-v3] ${label} anchor not found`);
  text = text.replace(anchor, replacement);
}

if (!text.includes("  Pencil,")) {
  replaceOnce("  Plus,\n  Search,", "  Pencil,\n  Plus,\n  Search,", "Pencil import");
}

if (!text.includes("const [editing, setEditing]")) {
  replaceOnce(
    '  const [detail, setDetail] = useState<Creative | null>(null);',
    '  const [detail, setDetail] = useState<Creative | null>(null);\n  const [editing, setEditing] = useState<Creative | null>(null);',
    "editing state",
  );
}

const flashAnchor = `  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }
`;

if (!text.includes("function openEditCreative")) {
  replaceOnce(flashAnchor, `${flashAnchor}
  function openNewCreative() {
    setEditing(null);
    setSelectedFiles([]);
    setError(null);
    setForm({
      title: "",
      description: "",
      campaign_id: "",
      segment: "Institucional",
      channels: ["Instagram"],
      format: "Feed",
      caption: "",
      usage_instructions: "",
      external_url: "",
      visibility: "todos",
      status: "publicado",
      valid_until: "",
    });
    setPublishOpen(true);
  }

  function openEditCreative(creative: Creative) {
    const list = assetsByCreative[creative.id] || [];
    const normalized = normalizeFormat(creative.format);
    const format = FORMAT_CONFIG[normalized] ? normalized : "Feed";
    const channels = creative.channels?.length ? creative.channels : creative.channel ? [creative.channel] : ["Instagram"];
    const external = creative.external_url || list.find((asset) => asset.external_url)?.external_url || "";
    setEditing(creative);
    setDetail(null);
    setSelectedFiles([]);
    setError(null);
    setForm({
      title: creative.title || "",
      description: creative.description || "",
      campaign_id: creative.campaign_id || "",
      segment: creative.segment || "Institucional",
      channels,
      format,
      caption: creative.caption || "",
      usage_instructions: creative.usage_instructions || "",
      external_url: external,
      visibility: creative.visibility || "todos",
      status: creative.status || "publicado",
      valid_until: creative.valid_until || "",
    });
    setPublishOpen(true);
  }
`, "open edit helpers");
}

const publishStart = text.indexOf("  async function publishCreative() {");
const publishEnd = text.indexOf("\n  async function updateStatus", publishStart);
if (publishStart < 0 || publishEnd < 0) throw new Error("[creative-edit-v3] publish function boundaries not found");

const saveFunction = `  async function saveCreative() {
    if (!form.title.trim()) return setError("Informe o título do criativo.");
    if (!form.channels.length) return setError("Selecione pelo menos um canal.");

    const existingList = editing ? (assetsByCreative[editing.id] || []) : [];
    const formatChanged = Boolean(editing && normalizeFormat(editing.format) !== form.format);
    const isMulti = config.max > 1;
    const replacementWithFiles = selectedFiles.length > 0;
    const currentExternal = editing
      ? (editing.external_url || existingList.find((asset) => asset.external_url)?.external_url || "")
      : "";
    const externalChanged = config.max === 1 && form.external_url.trim() !== currentExternal;
    const replacementWithExternal = config.max === 1 && Boolean(form.external_url.trim()) && (externalChanged || formatChanged || !existingList.length);
    const replacingAssets = replacementWithFiles || replacementWithExternal || (formatChanged && Boolean(form.external_url.trim()));

    if (!editing) {
      if (isMulti && selectedFiles.length < config.min) return setError(`Selecione pelo menos ${config.min} arquivos para ${config.label}.`);
      if (!isMulti && !selectedFiles.length && !form.external_url.trim()) return setError("Envie o arquivo do criativo ou informe um link externo.");
    } else {
      if (formatChanged && !replacementWithFiles && !form.external_url.trim()) {
        return setError("Ao alterar o formato, envie os novos arquivos compatíveis com o formato escolhido.");
      }
      if (!replacementWithFiles && !form.external_url.trim() && !existingList.length) {
        return setError("Este criativo não possui arquivo. Envie um novo arquivo ou informe um link externo.");
      }
      if (isMulti && replacementWithFiles && selectedFiles.length < config.min) {
        return setError(`Selecione pelo menos ${config.min} arquivos para ${config.label}.`);
      }
    }

    setSaving(true);
    setError(null);
    const uploaded: string[] = [];
    let createdId: string | null = null;
    let insertedAssetIds: string[] = [];

    try {
      const batch = crypto.randomUUID();
      const uploadedMetas: Array<FileMeta & { path: string }> = [];

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const item = selectedFiles[index];
        const name = safeFileName(item.file.name);
        const path = `library/${new Date().getFullYear()}/${batch}/${String(index + 1).padStart(2, "0")}-${name}`;
        const { error: uploadError } = await supabase.storage.from("marketing-creatives").upload(path, item.file, {
          upsert: false,
          contentType: item.file.type || undefined,
        });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        uploadedMetas.push({ ...item, path });
      }

      if (!editing) {
        const first = uploadedMetas[0];
        const { data: created, error: insertError } = await supabase.from("marketing_creatives").insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          campaign_id: form.campaign_id || null,
          segment: form.segment,
          channels: form.channels,
          channel: form.channels[0] || null,
          format: form.format,
          caption: form.caption.trim() || null,
          usage_instructions: form.usage_instructions.trim() || null,
          file_path: first?.path || null,
          external_url: !first ? form.external_url.trim() || null : null,
          mime_type: first?.file.type || null,
          visibility: form.visibility,
          status: form.status,
          valid_until: form.valid_until || null,
          published_at: form.status === "publicado" ? new Date().toISOString() : null,
          created_by: userId,
        }).select("*").single();
        if (insertError || !created) throw insertError || new Error("Não foi possível criar o criativo.");
        createdId = created.id;

        const assetRows = uploadedMetas.length
          ? uploadedMetas.map((item, index) => ({
              creative_id: created.id,
              position: index,
              file_path: item.path,
              mime_type: item.file.type || null,
              file_name: item.file.name,
              width: item.width,
              height: item.height,
              duration_seconds: item.duration,
            }))
          : [{
              creative_id: created.id,
              position: 0,
              external_url: form.external_url.trim(),
              mime_type: null,
              file_name: null,
              width: null,
              height: null,
              duration_seconds: null,
            }];

        const { error: assetError } = await supabase.from("marketing_creative_assets").insert(assetRows);
        if (assetError) throw assetError;
        flash("Criativo publicado na biblioteca.");
      } else {
        const oldFiles = existingList.map((asset) => asset.file_path).filter(Boolean) as string[];
        let newAssetRows: any[] = [];

        if (replacingAssets) {
          newAssetRows = uploadedMetas.length
            ? uploadedMetas.map((item, index) => ({
                creative_id: editing.id,
                position: 1000 + index,
                file_path: item.path,
                external_url: null,
                mime_type: item.file.type || null,
                file_name: item.file.name,
                width: item.width,
                height: item.height,
                duration_seconds: item.duration,
              }))
            : [{
                creative_id: editing.id,
                position: 1000,
                file_path: null,
                external_url: form.external_url.trim(),
                mime_type: null,
                file_name: null,
                width: null,
                height: null,
                duration_seconds: null,
              }];

          const { data: insertedAssets, error: insertAssetError } = await supabase
            .from("marketing_creative_assets")
            .insert(newAssetRows)
            .select("id,position");
          if (insertAssetError) throw insertAssetError;
          insertedAssetIds = (insertedAssets || []).map((asset) => asset.id);
        }

        const firstReplacement = uploadedMetas[0];
        const updatePayload: any = {
          title: form.title.trim(),
          description: form.description.trim() || null,
          campaign_id: form.campaign_id || null,
          segment: form.segment,
          channels: form.channels,
          channel: form.channels[0] || null,
          format: form.format,
          caption: form.caption.trim() || null,
          usage_instructions: form.usage_instructions.trim() || null,
          visibility: form.visibility,
          status: form.status,
          valid_until: form.valid_until || null,
          published_at: form.status === "publicado" ? new Date().toISOString() : null,
        };

        if (replacingAssets) {
          updatePayload.file_path = firstReplacement?.path || null;
          updatePayload.external_url = firstReplacement ? null : form.external_url.trim() || null;
          updatePayload.mime_type = firstReplacement?.file.type || null;
        }

        const { error: updateError } = await supabase
          .from("marketing_creatives")
          .update(updatePayload)
          .eq("id", editing.id);
        if (updateError) throw updateError;

        if (replacingAssets) {
          const oldIds = existingList.map((asset) => asset.id);
          if (oldIds.length) {
            const { error: deleteOldError } = await supabase.from("marketing_creative_assets").delete().in("id", oldIds);
            if (deleteOldError) throw deleteOldError;
          }

          for (let index = 0; index < insertedAssetIds.length; index += 1) {
            const { error: positionError } = await supabase
              .from("marketing_creative_assets")
              .update({ position: index })
              .eq("id", insertedAssetIds[index]);
            if (positionError) throw positionError;
          }

          if (oldFiles.length) await supabase.storage.from("marketing-creatives").remove(oldFiles);
        }

        flash("Criativo atualizado com sucesso.");
      }

      setPublishOpen(false);
      setEditing(null);
      setSelectedFiles([]);
      setForm({
        title: "",
        description: "",
        campaign_id: "",
        segment: "Institucional",
        channels: ["Instagram"],
        format: "Feed",
        caption: "",
        usage_instructions: "",
        external_url: "",
        visibility: "todos",
        status: "publicado",
        valid_until: "",
      });
      await load();
      onChanged?.();
    } catch (saveError: any) {
      if (createdId) await supabase.from("marketing_creatives").delete().eq("id", createdId);
      if (editing && insertedAssetIds.length) await supabase.from("marketing_creative_assets").delete().in("id", insertedAssetIds);
      if (uploaded.length) await supabase.storage.from("marketing-creatives").remove(uploaded);
      setError(saveError?.message || (editing ? "Não foi possível atualizar o criativo." : "Não foi possível publicar o criativo."));
    } finally {
      setSaving(false);
    }
  }
`;

text = text.slice(0, publishStart) + saveFunction + text.slice(publishEnd);

replaceOnce(
  '{canManage && <Button onClick={() => { setError(null); setPublishOpen(true); }}><Upload className="mr-2 h-4 w-4" />Publicar criativo</Button>}',
  '{canManage && <Button onClick={openNewCreative}><Upload className="mr-2 h-4 w-4" />Publicar criativo</Button>}',
  "toolbar publish button",
);

replaceOnce(
  '{canManage && <Button className="mt-5" onClick={() => setPublishOpen(true)}><Plus className="mr-2 h-4 w-4" />Publicar criativo</Button>}',
  '{canManage && <Button className="mt-5" onClick={openNewCreative}><Plus className="mr-2 h-4 w-4" />Publicar criativo</Button>}',
  "empty publish button",
);

const deleteButton = '{canManage && <Button size="icon" variant="ghost" onClick={() => void removeCreative(creative)} title="Excluir"><Trash2 className="h-4 w-4 text-red-600" /></Button>}'
if (!text.includes('title="Editar"')) {
  replaceOnce(
    deleteButton,
    '{canManage && <Button size="icon" variant="outline" onClick={() => openEditCreative(creative)} title="Editar"><Pencil className="h-4 w-4" /></Button>}' + deleteButton,
    "card edit button",
  );
}

replaceOnce(
  '<Dialog open={publishOpen} onOpenChange={(open) => { setPublishOpen(open); if (!open) { setSelectedFiles([]); setError(null); } }}>',
  '<Dialog open={publishOpen} onOpenChange={(open) => { setPublishOpen(open); if (!open) { setEditing(null); setSelectedFiles([]); setError(null); } }}>',
  "dialog reset",
);

replaceOnce(
  '<DialogHeader><DialogTitle>Publicar criativo</DialogTitle></DialogHeader>',
  '<DialogHeader><DialogTitle>{editing ? "Editar criativo" : "Publicar criativo"}</DialogTitle></DialogHeader>',
  "dialog title",
);

replaceOnce(
  '<Field label={config.max > 1 ? `Arquivos do ${config.label}` : "Arquivo"}>',
  '<Field label={editing ? (config.max > 1 ? `Substituir arquivos do ${config.label}` : "Substituir arquivo") : (config.max > 1 ? `Arquivos do ${config.label}` : "Arquivo")}>',
  "file label",
);

const selectedFilesBlock = '{selectedFiles.length > 0 && <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{selectedFiles.length} arquivo{selectedFiles.length === 1 ? "" : "s"} validado{selectedFiles.length === 1 ? "" : "s"}: {selectedFiles.map((item) => item.file.name).join(" • ")}</div>}'
if (!text.includes("Arquivos atuais")) {
  replaceOnce(
    selectedFilesBlock,
    `${selectedFilesBlock}\n              {editing && selectedFiles.length === 0 && (assetsByCreative[editing.id] || []).length > 0 && <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800"><strong>Arquivos atuais:</strong> {(assetsByCreative[editing.id] || []).map((asset, index) => asset.file_name || \\`Arquivo \\${index + 1}\\`).join(" • ")}<br /><span className="text-blue-600">Se não selecionar novos arquivos, os atuais serão mantidos.</span></div>}`,
    "current files note",
  );
}

const oldFooter = '<DialogFooter><Button variant="outline" onClick={() => setPublishOpen(false)}>Cancelar</Button><Button onClick={() => void publishCreative()} disabled={saving || !form.title.trim() || !form.channels.length || (config.max > 1 ? selectedFiles.length < config.min : !selectedFiles.length && !form.external_url.trim())}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Publicar</Button></DialogFooter>';
const newFooter = '<DialogFooter><Button variant="outline" onClick={() => setPublishOpen(false)}>Cancelar</Button><Button onClick={() => void saveCreative()} disabled={saving || !form.title.trim() || !form.channels.length || (!editing && (config.max > 1 ? selectedFiles.length < config.min : !selectedFiles.length && !form.external_url.trim()))}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editing ? <Check className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}{editing ? "Salvar alterações" : "Publicar"}</Button></DialogFooter>';
replaceOnce(oldFooter, newFooter, "dialog footer");

if (!text.includes('openEditCreative(detail)')) {
  replaceOnce(
    '<DialogFooter className="mt-4">{list.length > 1 && <Button onClick={() => void downloadPackage(detail)} disabled={zipping}>{zipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Baixar pacote completo</Button>}<Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button></DialogFooter>',
    '<DialogFooter className="mt-4">{canManage && <Button variant="outline" onClick={() => openEditCreative(detail)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>}{list.length > 1 && <Button onClick={() => void downloadPackage(detail)} disabled={zipping}>{zipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Baixar pacote completo</Button>}<Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button></DialogFooter>',
    "detail edit button",
  );
}

fs.writeFileSync(path, text, "utf8");
console.log("Creative library edit v3 patch applied");
