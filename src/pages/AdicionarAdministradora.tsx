// src/pages/AdicionarAdministradora.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

/* ================= Helpers ================= */
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

  // Identidade
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string>("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Regras
  const [rules, setRules] = useState<Rules>(defaultRules);
  const [limitPctHuman, setLimitPctHuman] = useState(
    formatPctInputFromDecimal(defaultRules.limitador_parcela.pct_padrao_adm ?? 0)
  );

  // Estado
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // slug automático
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

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

  async function handleSave() {
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da administradora.");
      return;
    }

    // normaliza regras antes de salvar
    const normalizedRules: Rules = {
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

    const payload = {
      name: trimmed,
      slug: slugify(slug.trim()) || null,
      rules: normalizedRules,
    };

    setSaving(true);

    const { data, error: insErr } = await supabase
      .from("sim_admins")
      .insert(payload as any)
      .select("id")
      .single();

    setSaving(false);

    if (!insErr && data?.id) {
      // sucesso → abre gerenciador de tabelas
      navigate(`/simuladores/${data.id}?setup=1`, { replace: true });
      return;
    }

    // colisão de unique → abre existente por slug|nome
    const isUniqueViolation =
      insErr?.code === "23505" || (insErr?.message || "").toLowerCase().includes("duplicate key");

    if (isUniqueViolation) {
      let existingId: string | null = null;

      const normalizedSlug = payload.slug;
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
        navigate(`/simuladores/${existingId}?setup=1`, { replace: true });
        return;
      }
    }

    setError(insErr?.message || "Não foi possível salvar.");
  }

  return (
    <div className="p-6">
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Adicionar Administradora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Cadastre uma nova administradora. Após salvar, você será direcionado para
            <strong> Gerenciar Tabelas</strong> desta administradora.
          </div>

          {/* Identidade */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome da Administradora</Label>
              <Input
                placeholder="Ex.: Embracon, Âncora, Maggi, HS..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Slug (opcional)</Label>
              <Input
                placeholder="ex.: embracon, ancora, maggi-consorcios"
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">
                Use letras, números e hífens. Em branco = sem slug.
              </div>
            </div>
          </div>

          {/* Regras */}
          <div className="grid gap-4 md:grid-cols-2">
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
                      Ao simular, será exigido o <strong>prazo original do grupo</strong> para
                      calcular a parcela termo.
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
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="h-10 rounded-2xl px-4">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/simuladores")}
              disabled={saving}
              className="h-10 rounded-2xl px-4"
            >
              Cancelar
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Após salvar, você será levado a <strong>Simuladores</strong> → <strong>Gerenciar Tabelas</strong> da
            nova administradora.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
