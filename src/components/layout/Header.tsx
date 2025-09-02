// src/components/layout/Header.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // mantenha seu caminho

type ProfileRow = {
  nome?: string | null;
  photo_url?: string | null;   // ajuste o nome da coluna se for diferente
};

function initialsFrom(name?: string | null) {
  if (!name) return "U";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function Header() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      const { data: u } = await supabase.auth.getUser();
      const user = u?.user || null;

      if (!mounted) return;
      setEmail(user?.email ?? null);

      // nome/avatar via user_metadata (fallback)
      const metaName =
        (user?.user_metadata as any)?.name ||
        (user?.user_metadata as any)?.full_name ||
        (user?.user_metadata as any)?.user_name ||
        null;
      const metaAvatar =
        (user?.user_metadata as any)?.avatar_url ||
        (user?.user_metadata as any)?.picture ||
        null;

      let nameToUse: string | null = metaName;
      let avatarToUse: string | null = metaAvatar;

      // tenta tabela "users" para um perfil mais completo
      if (user?.id) {
        const { data: row, error } = await supabase
          .from("users")
          .select("nome, photo_url")
          .eq("auth_user_id", user.id)
          .maybeSingle<ProfileRow>();

        if (!error && row) {
          if (row.nome) nameToUse = row.nome;

          // se photo_url for apenas um path do bucket, gera URL pública
          if (row.photo_url) {
            if (/^https?:\/\//i.test(row.photo_url)) {
              avatarToUse = row.photo_url;
            } else {
              // ajuste o nome do bucket se for diferente de "avatars"
              const { data: pub } = supabase.storage
                .from("avatars")
                .getPublicUrl(row.photo_url);
              avatarToUse = pub?.publicUrl || row.photo_url;
            }
          }
        }
      }

      if (mounted) {
        setDisplayName(nameToUse || user?.email || "Usuário");
        setAvatarUrl(avatarToUse || null);
        setLoading(false);
      }
    }

    load();

    // atualiza quando logar/deslogar
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      mounted = false;
      sub.subscription?.unsubscribe();
    };
  }, []);

  const initials = useMemo(() => initialsFrom(displayName), [displayName]);

  return (
    <header className="sticky top-0 z-50 h-14 bg-white shadow-sm">
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4">
        {/* Marca/Logo */}
        <div className="flex items-center gap-3 font-extrabold text-slate-900">
          <span className="inline-block h-8 w-8 rounded-full bg-[#A11C27]" />
          <span>
            Consulmax •{" "}
            <span className="text-[#A11C27]">Maximize as suas conquistas</span>
          </span>
        </div>

        {/* Badge do usuário logado */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-slate-200">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-200 text-sm font-semibold text-slate-700">
                {loading ? "…" : initials}
              </div>
            )}
          </div>

          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">
              {loading ? "Carregando…" : displayName}
            </div>
            <div className="text-xs text-slate-500">
              {loading ? null : email}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
