// src/pages/AdicionarAdministradora.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function AdicionarAdministradora() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da administradora.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("sim_admins")
      .insert({ name: trimmed }) // compatível com seu schema atual (id,name)
      .select("id")
      .single();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    // volta para o simulador
    navigate("/simuladores", { replace: true });
  }

  return (
    <div className="p-6">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Adicionar Administradora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-sm text-muted-foreground">
            Cadastre uma nova administradora para usar no Simulador. Depois você poderá
            criar/ajustar as <strong>Tabelas</strong> em <em>Simuladores → Gerenciar Tabelas</em>.
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
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="h-10 rounded-2xl px-4">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
            <Button variant="secondary" onClick={() => navigate("/simuladores")} className="h-10 rounded-2xl px-4">
              Cancelar
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Dica: após salvar, use <em>Gerenciar Tabelas</em> para cadastrar os critérios (segmentos, prazos, taxas).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
