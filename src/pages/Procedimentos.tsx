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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import jsPDF from "jspdf";

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
  Square, // substitui BorderAll (evita erro de export)
  Download,
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
  steps_md: string | null; // armazenamos HTML aqui
  tags: string[]; // text[]
  admin_id: string | null;
  area: string | null;
  channel: string | null;
  sla_text: string | null;
  flags: any; // jsonb (guardamos docs_html aqui)
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

function looksLikeHtml(s?: string | null) {
  const t = (s || "").trim();
  if (!t) return false;
  return t.includes("<") && t.includes(">");
}

function stripHtmlToText(html: string) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = (doc.body?.textContent || "").replace(/\u00A0/g, " ");
    return text
      .split("\n")
      .map((s) => s.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function extractImagesFromHtml(html: string) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img"))
      .map((img) => img.getAttribute("src") || "")
      .filter(Boolean);
    return imgs;
  } catch {
    return [];
  }
}

async function getImageSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type RichEditorProps = {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: number;
};

function RichEditor({
  value,
  onChange,
  readOnly,
  placeholder,
  minHeight = 220,
}: RichEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [imgSelected, setImgSelected] = useState<HTMLImageElement | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(420);
  const [imgBorder, setImgBorder] = useState<boolean>(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function exec(cmd: string, arg?: string) {
    if (readOnly) return;
    // @ts-ignore
    document.execCommand("styleWithCSS", false, true);
    // @ts-ignore
    document.execCommand(cmd, false, arg);
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  }

  function updateFromDom() {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
  }

  async function handlePaste(e: React.ClipboardEvent) {
    if (readOnly) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const imgItem = Array.from(items).find((it) => it.type.startsWith("image/"));
    if (!imgItem) return;

    e.preventDefault();
    const file = imgItem.getAsFile();
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;

      const imgHtml = `<img src="${dataUrl}" style="max-width:100%;height:auto;border-radius:12px;" />`;
      // @ts-ignore
      document.execCommand("insertHTML", false, imgHtml);

      const el = ref.current;
      if (el) onChange(el.innerHTML);
    };
    reader.readAsDataURL(file);
  }

  function onClickEditor(e: React.MouseEvent) {
    const t = e.target as any;
    if (t && t.tagName === "IMG") {
      const img = t as HTMLImageElement;
      setImgSelected(img);
      const w = parseInt(img.style.width || "", 10);
      setImgWidth(Number.isFinite(w) && w > 0 ? w : Math.min(600, img.clientWidth || 420));
      setImgBorder((img.style.border || "").includes("solid"));
      return;
    }
    setImgSelected(null);
  }

  function applyImg() {
    if (!imgSelected) return;
    imgSelected.style.width = `${imgWidth}px`;
    imgSelected.style.maxWidth = "100%";
    imgSelected.style.height = "auto";
    imgSelected.style.borderRadius = "12px";
    imgSelected.style.border = imgBorder ? "2px solid rgba(30,41,63,0.25)" : "none";
    updateFromDom();
  }

  useEffect(() => {
    applyImg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgWidth, imgBorder]);

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("bold")}>
            <Bold className="h-4 w-4" /> Negrito
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("italic")}>
            <Italic className="h-4 w-4" /> Itálico
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("underline")}>
            <Underline className="h-4 w-4" /> Sublinhado
          </Button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("justifyLeft")}>
            <AlignLeft className="h-4 w-4" /> Esquerda
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("justifyCenter")}>
            <AlignCenter className="h-4 w-4" /> Centro
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("justifyRight")}>
            <AlignRight className="h-4 w-4" /> Direita
          </Button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("fontSize", "2")}>
            <Type className="h-4 w-4" /> Pequena
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("fontSize", "3")}>
            <Type className="h-4 w-4" /> Normal
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => exec("fontSize", "5")}>
            <Type className="h-4 w-4" /> Grande
          </Button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exec("hiliteColor", "#FFE08A")}
            title="Realce"
          >
            <Highlighter className="h-4 w-4" /> Realçar
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exec("removeFormat")}
            title="Limpar formatação"
          >
            <X className="h-4 w-4" /> Limpar
          </Button>

          <div className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Cole imagens com <b>Ctrl+V</b>
          </div>
        </div>
      )}

      {imgSelected && !readOnly && (
        <div className="rounded-xl border bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <Square className="h-4 w-4" />
              Imagem selecionada
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Largura:</span>
              <input
                type="range"
                min={120}
                max={900}
                value={imgWidth}
                onChange={(e) => setImgWidth(parseInt(e.target.value, 10))}
              />
              <span className="text-xs tabular-nums w-12 text-right">{imgWidth}px</span>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={imgBorder}
                onChange={(e) => setImgBorder(e.target.checked)}
              />
              Borda
            </label>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setImgSelected(null)}
            >
              Fechar
            </Button>
          </div>
        </div>
      )}

      <div
        ref={ref}
        className={[
          "rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed",
          readOnly ? "opacity-95" : "focus:outline-none focus:ring-2 focus:ring-[#A11C27]/30",
        ].join(" ")}
        style={{ minHeight }}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={updateFromDom}
        onPaste={handlePaste}
        onClick={onClickEditor}
        data-placeholder={placeholder || ""}
      />
      {!readOnly && (
        <div className="text-[11px] text-muted-foreground">
          Dica: copie uma imagem e use <b>Ctrl+V</b> aqui. (Ela será salva dentro do texto.)
        </div>
      )}
    </div>
  );
}

async function tryInsertNotificationForActiveUsers(payload: {
  title: string;
  body: string;
  link?: string | null;
  created_by?: string | null;
}) {
  try {
    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id")
      .eq("is_active", true)
      .limit(2000);

    if (uErr) throw uErr;

    const rows = (users || []).map((u: any) => ({
      user_id: u.id,
      title: payload.title,
      body: payload.body,
      link: payload.link || null,
      created_by: payload.created_by || null,
    }));

    if (!rows.length) return;

    const tries = ["crm_notifications", "notifications"];
    for (const table of tries) {
      const { error } = await supabase.from(table as any).insert(rows as any);
      if (!error) return;
    }
  } catch {
    // silent
  }
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

  const [q, setQ] = useState("");
  const [fArea, setFArea] = useState<string>("__all__");
  const [fChannel, setFChannel] = useState<string>("__all__");
  const [fStatus, setFStatus] = useState<string>("__all__");

  const active = useMemo(
    () => procedures.find((p) => p.id === activeId) || null,
    [procedures, activeId]
  );

  const [roles, setRoles] = useState<KBRole[]>([]);
  const [docs, setDocs] = useState<KBDoc[]>([]);
  const [assets, setAssets] = useState<KBAsset[]>([]);
  const [suggestions, setSuggestions] = useState<KBSuggestion[]>([]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<KBProcedure> & { tagsText?: string }>({});

  const [stepsHtml, setStepsHtml] = useState<string>("");
  const [docsHtml, setDocsHtml] = useState<string>("");

  const [newSuggestion, setNewSuggestion] = useState("");

  // ====== Viewer de imagem (sem mexer no layout)
  const [imgViewerOpen, setImgViewerOpen] = useState(false);
  const [imgViewerSrc, setImgViewerSrc] = useState<string>("");
  const [imgViewerTitle, setImgViewerTitle] = useState<string>("Imagem");

  function openImageViewer(src: string, title?: string) {
    if (!src) return;
    setImgViewerSrc(src);
    setImgViewerTitle(title || "Imagem");
    setImgViewerOpen(true);
  }

  function renderHtmlOrFallback(value?: string | null, opts?: { enableImgViewer?: boolean }) {
    const v = (value || "").trim();
    if (!v) return <div className="text-sm text-muted-foreground">—</div>;

    const enableImgViewer = !!opts?.enableImgViewer;

    if (looksLikeHtml(v)) {
      return (
        <div
          className="prose prose-sm max-w-none"
          onClick={(e) => {
            if (!enableImgViewer) return;
            const t = e.target as any;
            if (t && t.tagName === "IMG") {
              const src = (t as HTMLImageElement).src || "";
              if (src) openImageViewer(src, "Imagem do procedimento");
            }
          }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: v }}
        />
      );
    }

    const lines = v.split("\n");
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

      if (!activeId && rows.length) setActiveId(rows[0].id);
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
      const f = { uses_ticket: false, has_roles: false, docs_html: "" };
      setDraft({
        title: "",
        summary: "",
        trigger: "",
        tagsText: "procedimento, operações",
        area: "Operações",
        channel: "Ticket",
        sla_text: "",
        flags: f,
        status: "draft",
      });
      setStepsHtml("");
      setDocsHtml("");
      return;
    }

    if (!active) return;

    setDraft({
      ...active,
      tagsText: (active.tags || []).join(", "),
    });

    const currentSteps = (active.steps_md || "") as string;
    setStepsHtml(looksLikeHtml(currentSteps) ? currentSteps : (currentSteps ? `<div>${currentSteps}</div>` : ""));

    const dHtml = (active.flags?.docs_html as any) || "";
    setDocsHtml(typeof dHtml === "string" ? dHtml : "");
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
    setStepsHtml("");
    setDocsHtml("");
  }

  async function saveProcedure() {
    if (!canEdit) return;

    const title = (draft.title || "").trim();
    const summary = (draft.summary || "").trim();
    if (!title || !summary) {
      alert("Preencha pelo menos Título e Resumo rápido.");
      return;
    }

    const authNow = await supabase.auth.getUser();
    const uid = authNow.data.user?.id || null;

    const mergedFlags = { ...(draft.flags || {}) };
    mergedFlags.docs_html = docsHtml || "";
    mergedFlags.uses_ticket = false;

    const payload: Partial<KBProcedure> & { tags: string[] } = {
      title,
      summary,
      trigger: (draft.trigger || "").trim() || null,
      steps_md: (stepsHtml || "").trim() || null,
      tags: splitTags(draft.tagsText || ""),
      area: (draft.area || "").trim() || null,
      channel: (draft.channel || "").trim() || null,
      sla_text: (draft.sla_text || "").trim() || null,
      flags: mergedFlags,
      status: ((draft.status as any) || "draft") as any,
      updated_by: uid as any,
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

      const created_by = uid;

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

      await tryInsertNotificationForActiveUsers({
        title: "Novo procedimento publicado",
        body: `Procedimento: ${active.title}`,
        link: "/procedimentos",
        created_by: adminUid,
      });

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

    const nameLower = (file.name || "").toLowerCase();
    const okExt = nameLower.endsWith(".pdf") || nameLower.endsWith(".doc") || nameLower.endsWith(".docx");
    if (!okExt) {
      alert("Envie apenas arquivos .pdf, .doc ou .docx para os anexos do procedimento.");
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
    if (st === "active") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge>;
    if (st === "review") return <Badge className="bg-amber-600 hover:bg-amber-600">Em revisão</Badge>;
    return <Badge variant="secondary">Rascunho</Badge>;
  };

  const activeDocsHtml = useMemo(() => {
    const v = (active?.flags?.docs_html as any) || "";
    return typeof v === "string" ? v : "";
  }, [active]);

  // ====== PDF do procedimento (botão ao lado do Editar)
  async function downloadProcedurePDF() {
    if (!active) return;

    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 44;
      let y = margin;

      const title = active.title || "Procedimento";
      const meta = [
        active.area ? `Área: ${active.area}` : null,
        active.channel ? `Canal: ${active.channel}` : null,
        active.sla_text ? `SLA: ${active.sla_text}` : null,
        `Atualizado: ${humanDate(active.updated_at)}`,
        `Status: ${active.status}`,
      ]
        .filter(Boolean)
        .join("  •  ");

      const trigger = (active.trigger || "").trim();
      const stepsHtmlNow = (active.steps_md || "").trim();
      const docsHtmlNow = (activeDocsHtml || "").trim();

      const stepsText = looksLikeHtml(stepsHtmlNow) ? stripHtmlToText(stepsHtmlNow) : stepsHtmlNow;
      const docsText = looksLikeHtml(docsHtmlNow) ? stripHtmlToText(docsHtmlNow) : docsHtmlNow;

      const stepImgs = looksLikeHtml(stepsHtmlNow) ? extractImagesFromHtml(stepsHtmlNow) : [];
      const docImgs = looksLikeHtml(docsHtmlNow) ? extractImagesFromHtml(docsHtmlNow) : [];
      const images = [...stepImgs, ...docImgs];

      function addPageIfNeeded(extra: number) {
        if (y + extra > pageH - margin) {
          doc.addPage();
          y = margin;
        }
      }

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      const titleLines = doc.splitTextToSize(title, pageW - margin * 2);
      addPageIfNeeded(titleLines.length * 22);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 22 + 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const metaLines = doc.splitTextToSize(meta, pageW - margin * 2);
      addPageIfNeeded(metaLines.length * 14);
      doc.text(metaLines, margin, y);
      y += metaLines.length * 14 + 16;

      // Summary
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      addPageIfNeeded(18);
      doc.text("Resumo", margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const summaryLines = doc.splitTextToSize(active.summary || "—", pageW - margin * 2);
      addPageIfNeeded(summaryLines.length * 16);
      doc.text(summaryLines, margin, y);
      y += summaryLines.length * 16 + 16;

      // Trigger
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      addPageIfNeeded(18);
      doc.text("Quando usar", margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const trigLines = doc.splitTextToSize(trigger || "—", pageW - margin * 2);
      addPageIfNeeded(trigLines.length * 16);
      doc.text(trigLines, margin, y);
      y += trigLines.length * 16 + 16;

      // Steps
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      addPageIfNeeded(18);
      doc.text("Passo a passo", margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const stepsLines = doc.splitTextToSize(stepsText || "—", pageW - margin * 2);
      addPageIfNeeded(Math.max(16, Math.min(stepsLines.length, 60)) * 16);
      doc.text(stepsLines, margin, y);
      y += stepsLines.length * 16 + 16;

      // Docs
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      addPageIfNeeded(18);
      doc.text("Documentos", margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const docsLines = doc.splitTextToSize(docsText || (docs.length ? "—" : "Sem descrição de documentos."), pageW - margin * 2);
      addPageIfNeeded(Math.max(16, Math.min(docsLines.length, 60)) * 16);
      doc.text(docsLines, margin, y);
      y += docsLines.length * 16 + 16;

      // Lista estruturada de docs (quando existir)
      if (docs.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        addPageIfNeeded(18);
        doc.text("Checklist de documentos (cadastro)", margin, y);
        y += 16;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);

        const grouped = Object.entries(
          docs.reduce<Record<string, KBDoc[]>>((acc, d) => {
            const k = d.role_key || "geral";
            acc[k] = acc[k] || [];
            acc[k].push(d);
            return acc;
          }, {})
        );

        for (const [roleKey, items] of grouped) {
          const roleLabel =
            roleKey === "geral"
              ? "Geral"
              : roles.find((r) => r.role_key === roleKey)?.role_label || roleKey;

          doc.setFont("helvetica", "bold");
          addPageIfNeeded(16);
          doc.text(roleLabel, margin, y);
          y += 14;

          doc.setFont("helvetica", "normal");
          for (const d of items) {
            const line = `• ${d.doc_name}${d.required ? "" : " (opcional)"}${
              d.format_hint ? ` — Formato: ${d.format_hint}` : ""
            }${d.validity_hint ? ` — Validade: ${d.validity_hint}` : ""}${d.notes ? ` — ${d.notes}` : ""}`;

            const lines = doc.splitTextToSize(line, pageW - margin * 2);
            addPageIfNeeded(lines.length * 16);
            doc.text(lines, margin, y);
            y += lines.length * 16;
          }
          y += 10;
        }
      }

      // Imagens (se houverem dentro do HTML)
      if (images.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        addPageIfNeeded(18);
        doc.text("Imagens", margin, y);
        y += 16;

        for (const src of images) {
          // Evita imagens externas por CORS; as suas são dataURL, então ok.
          const size = await getImageSize(src);
          if (!size) continue;

          // Define tipo para jsPDF (dataURL)
          const isPng = src.startsWith("data:image/png");
          const kind = isPng ? "PNG" : "JPEG";

          const maxW = pageW - margin * 2;
          const maxH = pageH - margin * 2;

          let w = size.w;
          let h = size.h;

          // escala proporcional
          const scaleW = maxW / w;
          const scaleH = maxH / h;
          const scale = Math.min(scaleW, scaleH, 1);

          w = w * scale;
          h = h * scale;

          addPageIfNeeded(h + 18);
          doc.addImage(src, kind as any, margin, y, w, h, undefined, "FAST");
          y += h + 14;
        }
      }

      const safeTitle = (active.title || "procedimento").replace(/[^\w\-]+/g, "_").slice(0, 80);
      doc.save(`Procedimento_${safeTitle}.pdf`);
    } catch (e: any) {
      alert(e?.message || "Não foi possível gerar o PDF (verifique dependências).");
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Viewer de imagem (não altera layout; só abre por cima) */}
      <Dialog open={imgViewerOpen} onOpenChange={setImgViewerOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{imgViewerTitle}</DialogTitle>
          </DialogHeader>
          <div className="w-full">
            {/* Boa qualidade: exibimos a imagem original (dataURL) em contain */}
            <img
              src={imgViewerSrc}
              alt="Imagem"
              className="w-full max-h-[78vh] object-contain rounded-lg border bg-white"
            />
            <div className="mt-2 text-xs text-muted-foreground">
              Dica: se quiser salvar a imagem, clique com o botão direito → “Salvar imagem como…”
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                      setStepsHtml("");
                      setDocsHtml("");
                      setActiveId(p.id);
                    }}
                    className={[
                      "w-full text-left rounded-xl border p-3 transition",
                      isActive ? "border-[#A11C27] bg-[#A11C27]/5" : "border-slate-200 hover:bg-slate-50",
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
                <div className="mt-1 text-sm text-muted-foreground">
                  {active?.summary || "—"}
                </div>
              </div>

              {active && (
                <div className="flex items-center gap-2">
                  {statusPill(active.status)}

                  {/* Download PDF (ao lado do Editar) */}
                  {!editing && (
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={downloadProcedurePDF}
                      title="Baixar PDF"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  )}

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
            {!active && (
              <div className="text-sm text-muted-foreground">
                Selecione um procedimento à esquerda.
              </div>
            )}

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
                      value={draft.title || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Ex.: Devolução de lance (cota descontemplada)"
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
                      placeholder="Ex.: Abrir ticket → anexar docs → informar dados bancários → aguardar depósito."
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
                      placeholder="devolução, lance, reembolso, ticket"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Passo a Passo (estilo Word)</div>
                    <RichEditor
                      value={stepsHtml}
                      onChange={setStepsHtml}
                      placeholder="Digite o passo a passo aqui…"
                      minHeight={260}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Documentos (estilo Word)</div>
                    <RichEditor
                      value={docsHtml}
                      onChange={setDocsHtml}
                      placeholder="Liste/Descreva os documentos necessários…"
                      minHeight={220}
                    />
                  </div>
                </div>

                {canApprove && active && (
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 border p-3">
                    <div className="text-sm">
                      <div className="font-medium">Publicação</div>
                      <div className="text-xs text-muted-foreground">
                        Ao aprovar, o procedimento fica <b>Ativo</b> para toda a equipe.
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
                  <TabsTrigger value="anexos">Anexos</TabsTrigger>
                  <TabsTrigger value="sugestoes">Sugestões</TabsTrigger>
                </TabsList>

                <TabsContent value="passos" className="pt-3">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Quando usar</div>
                    <div className="text-sm text-slate-700">{active.trigger || "—"}</div>

                    <div className="h-px w-full bg-slate-200 my-3" />

                    <div className="text-sm font-medium">Como fazer</div>
                    {/* Clique em imagens abre viewer */}
                    {renderHtmlOrFallback(active.steps_md, { enableImgViewer: true })}
                    <div className="text-[11px] text-muted-foreground">
                      Dica: clique em uma imagem para abrir em tela cheia.
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="docs" className="pt-3">
                  <div className="space-y-3">
                    <div className="rounded-xl border p-3">
                      <div className="text-sm font-medium mb-2">Documentos (descrição)</div>
                      {activeDocsHtml ? (
                        <>
                          {renderHtmlOrFallback(activeDocsHtml, { enableImgViewer: true })}
                          <div className="text-[11px] text-muted-foreground mt-2">
                            Dica: clique em uma imagem para abrir em tela cheia.
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground">Sem descrição de documentos.</div>
                      )}
                    </div>

                    {docs.length > 0 && (
                      <div className="space-y-3">
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
                                : roles.find((r) => r.role_key === roleKey)?.role_label || roleKey}
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
                                        <span className="text-xs text-muted-foreground">(opcional)</span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {[
                                        d.format_hint ? `Formato: ${d.format_hint}` : null,
                                        d.validity_hint ? `Validade: ${d.validity_hint}` : null,
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
                      </div>
                    )}

                    {docs.length === 0 && !activeDocsHtml && (
                      <div className="text-sm text-muted-foreground">Sem documentos cadastrados.</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="anexos" className="pt-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Anexos internos (.pdf / .doc / .docx)
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Upload:</label>
                          <input
                            type="file"
                            className="text-xs"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                        placeholder="Ex.: 'O fluxo mudou, agora o campo X fica em...' "
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
