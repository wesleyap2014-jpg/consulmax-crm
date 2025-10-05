// src/pages/AdicionarAdministradora.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// helper para gerar/limpar slug
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    // remove diacríticos
    .replace(/\p{Diacritic}/gu, "")
    // & -> e
    .replace(/&/g, "e")
    // qualquer coisa que não seja a-z 0-9 vira "-"
    .replace(/[^a-z0-9]+/g, "-")
    // remove "-" no começo/fim
    .replace(/^-+|-+$/g, "")
    // colapsa múltiplos "-"
    .replace(/-{2,}/g, "-");
}

export default function AdicionarAdministradora() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string>("");
  const [slugTouched, setSlugTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // gera slug automaticamente a partir do nome (se o usuário ainda não mexeu no campo slug)
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

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

    // normaliza slug (se o usuário limpou, vira null)
    const normalizedSlug = slugify(slug.trim());
    const payload: { name: string; slug: string | null } = {
      name: trimmed,
      slug: normalizedSlug || null,
    };

    setSaving(true);

    // 1) tenta inserir
    const ins = await supabase
      .from("sim_admins")
      .insert(payload)
      .select("id, slug")
      .single();

    // 1a) sucesso → abre setup
    if (ins.data && !ins.error) {
      setSaving(false);
      const key = ins.data.slug || ins.data.id;
      navigate(`/simuladores/${key}?setup=1`, { replace: true });
      return;
    }

    // 1b) duplicado → tenta achar existente por nome/slug
    const isUniqueViolation =
      ins.error?.code === "23505" ||
      (ins.error?.message || "").toLowerCase().includes("duplicate key");

    if (isUniqueViolation) {
      // procura por slug (se houver) primeiro
      let existingId: string | null = null;
      let existingSlug: string | null = null;

      if (payload.slug) {
        const { data: bySlug } = await supabase
          .from("sim_admins")
          .select("id, slug")
          .eq("slug", payload.slug)
          .maybeSingle();
        if (bySlug?.id) {
          existingId = bySlug.id;
          existingSlug = bySlug.slug ?? null;
        }
      }

      if (!existingId) {
        const { data: byName } = await supabase
          .from("sim_admins")
          .select("id, slug")
          .eq("name", trimmed)
          .maybeSingle();
        if (byName?.id) {
          existingId = byName.id;
          existingSlug = byName.slug ?? null;
        }
      }

      setSaving(false);

      if (existingId) {
        // já existe → abre a existente (sem setup forçado)
        const key = existingSlug || existingId;
        navigate(`/simuladores/${key}`, { replace: true });
        return;
      }

      // se não achou por algum motivo, avisa
      setError("Essa administradora já existe.");
      return;
    }

    // 1c) outros erros
    setSaving(false);
    setError(ins.error?.message || "Não foi possível salvar.");
  }

  return (
    <div className="p-6">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Adicionar Administradora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-sm text-muted-foreground">
            Cadastre uma nova administradora para usar no Simulador. Após criar, você poderá
            configurar o comportamento de cálculo e as Tabelas.
          </div>

          <div className="grid gap-3">
            <div>
              <Label>Nome da Administradora</Label>
              <Input
                placeholder="Ex.: Embracon, Âncora, Maggi, HS..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <Label>Slug (gerado do nome; você pode editar)</Label>
              <Input
                placeholder="ex.: embracon, ancora, maggi-consorcios"
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">
                Use apenas letras, números e hífens. Deixe em branco para não definir slug.
              </div>
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="h-10 rounded-2xl px-4"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/simuladores")}
              className="h-10 rounded-2xl px-4"
            >
              Cancelar
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Dica: após salvar, você será levado à tela da administradora para configurar o simulador.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
