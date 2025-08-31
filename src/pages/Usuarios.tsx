// src/pages/Usuarios.tsx
import * as React from "react";
import { useForm } from "react-hook-form";

type Role = "admin" | "vendedor" | "viewer";
type PixType = "cpf" | "email" | "celular" | "aleatoria";

type Form = {
  nome: string;
  email: string;
  telefone?: string;
  cpf?: string;

  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;

  role: Role;
  pixType: PixType;
  pixKey?: string;
};

export default function Usuarios() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
    reset,
  } = useForm<Form>({
    defaultValues: {
      role: "viewer",
      pixType: "aleatoria",
    },
  });

  const w = watch();

  // --------- Auto-preencher PIX key quando possível ----------
  React.useEffect(() => {
    if ((!w.pixKey || w.pixKey === "") && w.pixType === "cpf" && w.cpf) {
      setValue("pixKey", String(w.cpf).replace(/\D/g, ""));
    }
    if ((!w.pixKey || w.pixKey === "") && w.pixType === "email" && w.email) {
      setValue("pixKey", w.email);
    }
    if (
      (!w.pixKey || w.pixKey === "") &&
      w.pixType === "celular" &&
      w.telefone
    ) {
      setValue("pixKey", String(w.telefone).replace(/\D/g, ""));
    }
    // 'aleatoria' => o usuário digita manualmente
  }, [w.pixType, w.cpf, w.email, w.telefone, w.pixKey, setValue]);

  // --------- Autopreencher endereço pelo CEP (ViaCEP) ----------
  React.useEffect(() => {
    const raw = (w?.cep || "").replace(/\D/g, "");
    if (raw.length !== 8) return;

    let canceled = false;
    (async () => {
      try {
        const r = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
        const d = await r.json();
        if (canceled || d?.erro) return;

        setValue("logradouro", d.logradouro || "");
        setValue("bairro", d.bairro || "");
        setValue("cidade", d.localidade || "");
        setValue("uf", d.uf || "");
      } catch {
        // silencioso
      }
    })();

    return () => {
      canceled = true;
    };
  }, [w?.cep, setValue]);

  // --------- Envio para a rota serverless /api/users/create ----------
  const onSubmit = async (f: Form) => {
    try {
      const resp = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: f.nome,
          email: f.email,
          telefone: f.telefone ?? null,
          cpf: f.cpf ?? null, // será criptografado na RPC
          role: f.role,
          endereco: {
            cep: f.cep ?? null,
            logradouro: f.logradouro ?? null,
            numero: f.numero ?? null,
            bairro: f.bairro ?? null,
            cidade: f.cidade ?? null,
            uf: f.uf ?? null,
          },
          pixType: f.pixType,
          pixKey: f.pixKey ?? null,
          scopes: ["leads", "oportunidades", "usuarios"],
        }),
      });

      const text = await resp.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!resp.ok) {
        throw new Error(json?.error || text || "Falha ao criar usuário");
      }

      alert(`Usuário criado!\nSenha provisória: ${json?.tempPassword}`);
      reset({ role: "viewer", pixType: "aleatoria" } as any);
    } catch (e: any) {
      alert(e?.message || "Erro inesperado");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-extrabold">Novo Usuário</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 md:grid-cols-3">
        {/* Dados principais */}
        <input className="input" placeholder="Nome" {...register("nome", { required: true })} />
        <input className="input" placeholder="E-mail" type="email" {...register("email", { required: true })} />
        <input className="input" placeholder="Telefone" {...register("telefone")} />
        <input className="input" placeholder="CPF" {...register("cpf")} />

        {/* Endereço */}
        <input className="input" placeholder="CEP" {...register("cep")} />
        <input className="input" placeholder="Logradouro" {...register("logradouro")} />
        <input className="input" placeholder="Número" {...register("numero")} />
        <input className="input" placeholder="Bairro" {...register("bairro")} />
        <input className="input" placeholder="Cidade" {...register("cidade")} />
        <input className="input" placeholder="UF" {...register("uf")} />

        {/* Perfil e PIX */}
        <select className="input" {...register("role", { required: true })}>
          <option value="admin">Admin</option>
          <option value="vendedor">Vendedor</option>
          <option value="viewer">Viewer</option>
        </select>

        <select className="input" {...register("pixType", { required: true })}>
          <option value="cpf">PIX por CPF</option>
          <option value="email">PIX por E-mail</option>
          <option value="celular">PIX por Celular</option>
          <option value="aleatoria">Chave aleatória</option>
        </select>

        <input
          className="input md:col-span-1"
          placeholder="Pix (se aleatória, preencha aqui)"
          {...register("pixKey")}
        />

        <button className="btn md:col-span-3" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Cadastrando…" : "Cadastrar"}
        </button>
      </form>

      {/* estilos simples para garantir visual mínimo mesmo sem Tailwind */}
      <style>{`
        .input{
          border:1px solid #e5e7eb; border-radius:12px; padding:10px;
          outline:none; background:#fff; width:100%;
        }
        .input:focus{ border-color:#A11C27; box-shadow:0 0 0 2px rgba(161,28,39,0.15); }
        .btn{
          background:#A11C27; color:white; border-radius:14px;
          padding:12px 16px; font-weight:700; width:100%;
        }
        .btn:disabled{ opacity:.6; cursor:not-allowed; }
      `}</style>
    </div>
  );
}
