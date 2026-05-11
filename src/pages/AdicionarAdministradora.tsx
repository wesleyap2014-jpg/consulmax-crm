// src/pages/AdicionarAdministradora.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";

/* ================= Helpers ================= */
const LOGO_BUCKET = "sim-admin-logos";
const MAX_LOGO_SIZE_MB = 3;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parsePctInputToDecimal(s: string): number {
  const clean = (s || "").replace(/\s|%/g, "").replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val / 100;
}

function formatPctInputFromDecimal(d: number): string {
  return (d * 100).toFixed(4).replace(".", ",");
}

function fileExt(file: File) {
  const byName = file.name.split(".").pop()?.toLowerCase();
  if (byName) return byName.replace(/[^a-z0-9]/g, "") || "png";

  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/svg+xml") return "svg";
  return "png";
}

/* ================ Tipos do JSON de regras ================ */
type Rules = {
  lance: {
    base_ofertado: "credito" | "categoria" | "parcelas";
    modelo: "percentual" | "parcela";
    parcela_base?: "contratada" | "termo";
    pede_prazo_original_grupo?: boolean;
  };
  lance_embutido: {
    base: "credito" | "categoria";
  };
  limitador_parcela: {
    existe: boolean;
    base?: "credito" | "categoria" | "parcela_pct";
    pct_origem?: "tabela" | "adm";
    pct_padrao_adm?: number;
  };
  redutor_pre_contratacao: {
    permite: boolean;
    base?: "credito" | "categoria";
  };
  seguro: {
    obrigatorio: "nao" | "sim_inicio" | "sim_apos";
  };
};

const defaultRules: Rules = {
  lance: {
    base_ofertado: "credito",
    modelo: "percentual",
    parcela_base: "contratada",
    pede_prazo_original_grupo: false,
  },
  lance_embutido: { base: "credito" },
  limitador_parcela: {
    existe: true,
    base: "categoria",
    pct_origem: "tabela",
    pct_padrao_adm: 0,
  },
  redutor_pre_contratacao: { permite: true, base: "categoria" },
  seguro: { obrigatorio: "nao" },
};

/* ===================== Página ===================== */
export default function AdicionarAdministradora() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);

  // Identidade
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string>("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Regras
  const [rules, setRules] = useState<Rules>(defaultRules);
  const [limitPctHuman, setLimitPctHuman] = useState(
    formatPctInputFromDecimal(defaultRules.limitador_parcela.pct_padrao_adm ?? 0)
  );

  // Estado
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // slug automático
  useEffect(() => {
    if (!slugTouched && !isEditing) setSlug(slugify(name));
  }, [name, slugTouched, isEditing]);

  // preview local da logo
  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(logoUrl);
      return;
    }

    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [logoFile, logoUrl]);

  // carregar administradora em modo edição
  useEffect(() => {
    if (!id) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: loadErr } = await supabase
        .from("sim_admins")
        .select("id,name,slug,logo_url,description")
        .eq("id", id)
        .maybeSingle();

      if (!alive) return;

      if (loadErr || !data) {
        setError(loadErr?.message || "Administradora não encontrada.");
        setLoading(false);
        return;
      }

      setName((data as any).name || "");
      setSlug((data as any).slug || "");
      setSlugTouched(true);
      setDescription((data as any).description || "");
      setLogoUrl((data as any).logo_url || null);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  // sincroniza % padrão adm (quando origem = adm)
  useEffect(() => {
    const d = parsePctInputToDecimal(limitPctHuman);
    setRules((r) => ({
      ...r,
      limitador_parcela: { ...r.limitador_parcela, pct_padrao_adm: d },
    }));
  }, [limitPctHuman]);

  const needPrazoOriginal = useMemo(
    () => rules.lance.modelo === "parcela" && rules.lance.parcela_base === "termo",
    [rules.lance.modelo, rules.lance.parcela_base]
  );

  function onSlugChange(v: string) {
    setSlugTouched(true);
    setSlug(v);
  }

  function onSelectLogo(file?: File | null) {
    setError(null);

    if (!file) {
      setLogoFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem válido.");
      return;
    }

    if (file.size > MAX_LOGO_SIZE_MB * 1024 * 1024) {
      setError(`A logo deve ter no máximo ${MAX_LOGO_SIZE_MB} MB.`);
      return;
    }

    setLogoFile(file);
  }

  async function uploadLogo(adminId: string, file: File) {
    const ext = fileExt(file);
    const path = `${adminId}/${Date.now()}.${ext}`;

    setUploadingLogo(true);

    const { error: uploadErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || undefined,
      });

    setUploadingLogo(false);

    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  function normalizeRules(): Rules {
    return {
      ...rules,
      lance: {
        ...rules.lance,
        parcela_base: rules.lance.modelo === "parcela" ? rules.lance.parcela_base ?? "contratada" : undefined,
        pede_prazo_original_grupo:
          rules.lance.modelo === "parcela" && rules.lance.parcela_base === "termo" ? true : false,
      },
      limitador_parcela: {
        ...rules.limitador_parcela,
        pct_padrao_adm:
          rules.limitador_parcela.pct_origem === "adm"
            ? rules.limitador_parcela.pct_padrao_adm ?? 0
            : undefined,
      },
      redutor_pre_contratacao: {
        ...rules.redutor_pre_contratacao,
        base: rules.redutor_pre_contratacao.permite ? rules.redutor_pre_contratacao.base ?? "categoria" : undefined,
      },
    };
  }

  async function handleSave() {
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da administradora.");
      return;
    }

    const normalizedSlug = slugify(slug.trim()) || null;

    try {
      setSaving(true);

      if (isEditing && id) {
        let finalLogoUrl = logoUrl;

        if (logoFile) {
          finalLogoUrl = await uploadLogo(id, logoFile);
        }

        const { error: updErr } = await supabase
          .from("sim_admins")
          .update({
            name: trimmed,
            slug: normalizedSlug,
            description: description.trim() || null,
            logo_url: finalLogoUrl,
          } as any)
          .eq("id", id);

        if (updErr) throw updErr;

        navigate("/simuladores", { replace: true });
        return;
      }

      // normaliza regras antes de salvar
      const normalizedRules = normalizeRules();

      const payload = {
        name: trimmed,
        slug: normalizedSlug,
        description: description.trim() || null,
        logo_url: null as string | null,
        rules: normalizedRules,
      };

      const { data, error: insErr } = await supabase
        .from("sim_admins")
        .insert(payload as any)
        .select("id")
        .single();

      if (insErr || !data?.id) throw insErr || new Error("Não foi possível salvar.");

      let finalLogoUrl: string | null = null;

      if (logoFile) {
        finalLogoUrl = await uploadLogo(data.id, logoFile);

        const { error: logoErr } = await supabase
          .from("sim_admins")
          .update({ logo_url: finalLogoUrl } as any)
          .eq("id", data.id);

        if (logoErr) throw logoErr;
      }

      // sucesso → abre gerenciador de tabelas
      navigate(`/simuladores/${data.id}?setup=1`, { replace: true });
      return;
    } catch (err: any) {
      const msg = String(err?.message || "");

      // colisão de unique → abre existente por slug|nome
      const isUniqueViolation = err?.code === "23505" || msg.toLowerCase().includes("duplicate key");

      if (isUniqueViolation) {
        let existingId: string | null = null;

        if (normalizedSlug) {
          const { data: bySlug } = await supabase
            .from("sim_admins")
            .select("id")
            .eq("slug", normalizedSlug)
            .maybeSingle();
          if (bySlug?.id) existingId = bySlug.id;
        }

        if (!existingId) {
          const { data: byName } = await supabase
            .from("sim_admins")
            .select("id")
            .eq("name", trimmed)
            .maybeSingle();
          if (byName?.id) existingId = byName.id;
        }

        if (existingId) {
          navigate(`/simuladores/admin/${existingId}`, { replace: true });
          return;
        }
      }

      setError(msg || "Não foi possível salvar.");
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando administradora...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <Card className="max-w-5xl rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardHeader className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/simuladores")}
            className="h-9 w-fit rounded-2xl"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <CardTitle className="text-2xl font-black" style={{ color: "#1E293F" }}>
            {isEditing ? "Editar Administradora" : "Adicionar Administradora"}
          </CardTitle>

          <div className="text-sm text-muted-foreground">
            {isEditing
              ? "Atualize a logo, descrição e identificação da administradora exibida no Hub de Simuladores."
              : "Cadastre uma nova administradora. Após salvar, você será direcionado para Gerenciar Tabelas desta administradora."}
          </div>
        </CardHeader>

        <CardContent className="space-y-7">
          {/* Identidade */}
          <section className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="space-y-3">
              <Label>Logo da administradora</Label>

              <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-[28px] border bg-slate-50 shadow-inner">
                {logoPreview ? (
                  <img src={logoPreview} alt="Prévia da logo" className="h-full w-full object-contain p-5" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ImageIcon className="h-9 w-9" />
                    <span className="text-xs font-semibold">Sem logo</span>
                  </div>
                )}
              </div>

              <label className="flex h-10 cursor-pointer items-center justify-center rounded-2xl border bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <UploadCloud className="mr-2 h-4 w-4" />
                Enviar logo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onSelectLogo(e.target.files?.[0])}
                />
              </label>

              {(logoPreview || logoFile || logoUrl) && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-full rounded-2xl"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoUrl(null);
                    setLogoPreview(null);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remover logo
                </Button>
              )}

              <p className="text-xs text-muted-foreground">
                Recomendado: PNG ou SVG com fundo transparente, até {MAX_LOGO_SIZE_MB} MB.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Nome da Administradora</Label>
                <Input
                  placeholder="Ex.: Embracon, Âncora, Maggi, HS..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <Label>Slug</Label>
                <Input
                  placeholder="ex.: embracon, ancora, maggi-consorcios"
                  value={slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Use letras, números e hífens. Em branco = sem slug.
                </div>
              </div>

              <div className="md:col-span-2">
                <Label>Descrição para o Hub</Label>
                <textarea
                  className="min-h-[104px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Ex.: Simulador exclusivo para regras da administradora..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Regras: preserva edição visual sem sobrescrever regra existente */}
          {!isEditing && (
            <section className="grid gap-4 md:grid-cols-2">
              <div className="col-span-2">
                <div className="font-semibold">Regras de Cálculo</div>
              </div>

              {/* Lance Ofertado */}
              <div>
                <Label>Base do Lance Ofertado</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={rules.lance.base_ofertado}
                  onChange={(e) =>
                    setRules((r) => ({ ...r, lance: { ...r.lance, base_ofertado: e.target.value as any } }))
                  }
                >
                  <option value="credito">Crédito</option>
                  <option value="categoria">Crédito + Taxas (valor de categoria)</option>
                  <option value="parcelas">Parcelas</option>
                </select>
              </div>
              <div>
                <Label>Modelo do Lance</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={rules.lance.modelo}
                  onChange={(e) =>
                    setRules((r) => ({ ...r, lance: { ...r.lance, modelo: e.target.value as any } }))
                  }
                >
                  <option value="percentual">Percentual</option>
                  <option value="parcela">Parcela</option>
                </select>
              </div>

              {rules.lance.modelo === "parcela" && (
                <>
                  <div>
                    <Label>Se for Parcela: Base</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={rules.lance.parcela_base ?? "contratada"}
                      onChange={(e) =>
                        setRules((r) => ({
                          ...r,
                          lance: {
                            ...r.lance,
                            parcela_base: e.target.value as any,
                            pede_prazo_original_grupo: e.target.value === "termo",
                          },
                        }))
                      }
                    >
                      <option value="contratada">Parcela Contratada</option>
                      <option value="termo">Parcela Termo (exige prazo original do grupo)</option>
                    </select>
                    {needPrazoOriginal && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Ao simular, será exigido o <strong>prazo original do grupo</strong> para calcular a parcela termo.
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-1" />
                </>
              )}

              {/* Lance Embutido */}
              <div>
                <Label>Base do Lance Embutido</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={rules.lance_embutido.base}
                  onChange={(e) =>
                    setRules((r) => ({ ...r, lance_embutido: { base: e.target.value as any } }))
                  }
                >
                  <option value="credito">Crédito</option>
                  <option value="categoria">Crédito + Taxas (valor de categoria)</option>
                </select>
              </div>
              <div className="md:col-span-1" />

              {/* Limitador */}
              <div>
                <Label>Limitador de Parcela</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={rules.limitador_parcela.existe ? "sim" : "nao"}
                  onChange={(e) =>
                    setRules((r) => ({
                      ...r,
                      limitador_parcela: { ...r.limitador_parcela, existe: e.target.value === "sim" },
                    }))
                  }
                >
                  <option value="sim">Existe</option>
                  <option value="nao">Não Existe</option>
                </select>
              </div>

              {rules.limitador_parcela.existe && (
                <>
                  <div>
                    <Label>Base do Limitador</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={rules.limitador_parcela.base ?? "categoria"}
                      onChange={(e) =>
                        setRules((r) => ({
                          ...r,
                          limitador_parcela: { ...r.limitador_parcela, base: e.target.value as any },
                        }))
                      }
                    >
                      <option value="credito">Crédito</option>
                      <option value="categoria">Valor de Categoria</option>
                      <option value="parcela_pct">% sobre a Parcela</option>
                    </select>
                  </div>
                  <div>
                    <Label>% Limitador: origem</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={rules.limitador_parcela.pct_origem ?? "tabela"}
                      onChange={(e) =>
                        setRules((r) => ({
                          ...r,
                          limitador_parcela: { ...r.limitador_parcela, pct_origem: e.target.value as any },
                        }))
                      }
                    >
                      <option value="tabela">Definido na Tabela</option>
                      <option value="adm">Padrão Adm</option>
                    </select>
                  </div>
                  {rules.limitador_parcela.pct_origem === "adm" && (
                    <div className="md:col-span-2">
                      <Label>% Padrão Adm (humanizado)</Label>
                      <Input
                        value={limitPctHuman}
                        onChange={(e) => setLimitPctHuman(e.target.value)}
                        placeholder="ex.: 0,2565"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Será salvo como decimal (ex.: 0,002565).
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Redutor pré-contratação */}
              <div>
                <Label>Redutor de Parcela Pré-Contratação</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={rules.redutor_pre_contratacao.permite ? "sim" : "nao"}
                  onChange={(e) =>
                    setRules((r) => ({
                      ...r,
                      redutor_pre_contratacao: {
                        ...r.redutor_pre_contratacao,
                        permite: e.target.value === "sim",
                      },
                    }))
                  }
                >
                  <option value="sim">Permite</option>
                  <option value="nao">Não Permite</option>
                </select>
              </div>
              {rules.redutor_pre_contratacao.permite && (
                <div>
                  <Label>Base do Redutor</Label>
                  <select
                    className="w-full h-10 border rounded-md px-3"
                    value={rules.redutor_pre_contratacao.base ?? "categoria"}
                    onChange={(e) =>
                      setRules((r) => ({
                        ...r,
                        redutor_pre_contratacao: {
                          ...r.redutor_pre_contratacao,
                          base: e.target.value as any,
                        },
                      }))
                    }
                  >
                    <option value="credito">Crédito</option>
                    <option value="categoria">Valor de Categoria</option>
                  </select>
                </div>
              )}

              {/* Seguro */}
              <div className="md:col-span-2">
                <Label>Seguro Obrigatório</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={rules.seguro.obrigatorio}
                  onChange={(e) =>
                    setRules((r) => ({ ...r, seguro: { obrigatorio: e.target.value as any } }))
                  }
                >
                  <option value="nao">Não</option>
                  <option value="sim_inicio">Sim, desde o início</option>
                  <option value="sim_apos">Sim, apenas após a contemplação</option>
                </select>
              </div>
            </section>
          )}

          {isEditing && (
            <div className="rounded-2xl border bg-slate-50/80 p-4 text-sm text-slate-600">
              Nesta edição, o CRM altera apenas identidade visual, nome, slug e descrição da administradora. As regras de cálculo permanecem preservadas.
            </div>
          )}

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={saving || uploadingLogo || !name.trim()} className="h-10 rounded-2xl px-4">
              {(saving || uploadingLogo) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {!saving && !uploadingLogo && <Save className="h-4 w-4 mr-2" />}
              {uploadingLogo ? "Enviando logo..." : isEditing ? "Salvar alterações" : "Salvar"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/simuladores")}
              disabled={saving || uploadingLogo}
              className="h-10 rounded-2xl px-4"
            >
              Cancelar
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            A logo será enviada para o bucket <strong>{LOGO_BUCKET}</strong> e a URL pública será gravada em{" "}
            <strong>sim_admins.logo_url</strong>.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
