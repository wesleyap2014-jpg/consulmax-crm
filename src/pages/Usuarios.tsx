import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ajuste o caminho se necessário

type PixKind = "cpf" | "email" | "telefone";

export default function Usuarios() {
  // -------- form state ----------
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [numero, setNumero] = useState("");
  const [pixType, setPixType] = useState<PixKind>("email");
  const [pixKey, setPixKey] = useState("");
  const [role, setRole] = useState<"admin" | "vendedor" | "viewer">("admin");

  const [uploading, setUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>("");

  // ------- helpers (máscaras) -------
  const onlyDigits = (s: string) => s.replace(/\D/g, "");

  const maskPhone = (v: string) => {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
  };

  const maskCPF = (v: string) => {
    const d = onlyDigits(v).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  };

  const maskCEP = (v: string) => {
    const d = onlyDigits(v).slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, "$1-$2");
  };

  // ------- CEP -> ViaCEP --------
  useEffect(() => {
    const raw = onlyDigits(cep);
    if (raw.length !== 8) return;

    let canceled = false;
    (async () => {
      try {
        const r = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
        const data = await r.json();
        if (canceled || data?.erro) return;

        setLogradouro(data.logradouro || "");
        setBairro(data.bairro || "");
        setCidade(data.localidade || "");
        setUf((data.uf || "").toUpperCase());
        // número: usuário digita; aceita "S/N"
      } catch (e) {
        // silencioso
      }
    })();

    return () => { canceled = true; };
  }, [cep]);

  // ------- PIX auto-preenchimento -------
  const cpfDigits = useMemo(() => onlyDigits(cpf), [cpf]);
  const phoneDigits = useMemo(() => onlyDigits(phone), [phone]);

  useEffect(() => {
    if (pixType === "email") setPixKey(email || "");
    if (pixType === "telefone") setPixKey(phoneDigits || "");
    if (pixType === "cpf") setPixKey(cpfDigits || "");
  }, [pixType, email, phoneDigits, cpfDigits]);

  // ------- upload foto -------
  async function uploadPhoto(authUserId: string) {
    if (!photoFile) return "";
    try {
      setUploading(true);
      const fileExt = photoFile.name.split(".").pop() || "jpg";
      const path = `${authUserId}/${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from("avatars").upload(path, photoFile, {
        upsert: true,
        contentType: photoFile.type,
      });
      if (error) throw error;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return data.publicUrl || "";
    } finally {
      setUploading(false);
    }
  }

  // ------- submit -------
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const auth_user_id = prompt("Cole o auth_user_id (do convite Aceito em Auth > Users):")?.trim();
    if (!auth_user_id) return;

    const publicPhotoUrl = await uploadPhoto(auth_user_id);
    if (publicPhotoUrl) setPhotoUrl(publicPhotoUrl);

    // INSERT no public.users
    const payload = {
      auth_user_id,
      nome,
      email,
      phone,
      cep: onlyDigits(cep),
      logradouro,
      bairro,
      cidade,
      uf: uf.toUpperCase(),
      numero,                     // pode ser "S/N"
      pix_type: pixType,
      pix_key: pixKey,
      role,                       // mantendo seu fluxo atual
      photo_url: publicPhotoUrl || null,
      // Se você guarda CPF criptografado no back, continue usando sua função RPC.
      // Aqui, só guardamos a chave PIX (digits do CPF se pixType=cpf).
    };

    const { error } = await supabase.from("users").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    alert("Usuário cadastrado com sucesso!");
    // Limpa o form
    setNome(""); setEmail(""); setPhone("");
    setCpf(""); setCep(""); setLogradouro(""); setBairro(""); setCidade(""); setUf("");
    setNumero(""); setPixType("email"); setPixKey(""); setRole("admin"); setPhotoFile(null); setPhotoUrl("");
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h2>Novo Usuário (Vendedor)</h2>
      <form onSubmit={onSubmit}>
        <div className="grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <input
            placeholder="Nome completo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <input
            placeholder="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="Telefone (xx) 9xxxx-xxxx"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
          />

          <input
            placeholder="CPF (xxx.xxx.xxx-xx)"
            value={cpf}
            onChange={(e) => setCpf(maskCPF(e.target.value))}
          />
          <input
            placeholder="CEP (xxxxx-xxx)"
            value={cep}
            onChange={(e) => setCep(maskCEP(e.target.value))}
          />
          <input
            placeholder="Logradouro"
            value={logradouro}
            onChange={(e) => setLogradouro(e.target.value)}
          />

          <input
            placeholder="Bairro"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
          />
          <input
            placeholder="Cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
          />
          <input
            placeholder="UF"
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase().slice(0,2))}
          />

          <input
            placeholder="Número (aceita S/N)"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />

          <select value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="admin">Admin</option>
            <option value="vendedor">Vendedor</option>
            <option value="viewer">Viewer</option>
          </select>

          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={pixType}
              onChange={(e) => setPixType(e.target.value as PixKind)}
            >
              <option value="email">PIX por E-mail</option>
              <option value="telefone">PIX por Telefone</option>
              <option value="cpf">PIX por CPF</option>
            </select>
            <input
              placeholder="Chave PIX (preenchida automaticamente)"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
            />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label>Foto do usuário (jpg, png, webp)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            />
            {uploading && <small>Enviando foto…</small>}
            {photoUrl && (
              <div style={{ marginTop: 8 }}>
                <img src={photoUrl} alt="foto" style={{ height: 80, borderRadius: 8 }} />
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button type="submit">Cadastrar</button>
        </div>
      </form>
    </div>
  );
}
