import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, Clock, Users, MapPin } from "lucide-react";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

type UserProfile = {
  id: string;
  auth_user_id: string | null;
  nome: string | null;
  email: string | null;
  role: string | null;
  user_role: string | null;
};

type Employee = {
  id: string;
  user_id: string | null;
  auth_user_id: string | null;
  nome: string;
  cpf_digits: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  setor: string | null;
  jornada_diaria_minutos: number;
  intervalo_minutos: number;
  ativo: boolean;
};

type TimeEntry = {
  id: string;
  employee_id: string;
  entry_type: "entrada" | "saida";
  entry_at: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  status: string;
  source: string;
  observacao: string | null;
  hr_employees?: {
    nome: string;
    cargo: string | null;
    setor: string | null;
  } | null;
};

function formatDateTimeBR(value?: string) {
  if (!value) return "—";
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

function formatCPF(cpf: string) {
  const d = (cpf || "").replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function mapUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function RH() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  const selectedEmployee = useMemo(() => {
    if (selectedEmployeeId === "all") return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  async function load() {
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      setAuthUserId(uid);

      if (!uid) {
        setProfile(null);
        setIsAdmin(false);
        setEmployees([]);
        setEntries([]);
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("id, auth_user_id, nome, email, role, user_role")
        .eq("auth_user_id", uid)
        .maybeSingle();

      const userProfile = userData as UserProfile | null;
      setProfile(userProfile);

      const admin =
        userProfile?.role === "admin" || userProfile?.user_role === "admin";

      setIsAdmin(admin);

      let employeesQuery = supabase
        .from("hr_employees")
        .select("*")
        .order("nome", { ascending: true });

      if (!admin) {
        employeesQuery = employeesQuery.eq("auth_user_id", uid);
      }

      const { data: empData, error: empError } = await employeesQuery;

      if (empError) throw empError;

      const empList = (empData || []) as Employee[];
      setEmployees(empList);

      let entriesQuery = supabase
        .from("hr_time_entries")
        .select(
          `
          *,
          hr_employees (
            nome,
            cargo,
            setor
          )
        `
        )
        .order("entry_at", { ascending: false })
        .limit(200);

      if (!admin && empList[0]?.id) {
        entriesQuery = entriesQuery.eq("employee_id", empList[0].id);
      }

      if (admin && selectedEmployeeId !== "all") {
        entriesQuery = entriesQuery.eq("employee_id", selectedEmployeeId);
      }

      const { data: entriesData, error: entriesError } = await entriesQuery;

      if (entriesError) throw entriesError;

      setEntries((entriesData || []) as TimeEntry[]);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar RH.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId]);

  const entradaCount = entries.filter((e) => e.entry_type === "entrada").length;
  const saidaCount = entries.filter((e) => e.entry_type === "saida").length;

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-5 bg-slate-50">
      <div
        className="rounded-3xl p-5 md:p-6 text-white shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})`,
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">RH</h1>
            <p className="text-white/80 mt-1">
              Ponto, banco de horas, PDI, feedbacks e candidatos.
            </p>
          </div>

          <Button
            type="button"
            onClick={load}
            variant="secondary"
            className="rounded-xl"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5" style={{ color: C.ruby }} />
              <div>
                <div className="text-sm text-slate-500">Colaboradores</div>
                <div className="text-2xl font-bold">{employees.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5" style={{ color: C.navy }} />
              <div>
                <div className="text-sm text-slate-500">Registros</div>
                <div className="text-2xl font-bold">{entries.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-slate-500">Entradas</div>
            <div className="text-2xl font-bold">{entradaCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-slate-500">Saídas</div>
            <div className="text-2xl font-bold">{saidaCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle>Registros de Ponto</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              {isAdmin
                ? "Visualização administrativa dos registros."
                : "Visualização dos seus próprios registros."}
            </p>
          </div>

          {isAdmin && (
            <div className="w-full md:w-72">
              <Select
                value={selectedEmployeeId}
                onValueChange={setSelectedEmployeeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os colaboradores</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {selectedEmployee && (
            <div className="mb-4 rounded-2xl bg-slate-50 border p-4 text-sm">
              <b>{selectedEmployee.nome}</b>
              <div className="text-slate-600">
                CPF: {formatCPF(selectedEmployee.cpf_digits)} • Cargo:{" "}
                {selectedEmployee.cargo || "—"} • Setor:{" "}
                {selectedEmployee.setor || "—"}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Nenhum registro encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    {isAdmin && <th className="text-left p-3">Colaborador</th>}
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-left p-3">Data/Hora</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Localização</th>
                  </tr>
                </thead>

                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-t bg-white">
                      {isAdmin && (
                        <td className="p-3">
                          <div className="font-medium">
                            {entry.hr_employees?.nome || "—"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {entry.hr_employees?.cargo || "—"}
                          </div>
                        </td>
                      )}

                      <td className="p-3">
                        <Badge
                          className="rounded-full"
                          style={{
                            backgroundColor:
                              entry.entry_type === "entrada" ? C.navy : C.ruby,
                            color: "#fff",
                          }}
                        >
                          {entry.entry_type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>

                      <td className="p-3">{formatDateTimeBR(entry.entry_at)}</td>

                      <td className="p-3">
                        <Badge variant="outline" className="rounded-full">
                          {entry.status}
                        </Badge>
                      </td>

                      <td className="p-3">
                        <a
                          href={mapUrl(Number(entry.latitude), Number(entry.longitude))}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                          style={{ color: C.ruby }}
                        >
                          <MapPin className="h-4 w-4" />
                          Ver mapa
                        </a>

                        {entry.accuracy != null && (
                          <div className="text-xs text-slate-500 mt-1">
                            Precisão: {Math.round(Number(entry.accuracy))}m
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
