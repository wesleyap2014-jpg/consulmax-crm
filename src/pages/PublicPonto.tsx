import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Clock, LogIn, LogOut, ShieldCheck } from "lucide-react";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function formatDateTimeBR(value?: string) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Porto_Velho",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

type RegisterAction = "entrada" | "saida";

type RpcResult = {
  ok: boolean;
  message: string;
  employee_name?: string;
  entry_type?: RegisterAction;
  entry_at?: string;
  wait_minutes?: number;
};

export default function PublicPonto() {
  const [cpf, setCpf] = useState("");
  const [loadingAction, setLoadingAction] = useState<RegisterAction | null>(null);
  const [result, setResult] = useState<RpcResult | null>(null);

  const cpfDigits = useMemo(() => onlyDigits(cpf), [cpf]);

  async function getLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Seu navegador não suporta geolocalização."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }

  async function registrar(action: RegisterAction) {
    setResult(null);

    if (cpfDigits.length !== 11) {
      setResult({
        ok: false,
        message: "Informe um CPF válido com 11 dígitos.",
      });
      return;
    }

    setLoadingAction(action);

    try {
      const position = await getLocation();

      const { latitude, longitude, accuracy } = position.coords;

      if (latitude == null || longitude == null) {
        setResult({
          ok: false,
          message: "Não foi possível capturar sua localização. O ponto não foi registrado.",
        });
        return;
      }

      const deviceInfo = [
        navigator.userAgent,
        `platform=${navigator.platform || ""}`,
        `language=${navigator.language || ""}`,
      ].join(" | ");

      const { data, error } = await supabase.rpc("hr_register_time", {
        p_cpf: cpfDigits,
        p_action: action,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy: accuracy ?? null,
        p_device_info: deviceInfo,
      });

      if (error) {
        setResult({
          ok: false,
          message: error.message || "Erro ao registrar ponto.",
        });
        return;
      }

      setResult(data as RpcResult);
    } catch (err: any) {
      let msg = "A localização é obrigatória para registrar o ponto.";

      if (err?.code === 1) {
        msg = "Você negou a localização. Por segurança, o ponto não poderá ser registrado.";
      } else if (err?.code === 2) {
        msg = "Não foi possível obter sua localização. Verifique o GPS/internet e tente novamente.";
      } else if (err?.code === 3) {
        msg = "Tempo esgotado ao buscar localização. Tente novamente.";
      } else if (err?.message) {
        msg = err.message;
      }

      setResult({
        ok: false,
        message: msg,
      });
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div
      className="min-h-screen px-4 py-8 flex items-center justify-center"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(161,28,39,.18), transparent 32%), radial-gradient(circle at bottom right, rgba(30,41,63,.20), transparent 35%), #f8fafc",
      }}
    >
      <Card className="w-full max-w-lg border-white/70 shadow-2xl rounded-3xl overflow-hidden bg-white/90 backdrop-blur">
        <CardHeader
          className="text-white"
          style={{
            background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})`,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <Clock className="h-6 w-6" />
            </div>

            <div>
              <CardTitle className="text-2xl">Registro de Ponto</CardTitle>
              <p className="text-sm text-white/80">
                Consulmax • Controle com geolocalização
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-5">
          <div className="rounded-2xl border bg-slate-50 p-4 flex gap-3">
            <MapPin className="h-5 w-5 mt-0.5" style={{ color: C.ruby }} />
            <div className="text-sm text-slate-700">
              Para registrar o ponto, é obrigatório permitir o acesso à sua localização.
              Caso a localização seja negada, o registro não será realizado.
            </div>
          </div>

          <div className="space-y-2">
            <Label>CPF do colaborador</Label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              className="h-12 text-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              type="button"
              disabled={!!loadingAction}
              onClick={() => registrar("entrada")}
              className="h-12 rounded-xl text-white"
              style={{ backgroundColor: C.navy }}
            >
              {loadingAction === "entrada" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              Registrar Entrada
            </Button>

            <Button
              type="button"
              disabled={!!loadingAction}
              onClick={() => registrar("saida")}
              className="h-12 rounded-xl text-white"
              style={{ backgroundColor: C.ruby }}
            >
              {loadingAction === "saida" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Registrar Saída
            </Button>
          </div>

          {result && (
            <div
              className={[
                "rounded-2xl border p-4",
                result.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-red-50 border-red-200 text-red-900",
              ].join(" ")}
            >
              <div className="flex gap-3">
                <ShieldCheck className="h-5 w-5 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    {result.ok ? "Registro processado" : "Não foi possível registrar"}
                  </div>

                  <div className="text-sm mt-1">{result.message}</div>

                  {result.ok && (
                    <div className="text-sm mt-3 space-y-1">
                      {result.employee_name && (
                        <div>
                          <b>Colaborador:</b> {result.employee_name}
                        </div>
                      )}

                      {result.entry_type && (
                        <div>
                          <b>Tipo:</b>{" "}
                          {result.entry_type === "entrada" ? "Entrada" : "Saída"}
                        </div>
                      )}

                      {result.entry_at && (
                        <div>
                          <b>Data/hora:</b> {formatDateTimeBR(result.entry_at)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500 text-center pt-2">
            Ao registrar o ponto, você autoriza a captação da localização no momento
            do registro para fins de controle de jornada.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
