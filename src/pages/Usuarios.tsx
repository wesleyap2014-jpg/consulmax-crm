// src/pages/Usuarios.tsx
import * as React from "react";
import { useForm } from "react-hook-form";

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
  role: "admin" | "vendedor" | "viewer";
  pixType: "cpf" | "email" | "celular" | "aleatoria";
  pixKey?: string;
};

export default function Usuarios() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<Form>({
    defaultValues: { role: "viewer", pixType: "aleatoria" },
  });

  const w = watch();

  // Auto-preenche PIX key quando possível
  React.useEffect(() => {
    if (!w) return;
    if ((!w.pixKey || w.pixKey === "") && w.pixType === "cpf" && w.cpf) {
      setValue("pixKey", String(w.cpf).replace(/\D/g, ""));
    }
    if ((!w.pixKey || w.pixKey === "") && w.pixType === "email" && w.email) {
      setValue("pixKey", w.email);
    }
    if ((!w.pixKey || w.pixKey === "") && w.pixType === "celular" && w.telefone) {
      setValue("pixKey", String(w.telefone).replace(/\D/g, ""));
    }
  }, [w?.pixType, w?.cpf, w?.email, w?.telefone, w?.pixKey, setValue]);

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
          pixKey: f.pixKey ?? null, // se vazio, o back também tenta completar
          scopes: ["leads", "oportunidades", "usuarios"],
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Falha ao criar usuário");
      alert(`Usuário criado!\nSenha provisória: ${json.tempPassword}`);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-extrabold">Novo Usuário</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 md:grid-cols-3">
        <input className="input" placeholder="Nome" {...register("nome", { required: true })} />
        <input className="input" placeholder="E-mail" type="email" {...register("email", { required: true })} />
        <input className="input" placeholder="Telefone" {...register("telefone")} />

        {/* CPF novo */}
        <input className="input" placeholder="CPF" {...register("cpf")} />

        <input className="input" placeholder="CEP" {...register("cep")} />
        <input className="input" placeholder="Logradouro" {...register("logradouro")} />
        <input className="input" placeholder="Número" {...register("numero")} />
        <input className="input" placeholder="Bairro" {...register("bairro")} />
        <input className="input" placeholder="Cidade" {...register("cidade")} />
        <input className="input" placeholder="UF" {...register("uf")} />

        <select className="input" {...register("role", { required: true })}>
          <option value="admin">Admin</option>
          <option value="vendedor">Vendedor</option>
          <option value="viewer">Viewer</option>
        </select>

        <select className="input" {...register("pixType", { required: true })}>
          <option value="cpf">CPF</option>
          <option value="email">E-mail</option>
          <option value="celular">Celular</option>
          <option value="aleatoria">Chave aleatória</option>
        </select>

        <input
          className="input md:col-span-2"
          placeholder="Pix (se aleatória, preencha aqui)"
          {...register("pixKey")}
        />

        <button className="btn md:col-span-3" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Cadastrando…" : "Cadastrar"}
        </button>
      </form>

      {/* estilos simples, caso não esteja usando seus componentes de UI aqui */}
      <style>{`
        .input{border:1px solid #e5e7eb;border-radius:12px;padding:10px}
        .btn{background:#A11C27;color:white;border-radius:14px;padding:10px 14px;font-weight:700}
      `}</style>
    </div>
  );
}
