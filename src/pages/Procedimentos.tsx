// src/pages/Procedimentos.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

import {
  Search,
  Plus,
  Pencil,
  Save,
  X,
  CheckCircle2,
  MessageCircle,
  Paperclip,
  RefreshCcw,
  ShieldCheck,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Type,
  Image as ImageIcon,
  BorderAll,
} from "lucide-react";

type UserRow = {
  id: string;
  auth_user_id: string | null;
  nome?: string | null;
  role?: any; // enum legado
  user_role?: string | null; // texto legado
  is_active?: boolean | null;
};

type KBStatus = "draft" | "review" | "active";

type KBProcedure = {
  id: string;
  title: string;
  summary: string;
  trigger: string | null;
  steps_md: string | null; // vamos armazenar HTML aqui (sem mudar DB)
  tags: string[]; // text[]
  admin_id: string | null;
  area: string | null;
  channel: string | null;
  sla_text: string | null;
  flags: any; // jsonb
  status: KBStatus;

  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type KBRole = {
  id: string;
  procedure_id: string;
  role_key: string;
  role_label: string;
  notes: string | null;
  sort_order: number;
};

type KBDoc = {
  id: string;
  procedure_id: string;
  role_key: string;
  doc_name: string;
  required: boolean;
  format_hint: string | null;
  validity_hint: string | null;
  notes: string | null;
  sort_order: number;
};

type KBAsset = {
  id: string;
  procedure_id: string;
  kind: "template" | "print" | "manual" | "video" | "other";
  title: string;
  file_path: string;
  mime: string | null;
  uploaded_by: string | null;
  created_at: string;
};

type KBSuggestion = {
  id: string;
  procedure_id: string;
  suggestion: string;
  status: "open" | "accepted" | "rejected";
  created_by: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
};

function isOpsOrAdmin(roleText?: string | null) {
  const r = (roleText || "").toLowerCase();
  return r === "admin" || r === "operacoes";
}
function isAdmin(roleText?: string | null) {
  return (roleText || "").toLowerCase() === "admin";
}

function humanDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function splitTags(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

/**
 * Sanitização simples (front-only) para evitar tags/script óbvias.
 * (Se quiser nível enterprise, depois podemos usar uma lib tipo DOMPurify.)
 */
function sanitizeHtmlBasic(html: string) {
  let out = html || "";
  // remove scripts
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  // remove iframes
  out = out.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "");
  // remove on* handlers
  out = out.replace(/\son\w+="[^"]*"/gi, "");
  out = out.replace(/\son\w+='[^']*'/gi, "");
  return out;
}

function looksLikeHtml(s?: string | null) {
  const t = (s || "").trim();
  if (!t) return false;
  return /<\/?[a-z][\s\S]*>/i.test(t);
}

function RichView({ htmlOrText }: { htmlOrText?: string | null }) {
  const t = (htmlOrText || "").trim();
  if (!t) return <div className="text-sm text-muted-foreground">—</div>;

  if (looksLikeHtml(t)) {
    const safe = sanitizeHtmlBasic(t);
    return (
      <div
        className="prose prose-sm max-w-none prose-p:my-2 prose-li:my-1"
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }

  // fallback: texto simples (mantém quebras)
  const lines = t.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((ln, idx) => {
        const line = ln.trim();
        if (!line) return <div key={idx} className="h-2" />;
        const isNum = /^\d+\)\s+/.test(line);
        return (
          <div key={idx} className={isNum ? "pl-2" : ""}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

type RichEditorValue = {
  html: string;
  selectedImage?: HTMLImageElement | null;
};

function allowedAttachment(file: File) {
  const name = (file.name || "").toLowerCase();
  const okExt = name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx");
  const okMime =
    file.type === "application/pdf" ||
    file.type === "application/msword" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "" || // alguns browsers/OS mandam vazio
    file.type === "application/octet-stream";
  return okExt && okMime;
}

function RichEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
  disabled,
}: {
  value: string;
  onChange: (v: RichEditorValue) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(0);
  const [imgBorder, setImgBorder] = useState(false);
  const [imgAlign, setImgAlign] = useState<"left" | "center" | "right">("center");

  // manter HTML sincronizado quando value mudar externamente
  useEffect(() => {
    if (!ref.current) return;
    const current = ref.current.innerHTML || "";
    if (current !== (value || "")) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function exec(cmd: string, arg?: string) {
    if (disabled) return;
    try {
      document.execCommand(cmd, false, arg);
      emit();
    } catch {
      // noop
    }
  }

  function emit() {
    const html = ref.current?.innerHTML || "";
    onChange({ html, selectedImage: selectedImg });
  }

  function insertHtml(html: string) {
    if (disabled) return;
    exec("insertHTML", html);
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items || !items.length) return;

    for (const it of Array.from(items)) {
      if (it.type?.startsWith("image/")) {
        e.preventDefault();
        const file = it.getAsFile();
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
          const src = String(reader.result || "");
          // imagem padrão com estilo ajustável
          insertHtml(
            `<div style="text-align:center;"><img src="${src}" style="max-width:100%;height:auto;border-radius:12px;display:inline-block;" /></div><p><br/></p>`
          );
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }

  function handleClick(e: React.MouseEvent) {
    const target = e.target as any;
    if (target && target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      setSelectedImg(img);

      // width atual (em px ou %)
      const wStyle = img.style.width || "";
      let px = 0;
      if (wStyle.endsWith("px")) px = parseInt(wStyle, 10) || 0;
      else px = img.getBoundingClientRect().width || 0;
      setImgWidth(Math.round(px));

      const b = img.style.border && img.style.border !== "none";
      setImgBorder(!!b);

      // alinhamento
      const parent = img.parentElement;
      const ta = (parent?.style?.textAlign || "").toLowerCase();
      if (ta === "left" || ta === "right" || ta === "center") setImgAlign(ta as any);
      else setImgAlign("center");

      return;
    }
    setSelectedImg(null);
  }

  function applyImageWidth(px: number) {
    if (!selectedImg) return;
    selectedImg.style.width = `${Math.max(80, Math.min(px, 1200))}px`;
    selectedImg.style.height = "auto";
    emit();
  }

  function toggleImageBorder() {
    if (!selectedImg) return;
    const next = !imgBorder;
    setImgBorder(next);
    selectedImg.style.border = next ? "2px solid rgba(161,28,39,0.35)" : "none";
    selectedImg.style.padding = next ? "2px" : "0px";
    selectedImg.style.borderRadius = "12px";
    emit();
  }

  function setImageAlign(align: "left" | "center" | "right") {
    if (!selectedImg) return;
    setImgAlign(align);
    const parent = selectedImg.parentElement;
    if (parent) parent.style.textAlign = align;
    emit();
  }

  function insertImageFromFile(file: File) {
    if (disabled) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      insertHtml(
        `<div style="text-align:center;"><img src="${src}" style="max-width:100%;height:auto;border-radius:12px;display:inline-block;" /></div><p><br/></p>`
      );
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-slate-50">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          onClick={() => exec("bold")}
          disabled={disabled}
          title="Negrito"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          onClick={() => exec("italic")}
          disabled={disabled}
          title="Itálico"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          onClick={() => exec("underline")}
          disabled={disabled}
          title="Sublinhado"
        >
          <Underline className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-slate-200 mx-1" />

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          onClick={() => exec("justifyLeft")}
          disabled={disabled}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          onClick={() => exec("justifyCenter")}
          disabled={disabled}
          title="Centralizar"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          onClick={() => exec("justifyRight")}
          disabled={disabled}
          title="Alinhar à direita"
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-slate-200 mx-1" />

        {/* Font size (execCommand usa 1-7; mapeamos para tamanhos comuns) */}
        <div className="flex items-center gap-1">
          <Type className="h-4 w-4 text-slate-600" />
          <select
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
            disabled={disabled}
            defaultValue="3"
            onChange={(e) => exec("fontSize", e.target.value)}
            title="Tamanho da fonte"
          >
            <option value="2">Pequena</option>
            <option value="3">Normal</option>
            <option value="4">Média</option>
            <option value="5">Grande</option>
            <option value="6">Extra</option>
          </select>
        </div>

        <div className="w-px h-6 bg-slate-200 mx-1" />

        {/* Text color */}
        <label className="flex items-center gap-1 h-8 px-2 rounded-md border border-slate-200 bg-white cursor-pointer">
          <span className="text-xs text-slate-600">Cor</span>
          <input
            type="color"
            disabled={disabled}
            onChange={(e) => exec("foreColor", e.target.value)}
            title="Cor do texto"
          />
        </label>

        {/* Highlight */}
        <label className="flex items-center gap-1 h-8 px-2 rounded-md border border-slate-200 bg-white cursor-pointer">
          <Highlighter className="h-4 w-4 text-slate-600" />
          <input
            type="color"
            disabled={disabled}
            onChange={(e) => exec("hiliteColor", e.target.value)}
            title="Realce"
          />
        </label>

        <div className="w-px h-6 bg-slate-200 mx-1" />

        {/* Insert image button */}
        <label className="inline-flex items-center gap-2 h-8 px-2 rounded-md border border-slate-200 bg-white cursor-pointer">
          <ImageIcon className="h-4 w-4 text-slate-700" />
          <span className="text-xs text-slate-700">Inserir imagem</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              insertImageFromFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>

        <div className="ml-auto text-[11px] text-muted-foreground">
          Dica: cole imagem com <b>Ctrl + V</b>
        </div>
      </div>

      {/* Selected image controls */}
      {selectedImg && (
        <div className="p-2 border-b bg-white">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-slate-700 font-medium">Imagem selecionada</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Largura:</span>
              <Input
                type="number"
                className="h-8 w-[110px]"
                value={imgWidth || 0}
                onChange={(e) => {
                  const v = parseInt(e.target.value || "0", 10) || 0;
                  setImgWidth(v);
                  applyImageWidth(v);
                }}
                min={80}
                max={1200}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground">px</span>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-2"
              onClick={toggleImageBorder}
              disabled={disabled}
              title="Borda"
            >
              <BorderAll className="h-4 w-4" />
              {imgBorder ? "Remover borda" : "Borda"}
            </Button>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={imgAlign === "left" ? "default" : "outline"}
                className="h-8 px-2"
                onClick={() => setImageAlign("left")}
                disabled={disabled}
                title="Alinhar esquerda"
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={imgAlign === "center" ? "default" : "outline"}
                className="h-8 px-2"
                onClick={() => setImageAlign("center")}
                disabled={disabled}
                title="Centralizar"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={imgAlign === "right" ? "default" : "outline"}
                className="h-8 px-2"
                onClick={() => setImageAlign("right")}
                disabled={disabled}
                title="Alinhar direita"
              >
                <AlignRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setSelectedImg(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Editable area */}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={[
          "p-3 outline-none",
          "text-sm leading-relaxed",
          "prose prose-sm max-w-none",
          disabled ? "bg-slate-50 text-muted-foreground" : "bg-white",
        ].join(" ")}
        style={{ minHeight }}
        onInput={() => emit()}
        onPaste={handlePaste}
        onClick={handleClick}
        data-placeholder={placeholder || ""}
      />

      <style>
        {`
          [contenteditable][data-placeholder]:empty:before {
            content: attr(data-placeholder);
            color: #94a3b8;
          }
          .prose img {
            max-width: 100%;
            height: auto;
          }
        `}
      </style>
    </div>
  );
}

export default function Procedimentos() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [me, setMe] = useState<UserRow | null>(null);
  const myRoleText = useMemo(
    () =>
      (me?.user_role ||
        (me?.role as any)?.toString?.() ||
        (me?.role as any) ||
        "") as string,
    [me]
  );
  const canEdit = useMemo(() => isOpsOrAdmin(myRoleText), [myRoleText]);
  const canApprove = useMemo(() => isAdmin(myRoleText), [myRoleText]);

  const [procedures, setProcedures] = useState<KBProcedure[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [fArea, setFArea] = useState<string>("__all__");
  const [fChannel, setFChannel] = useState<string>("__all__");
  const [fStatus, setFStatus] = useState<string>("__all__");

  // detalhe
  const active = useMemo(
    () => procedures.find((p) => p.id === activeId) || null,
    [procedures, activeId]
  );

  const [roles, setRoles] = useState<KBRole[]>([]);
  const [docs, setDocs] = useState<KBDoc[]>([]);
  const [assets, setAssets] = useState<KBAsset[]>([]);
  const [suggestions, setSuggestions] = useState<KBSuggestion[]>([]);

  // editor
  const [editing, setEditing] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const [draft, setDraft] = useState<
    Partial<KBProcedure> & {
      tagsText?: string;
      stepsHtml?: string; // editor rico (salvo em steps_md)
      docsHtml?: string; // editor rico (salvo em flags.docs_html)
    }
  >({});

  // sugestão
  const [newSuggestion, setNewSuggestion] = useState("");

  // helper para pegar docs html do active.flags
  const activeDocsHtml = useMemo(() => {
    const f = (active?.flags || {}) as any;
    return (f?.docs_html as string) || "";
  }, [active]);

  async function loadMe() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setMe(null);
      return;
    }
    const { data } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("auth_user_id", uid)
      .maybeSingle();
    setMe((data as any) || null);
  }

  async function loadProcedures() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("kb_procedures")
        .select(
          "id,title,summary,trigger,steps_md,tags,admin_id,area,channel,sla_text,flags,status,approved_by,approved_at,created_at,updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      const rows = (data || []) as KBProcedure[];
      setProcedures(rows);

      // seleciona o primeiro se ainda não tiver
      if (!activeId && rows.length) setActiveId(rows[0].id);
      // se o ativo sumiu, troca
      if (activeId && !rows.some((r) => r.id === activeId)) setActiveId(rows[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(procedureId: string) {
    const [r1, r2, r4, r5] = await Promise.all([
      supabase
        .from("kb_roles")
        .select("*")
        .eq("procedure_id", procedureId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("kb_documents")
        .select("*")
        .eq("procedure_id", procedureId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("kb_assets")
        .select("*")
        .eq("procedure_id", procedureId)
        .order("created_at", { ascending: false }),
      supabase
        .from("kb_suggestions")
        .select("*")
        .eq("procedure_id", procedureId)
        .order("created_at", { ascending: false }),
    ]);

    setRoles((r1.data as any) || []);
    setDocs((r2.data as any) || []);
    setAssets((r4.data as any) || []);
    setSuggestions((r5.data as any) || []);
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      await loadProcedures();
      if (activeId) await loadDetails(activeId);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadMe();
      await loadProcedures();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadDetails(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    if (editing) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [editing]);

  const areas = useMemo(() => {
    const s = new Set<string>();
    procedures.forEach((p) => p.area && s.add(p.area));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [procedures]);

  const channels = useMemo(() => {
    const s = new Set<string>();
    procedures.forEach((p) => p.channel && s.add(p.channel));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [procedures]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return procedures.filter((p) => {
      if (fArea !== "__all__" && (p.area || "") !== fArea) return false;
      if (fChannel !== "__all__" && (p.channel || "") !== fChannel) return false;
      if (fStatus !== "__all__" && p.status !== fStatus) return false;

      if (!qq) return true;

      const hay = [
        p.title,
        p.summary,
        p.trigger || "",
        (p.tags || []).join(" "),
        p.area || "",
        p.channel || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [procedures, q, fArea, fChannel, fStatus]);

  function beginEdit(mode: "new" | "edit") {
    if (!canEdit) return;
    setEditing(true);

    if (mode === "new") {
      setDraft({
        title: "",
        summary: "",
        trigger: "",
        stepsHtml:
          "<p><b>1)</b> </p><p><b>2)</b> </p><p><b>3)</b> </p>",
        docsHtml: "<p>• Documento 1</p><p>• Documento 2</p>",
        tagsText: "procedimento, operações",
        area: "Operações",
        channel: "Ticket",
        sla_text: "",
        flags: { uses_ticket: false, has_roles: false, docs_html: "" },
        status: "draft",
      });
      return;
    }

    if (!active) return;
    const f = (active.flags || {}) as any;
    setDraft({
      ...active,
      tagsText: (active.tags || []).join(", "),
      stepsHtml: active.steps_md || "",
      docsHtml: (f?.docs_html as string) || "",
      flags: active.flags || {},
    });
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
  }

  async function saveProcedure() {
    if (!canEdit) return;

    const title = (draft.title || "").trim();
    const summary = (draft.summary || "").trim();
    if (!title || !summary) {
      alert("Preencha pelo menos Título e Resumo rápido.");
      return;
    }

    const stepsHtml = (draft.stepsHtml ?? draft.steps_md ?? "").trim();
    const docsHtml = (draft.docsHtml || "").trim();

    const baseFlags = (draft.flags || {}) as any;
    const mergedFlags = {
      ...baseFlags,
      uses_ticket: false,
      docs_html: docsHtml || null,
    };

    const payload: Partial<KBProcedure> & { tags: string[] } = {
      title,
      summary,
      trigger: (draft.trigger || "").trim() || null,
      steps_md: stepsHtml || null, // HTML
      tags: splitTags(draft.tagsText || ""),
      area: (draft.area || "").trim() || null,
      channel: (draft.channel || "").trim() || null,
      sla_text: (draft.sla_text || "").trim() || null,
      flags: mergedFlags,
      status: ((draft.status as any) || "draft") as any,
      updated_by: (await supabase.auth.getUser()).data.user?.id || null,
    };

    setLoading(true);
    try {
      if (draft.id) {
        const { error } = await supabase
          .from("kb_procedures")
          .update(payload as any)
          .eq("id", draft.id);

        if (error) throw error;

        await loadProcedures();
        setActiveId(draft.id);
        setEditing(false);
        return;
      }

      const auth = await supabase.auth.getUser();
      const created_by = auth.data.user?.id || null;

      const { data, error } = await supabase
        .from("kb_procedures")
        .insert([{ ...(payload as any), created_by }])
        .select("id")
        .single();

      if (error) throw error;

      await loadProcedures();
      setActiveId((data as any)?.id || null);
      setEditing(false);
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function approveProcedure() {
    if (!canApprove || !active) return;
    const ok = confirm("Publicar este procedimento como ATIVO?");
    if (!ok) return;

    try {
      const auth = await supabase.auth.getUser();
      const adminUid = auth.data.user?.id || null;

      const { error } = await supabase
        .from("kb_procedures")
        .update({
          status: "active",
          approved_by: adminUid,
          approved_at: new Date().toISOString(),
          updated_by: adminUid,
        })
        .eq("id", active.id);

      if (error) throw error;

      // cria notificação no CRM (tabelas já criadas)
      try {
        await supabase.from("crm_notifications").insert([
          {
            kind: "info",
            type: "procedure_published",
            title: `Novo procedimento publicado: ${active.title}`,
            body: active.summary || null,
            link: `/procedimentos?pid=${active.id}`,
            meta: { procedure_id: active.id, area: active.area, channel: active.channel },
            is_active_only: true,
            created_by: adminUid,
          },
        ]);
      } catch {
        // não bloqueia publish
      }

      await loadProcedures();
      await loadDetails(active.id);
    } catch (e: any) {
      alert(e?.message || "Erro ao aprovar.");
    }
  }

  async function submitSuggestion() {
    if (!active) return;
    const text = newSuggestion.trim();
    if (!text) return;

    try {
      const auth = await supabase.auth.getUser();
      const created_by = auth.data.user?.id || null;

      const { error } = await supabase
        .from("kb_suggestions")
        .insert([{ procedure_id: active.id, suggestion: text, created_by }]);

      if (error) throw error;

      setNewSuggestion("");
      await loadDetails(active.id);
    } catch (e: any) {
      alert(e?.message || "Erro ao enviar sugestão.");
    }
  }

  async function handleSuggestion(id: string, status: "accepted" | "rejected") {
    if (!canEdit) return;
    try {
      const auth = await supabase.auth.getUser();
      const handled_by = auth.data.user?.id || null;

      const { error } = await supabase
        .from("kb_suggestions")
        .update({
          status,
          handled_by,
          handled_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      if (activeId) await loadDetails(activeId);
    } catch (e: any) {
      alert(e?.message || "Erro ao atualizar sugestão.");
    }
  }

  async function uploadAsset(file: File, kind: KBAsset["kind"]) {
    if (!active || !canEdit) return;

    // restrição solicitada: apenas doc/pdf (modelos)
    if (!allowedAttachment(file)) {
      alert("Anexos permitidos: .pdf, .doc, .docx");
      return;
    }

    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
      const path = `procedure/${active.id}/${Date.now()}_${safe}`;

      const { error: upErr } = await supabase.storage
        .from("kb_assets")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });

      if (upErr) throw upErr;

      const auth = await supabase.auth.getUser();
      const uploaded_by = auth.data.user?.id || null;

      const { error: metaErr } = await supabase
        .from("kb_assets")
        .insert([
          {
            procedure_id: active.id,
            kind,
            title: file.name,
            file_path: path,
            mime: file.type || null,
            uploaded_by,
          },
        ]);

      if (metaErr) throw metaErr;

      await loadDetails(active.id);
    } catch (e: any) {
      alert(e?.message || "Erro ao enviar anexo (verifique policies do Storage).");
    }
  }

  async function openAsset(asset: KBAsset) {
    try {
      const { data, error } = await supabase.storage
        .from("kb_assets")
        .createSignedUrl(asset.file_path, 60);

      if (error) throw error;

      const url = data?.signedUrl;
      if (url) window.open(url, "_blank");
    } catch (e: any) {
      alert(e?.message || "Erro ao abrir anexo (verifique policies do Storage).");
    }
  }

  const statusPill = (st: KBStatus) => {
    if (st === "active")
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge>;
    if (st === "review")
      return <Badge className="bg-amber-600 hover:bg-amber-600">Em revisão</Badge>;
    return <Badge variant="secondary">Rascunho</Badge>;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Procedimentos</div>
          <div className="text-sm text-muted-foreground">
            Base de conhecimento operacional (Wiki). Pesquise e encontre o passo a passo.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={refreshAll}
            disabled={refreshing}
            className="gap-2"
            title="Atualizar"
          >
            <RefreshCcw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Atualizar
          </Button>

          {canEdit && (
            <Button onClick={() => beginEdit("new")} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LISTA */}
        <Card className="lg:col-span-5">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> Buscar
            </CardTitle>

            <div className="flex gap-2">
              <Input
                placeholder="Ex.: devolução de lance, transferência, cancelamento…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Select value={fArea} onValueChange={setFArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Área" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas áreas</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fChannel} onValueChange={setFChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos canais</SelectItem>
                  {channels.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="review">Em revisão</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}

            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhum procedimento encontrado.</div>
            )}

            <div className="space-y-2 max-h-[68vh] overflow-auto pr-1">
              {filtered.map((p) => {
                const isActive = p.id === activeId;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setEditing(false);
                      setDraft({});
                      setActiveId(p.id);
                    }}
                    className={[
                      "w-full text-left rounded-xl border p-3 transition",
                      isActive
                        ? "border-[#A11C27] bg-[#A11C27]/5"
                        : "border-slate-200 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-slate-900">{p.title}</div>
                      {statusPill(p.status)}
                    </div>

                    <div className="mt-1 text-sm text-slate-600 line-clamp-2">{p.summary}</div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {(p.tags || []).slice(0, 6).map((t) => (
                        <Badge key={t} variant="secondary" className="font-normal">
                          {t}
                        </Badge>
                      ))}
                      {(p.tags || []).length > 6 && (
                        <Badge variant="secondary" className="font-normal">
                          +{(p.tags || []).length - 6}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                      <span>{p.area || "—"}</span>
                      <span>•</span>
                      <span>{p.channel || "—"}</span>
                      <span>•</span>
                      <span>Atualizado: {humanDate(p.updated_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* DETALHE */}
        <Card className="lg:col-span-7">
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{active?.title || "Selecione um procedimento"}</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">{active?.summary || "—"}</div>
              </div>

              {active && (
                <div className="flex items-center gap-2">
                  {statusPill(active.status)}
                  {canEdit && !editing && (
                    <Button variant="outline" className="gap-2" onClick={() => beginEdit("edit")}>
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  )}
                </div>
              )}
            </div>

            {active && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Área: {active.area || "—"}</span>
                <span>•</span>
                <span>Canal: {active.channel || "—"}</span>
                <span>•</span>
                <span>SLA: {active.sla_text || "—"}</span>
                <span>•</span>
                <span>Revisão: {humanDate(active.updated_at)}</span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-3">
            {!active && <div className="text-sm text-muted-foreground">Selecione um procedimento à esquerda.</div>}

            {active && editing && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Editor
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={cancelEdit}>
                      <X className="h-4 w-4" /> Cancelar
                    </Button>
                    <Button className="gap-2" onClick={saveProcedure} disabled={loading}>
                      <Save className="h-4 w-4" /> Salvar
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Título</div>
                    <Input
                      ref={titleRef}
                      value={draft.title || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Ex.: Transferência de cota"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <Select
                      value={(draft.status as any) || "draft"}
                      onValueChange={(v) => setDraft((d) => ({ ...d, status: v as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="review">Em revisão</SelectItem>
                        <SelectItem value="active">Ativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-[11px] text-muted-foreground">
                      *Publicar como <b>Ativo</b> é só Admin.
                    </div>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Resumo rápido (TL;DR)</div>
                    <Textarea
                      value={draft.summary || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                      placeholder="Ex.: Coletar docs → abrir ticket → anexar tudo → acompanhar validação."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Quando usar (gatilho)</div>
                    <Textarea
                      value={(draft.trigger as any) || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, trigger: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Área</div>
                    <Input
                      value={draft.area || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
                      placeholder="Operações"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Canal</div>
                    <Input
                      value={draft.channel || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value }))}
                      placeholder="Ticket"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">SLA</div>
                    <Input
                      value={(draft.sla_text as any) || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, sla_text: e.target.value }))}
                      placeholder="Ex.: 72h úteis"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Tags (separadas por vírgula)</div>
                    <Input
                      value={draft.tagsText || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))}
                      placeholder="transferência, cota, operações"
                    />
                  </div>

                  {/* PASSO A PASSO - RICO */}
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">
                      Passo a passo (editor rico estilo Word)
                    </div>
                    <RichEditor
                      value={draft.stepsHtml || ""}
                      onChange={({ html }) => setDraft((d) => ({ ...d, stepsHtml: html }))}
                      placeholder="Digite aqui o passo a passo. Você pode formatar, colar imagens (Ctrl+V) e ajustar."
                      minHeight={260}
                      disabled={loading}
                    />
                  </div>

                  {/* DOCUMENTOS - RICO (novo, guardado em flags.docs_html) */}
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">
                      Documentos (descreva a relação de documentos – estilo Word)
                    </div>
                    <RichEditor
                      value={draft.docsHtml || ""}
                      onChange={({ html }) => setDraft((d) => ({ ...d, docsHtml: html }))}
                      placeholder="Liste os documentos usados neste processo. Ex.: RG, CPF, comprovante..."
                      minHeight={200}
                      disabled={loading}
                    />
                    <div className="text-[11px] text-muted-foreground">
                      *Esta lista fica salva no procedimento e aparece na aba “Documentos”.
                    </div>
                  </div>
                </div>

                {canApprove && active && (
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 border p-3">
                    <div className="text-sm">
                      <div className="font-medium">Publicação</div>
                      <div className="text-xs text-muted-foreground">
                        Ao aprovar, o procedimento fica <b>Ativo</b> para toda a equipe e gera notificação no CRM.
                      </div>
                    </div>
                    <Button className="gap-2" onClick={approveProcedure}>
                      <CheckCircle2 className="h-4 w-4" />
                      Aprovar e publicar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {active && !editing && (
              <Tabs defaultValue="passos" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="passos">Passo a passo</TabsTrigger>
                  <TabsTrigger value="docs">Documentos</TabsTrigger>
                  {/* Ticket removido conforme pedido */}
                  <TabsTrigger value="anexos">Anexos</TabsTrigger>
                  <TabsTrigger value="sugestoes">Sugestões</TabsTrigger>
                </TabsList>

                <TabsContent value="passos" className="pt-3">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Quando usar</div>
                    <div className="text-sm text-slate-700">{active.trigger || "—"}</div>

                    <div className="h-px w-full bg-slate-200 my-3" />

                    <div className="text-sm font-medium">Como fazer</div>
                    <RichView htmlOrText={active.steps_md} />
                  </div>
                </TabsContent>

                <TabsContent value="docs" className="pt-3">
                  <div className="space-y-3">
                    {/* 1) Preferência: documentos livres (flags.docs_html) */}
                    {activeDocsHtml?.trim() ? (
                      <div className="rounded-xl border p-3">
                        <RichView htmlOrText={activeDocsHtml} />
                      </div>
                    ) : (
                      <>
                        {/* 2) Fallback: estrutura antiga kb_documents (mantém compat) */}
                        {docs.length === 0 ? (
                          <div className="text-sm text-muted-foreground">
                            Sem documentos cadastrados.
                          </div>
                        ) : (
                          <>
                            {Object.entries(
                              docs.reduce<Record<string, KBDoc[]>>((acc, d) => {
                                const k = d.role_key || "geral";
                                acc[k] = acc[k] || [];
                                acc[k].push(d);
                                return acc;
                              }, {})
                            ).map(([roleKey, items]) => (
                              <div key={roleKey} className="rounded-xl border p-3">
                                <div className="text-sm font-medium">
                                  {roleKey === "geral"
                                    ? "Geral"
                                    : roles.find((r) => r.role_key === roleKey)?.role_label ||
                                      roleKey}
                                </div>
                                <div className="mt-2 space-y-2">
                                  {items.map((d) => (
                                    <div
                                      key={d.id}
                                      className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 border p-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-sm font-medium text-slate-900">
                                          {d.doc_name}{" "}
                                          {!d.required && (
                                            <span className="text-xs text-muted-foreground">
                                              (opcional)
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {[
                                            d.format_hint ? `Formato: ${d.format_hint}` : null,
                                            d.validity_hint
                                              ? `Validade: ${d.validity_hint}`
                                              : null,
                                            d.notes ? d.notes : null,
                                          ]
                                            .filter(Boolean)
                                            .join(" • ") || "—"}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="anexos" className="pt-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Anexos (modelos .doc/.pdf)
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Upload:</label>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="text-xs"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              uploadAsset(file, "template");
                              e.currentTarget.value = "";
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {assets.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Sem anexos ainda. (Se upload falhar, é policy do Storage.)
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {assets.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => openAsset(a)}
                            className="w-full text-left rounded-xl border p-3 hover:bg-slate-50 transition"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-900">{a.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  Tipo: {a.kind} • Enviado: {humanDate(a.created_at)}
                                </div>
                              </div>
                              <Badge variant="secondary" className="font-normal">
                                Abrir
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="sugestoes" className="pt-3">
                  <div className="space-y-3">
                    <div className="rounded-xl border p-3 space-y-2">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        Enviar sugestão de melhoria
                      </div>
                      <Textarea
                        value={newSuggestion}
                        onChange={(e) => setNewSuggestion(e.target.value)}
                        rows={3}
                        placeholder="Ex.: 'O ticket mudou, agora o campo Tipo de Pagamento fica em...' "
                      />
                      <div className="flex justify-end">
                        <Button onClick={submitSuggestion}>Enviar</Button>
                      </div>
                    </div>

                    {suggestions.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Nenhuma sugestão ainda.</div>
                    ) : (
                      <div className="space-y-2">
                        {suggestions.map((s) => (
                          <div key={s.id} className="rounded-xl border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-slate-900">{s.suggestion}</div>
                                <div className="text-xs text-muted-foreground">
                                  {humanDate(s.created_at)} • Status:{" "}
                                  <span className="font-medium">{s.status}</span>
                                </div>
                              </div>

                              {canEdit && s.status === "open" && (
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSuggestion(s.id, "accepted")}
                                  >
                                    Aceitar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSuggestion(s.id, "rejected")}
                                  >
                                    Rejeitar
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
