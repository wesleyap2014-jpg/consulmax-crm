import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  FileType2,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

type AssetType = "logo" | "font";

type BrandAsset = {
  id: string;
  setting_id: string;
  asset_type: "logo" | "font" | "reference";
  role: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  metadata: Record<string, any>;
  is_primary: boolean;
  active: boolean;
  created_at: string;
};

type Props = {
  settingId: string | null;
  userId: string | null;
};

const BUCKET = "marketing-brand-assets";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const LOGO_ROLES = [
  ["logo_principal", "Logo principal"],
  ["logo_clara_negativa", "Logo clara / negativa"],
  ["logo_horizontal", "Logo horizontal"],
  ["logo_vertical", "Logo vertical"],
  ["simbolo", "Símbolo / ícone"],
  ["variacao", "Outra variação oficial"],
] as const;

const FONT_ROLES = [
  ["fonte_titulo", "Fonte de títulos"],
  ["fonte_corpo", "Fonte de corpo"],
  ["fonte_destaque", "Fonte de destaque"],
  ["familia_tipografica", "Família / peso adicional"],
] as const;

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);
}

function extension(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function validateFile(type: AssetType, file: File) {
  if (file.size > MAX_FILE_BYTES) return "Cada arquivo pode ter no máximo 25 MB.";
  const ext = extension(file.name);
  if (type === "logo" && !["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) {
    return "Logo deve estar em PNG, JPG, WEBP ou SVG.";
  }
  if (type === "font" && !["ttf", "otf", "woff", "woff2"].includes(ext)) {
    return "Fonte deve estar em TTF, OTF, WOFF ou WOFF2.";
  }
  return null;
}

function prettySize(bytes?: number | null) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function roleLabel(asset: BrandAsset) {
  const roles = asset.asset_type === "font" ? FONT_ROLES : LOGO_ROLES;
  return roles.find(([key]) => key === asset.role)?.[1] || asset.role;
}

export default function BrandKitAssets({ settingId, userId }: Props) {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [logoRole, setLogoRole] = useState("logo_principal");
  const [fontRole, setFontRole] = useState("fonte_titulo");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<AssetType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadAssets() {
    if (!settingId) {
      setAssets([]);
      setPreviewUrls({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .from("marketing_brand_assets")
        .select("id,setting_id,asset_type,role,file_path,file_name,mime_type,file_size_bytes,metadata,is_primary,active,created_at")
        .eq("setting_id", settingId)
        .order("asset_type", { ascending: true })
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (loadError) throw loadError;
      const rows = (data || []) as BrandAsset[];
      setAssets(rows);

      const logos = rows.filter((asset) => asset.asset_type === "logo" && asset.active);
      const urls: Record<string, string> = {};
      await Promise.all(
        logos.map(async (asset) => {
          const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(asset.file_path, 60 * 60);
          if (signed?.signedUrl) urls[asset.id] = signed.signedUrl;
        }),
      );
      setPreviewUrls(urls);
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar os ativos oficiais do Brand Kit.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, [settingId]);

  const logos = useMemo(() => assets.filter((asset) => asset.asset_type === "logo"), [assets]);
  const fonts = useMemo(() => assets.filter((asset) => asset.asset_type === "font"), [assets]);

  async function upload(type: AssetType, files: FileList | null) {
    if (!settingId || !userId || !files?.length) return;
    setUploading(type);
    setError(null);
    setNotice(null);
    const uploadedPaths: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const validation = validateFile(type, file);
        if (validation) throw new Error(`${file.name}: ${validation}`);

        const path = `${settingId}/${type}/${Date.now()}-${index}-${safeFileName(file.name)}`;
        const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
          cacheControl: "3600",
        });
        if (storageError) throw storageError;
        uploadedPaths.push(path);

        const role = type === "logo" ? logoRole : fontRole;
        const { error: rowError } = await supabase.from("marketing_brand_assets").insert({
          setting_id: settingId,
          asset_type: type,
          role,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          file_size_bytes: file.size,
          metadata: {
            extension: extension(file.name),
            source: "brand_kit_upload",
          },
          is_primary: type === "logo" ? logos.length === 0 && index === 0 : false,
          active: true,
          created_by: userId,
        });
        if (rowError) throw rowError;
      }

      setNotice(`${files.length} arquivo(s) oficial(is) enviado(s) ao Brand Kit.`);
      await loadAssets();
    } catch (err: any) {
      if (uploadedPaths.length) {
        // Remove somente objetos que não chegaram a ser vinculados no banco em uma falha parcial.
        const { data: linked } = await supabase
          .from("marketing_brand_assets")
          .select("file_path")
          .in("file_path", uploadedPaths);
        const linkedPaths = new Set((linked || []).map((item: any) => item.file_path));
        const orphanPaths = uploadedPaths.filter((path) => !linkedPaths.has(path));
        if (orphanPaths.length) await supabase.storage.from(BUCKET).remove(orphanPaths);
      }
      setError(err?.message || "Erro ao enviar ativo do Brand Kit.");
    } finally {
      setUploading(null);
    }
  }

  async function changeRole(asset: BrandAsset, role: string) {
    setError(null);
    const { error: updateError } = await supabase
      .from("marketing_brand_assets")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", asset.id);
    if (updateError) return setError(updateError.message);
    await loadAssets();
  }

  async function markPrimary(asset: BrandAsset) {
    if (!settingId || asset.asset_type !== "logo") return;
    setError(null);
    const { error: clearError } = await supabase
      .from("marketing_brand_assets")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("setting_id", settingId)
      .eq("asset_type", "logo");
    if (clearError) return setError(clearError.message);
    const { error: primaryError } = await supabase
      .from("marketing_brand_assets")
      .update({ is_primary: true, active: true, updated_at: new Date().toISOString() })
      .eq("id", asset.id);
    if (primaryError) return setError(primaryError.message);
    setNotice(`${asset.file_name} definida como logo principal.`);
    await loadAssets();
  }

  async function toggleAsset(asset: BrandAsset) {
    setError(null);
    if (asset.is_primary && asset.active) {
      return setError("Defina outra logo como principal antes de desativar a logo principal atual.");
    }
    const { error: updateError } = await supabase
      .from("marketing_brand_assets")
      .update({ active: !asset.active, updated_at: new Date().toISOString() })
      .eq("id", asset.id);
    if (updateError) return setError(updateError.message);
    await loadAssets();
  }

  async function removeAsset(asset: BrandAsset) {
    if (!window.confirm(`Excluir o arquivo oficial “${asset.file_name}” do Brand Kit?`)) return;
    setError(null);
    setNotice(null);
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([asset.file_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from("marketing_brand_assets").delete().eq("id", asset.id);
      if (rowError) throw rowError;
      setNotice(`${asset.file_name} removido do Brand Kit.`);
      await loadAssets();
    } catch (err: any) {
      setError(err?.message || "Não foi possível excluir o ativo.");
    }
  }

  if (!settingId) {
    return (
      <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-[#E0CE8C]/5 p-4 text-sm text-[#1E293F]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#A11C27]" />
          <div>
            <p className="font-semibold">Ativos oficiais da marca</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Salve esta configuração ou clique em Editar em um Brand Kit existente para liberar o upload privado de logos e fontes oficiais.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[#B5A573]/30 bg-white p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#A11C27]" />
        <div>
          <p className="font-semibold text-[#1E293F]">Arquivos oficiais do Brand Kit</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            O Max deve tratar estes arquivos como fonte de verdade. Logos não devem ser redesenhadas por IA e fontes cadastradas não devem ser substituídas por “parecidas”. Use somente arquivos que você tenha autorização ou licença para utilizar.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-[#A11C27]/25 bg-[#A11C27]/5 px-3 py-2 text-xs text-[#A11C27]">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[#A11C27]" />
            <p className="text-sm font-semibold text-[#1E293F]">Logos oficiais</p>
          </div>
          <select className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-xs" value={logoRole} onChange={(event) => setLogoRole(event.target.value)}>
            {LOGO_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="mt-2 flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent">
            {uploading === "logo" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Enviar logo(s)
            <input className="hidden" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" disabled={Boolean(uploading)} onChange={(event) => { upload("logo", event.target.files); event.currentTarget.value = ""; }} />
          </label>
          <p className="mt-2 text-[11px] text-slate-400">PNG, JPG, WEBP ou SVG · até 25 MB por arquivo.</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <FileType2 className="h-4 w-4 text-[#A11C27]" />
            <p className="text-sm font-semibold text-[#1E293F]">Fontes oficiais</p>
          </div>
          <select className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-xs" value={fontRole} onChange={(event) => setFontRole(event.target.value)}>
            {FONT_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="mt-2 flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent">
            {uploading === "font" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Enviar fonte(s)
            <input className="hidden" type="file" multiple accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" disabled={Boolean(uploading)} onChange={(event) => { upload("font", event.target.files); event.currentTarget.value = ""; }} />
          </label>
          <p className="mt-2 text-[11px] text-slate-400">TTF, OTF, WOFF ou WOFF2 · envie os pesos oficiais disponíveis.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando arquivos…</div>
      ) : null}

      {logos.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Logos cadastradas</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {logos.map((asset) => (
              <div key={asset.id} className={`rounded-xl border p-3 ${asset.active ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
                <div className="flex gap-3">
                  <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:12px_12px]">
                    {previewUrls[asset.id] ? <img src={previewUrls[asset.id]} alt={asset.file_name} className="max-h-14 max-w-[72px] object-contain" /> : <ImageIcon className="h-5 w-5 text-slate-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-xs font-medium text-[#1E293F]" title={asset.file_name}>{asset.file_name}</p>
                      {asset.is_primary ? <Star className="h-4 w-4 shrink-0 fill-[#B5A573] text-[#B5A573]" /> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{prettySize(asset.file_size_bytes)}</p>
                    <select className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]" value={asset.role} onChange={(event) => changeRole(asset, event.target.value)}>
                      {LOGO_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!asset.is_primary ? <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => markPrimary(asset)}><Star className="mr-1 h-3 w-3" />Principal</Button> : null}
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => toggleAsset(asset)}>{asset.active ? "Desativar" : "Ativar"}</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-[#A11C27]" onClick={() => removeAsset(asset)}><Trash2 className="mr-1 h-3 w-3" />Excluir</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {fonts.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fontes cadastradas</p>
          <div className="space-y-2">
            {fonts.map((asset) => (
              <div key={asset.id} className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${asset.active ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"}`}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {asset.active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <FileType2 className="h-4 w-4 shrink-0 text-slate-400" />}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[#1E293F]" title={asset.file_name}>{asset.file_name}</p>
                    <p className="text-[11px] text-slate-400">{roleLabel(asset)}{asset.file_size_bytes ? ` · ${prettySize(asset.file_size_bytes)}` : ""}</p>
                  </div>
                </div>
                <select className="h-8 rounded-md border border-input bg-background px-2 text-[11px]" value={asset.role} onChange={(event) => changeRole(asset, event.target.value)}>
                  {FONT_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => toggleAsset(asset)}>{asset.active ? "Desativar" : "Ativar"}</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-[#A11C27]" onClick={() => removeAsset(asset)}><Trash2 className="mr-1 h-3 w-3" />Excluir</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && !logos.length && !fonts.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-500">
          Nenhum arquivo oficial cadastrado ainda. Envie primeiro a logo principal e depois as demais variações e fontes.
        </div>
      ) : null}
    </div>
  );
}
