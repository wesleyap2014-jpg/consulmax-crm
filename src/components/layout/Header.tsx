// src/components/layout/Header.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
// use o alias que você já usa no projeto
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  name: string;
  email: string;
  avatarUrl?: string | null;
};

function getInitials(name?: string, email?: string) {
  const base = (name || email || "").trim();
  if (!base) return "U";
  const parts = base.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Header() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    avatarUrl: null,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      // 1) usuário do Auth
      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp?.user;
      if (!user) return;

      let name =
        (user.user_metadata as any)?.nome ||
        (user.user_metadata as any)?.full_name ||
        user.email ||
        "";
      let email = user.email || "";

      // 2) perfil na tabela public.users (nome/arquivo do avatar)
      const { data: row } = await supabase
        .from("users")
        .select("nome, avatar_url")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      let avatarUrl: string | null | undefined =
        (user.user_metadata as any)?.avatar_url || row?.avatar_url || null;
      name = row?.nome || name;

      // 3) se vier caminho de Storage, transformar em URL pública
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        // troque "avatars" se seu bucket tiver outro nome
        const pub = supabase.storage.from("avatars").getPublicUrl(avatarUrl);
        avatarUrl = pub.data.publicUrl;
      }

      if (active) setProfile({ name, email, avatarUrl });
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const initials = useMemo(
    () => getInitials(profile.name, profile.email),
    [profile.name, profile.email]
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-50 h-14 border-b bg-white">
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4">
        {/* Marca */}
        <div className="flex items-center gap-3 font-extrabold text-slate-900">
          <div className="h-8 w-8 rounded-full bg-[#A11C27]" />
          <div>
            Consulmax •{" "}
            <span className="text-[#A11C27]">Maximize as suas conquistas</span>
          </div>
        </div>

        {/* Usuário + Sair */}
        <div className="flex items-center gap-3">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name || "avatar"}
              className="h-9 w-9 rounded-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-700">
              {initials}
            </div>
          )}

          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-sm font-semibold text-slate-900">
              {profile.name || "Usuário"}
            </span>
            <span className="text-xs text-slate-500">{profile.email}</span>
          </div>

          <button
            onClick={handleSignOut}
            className="ml-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            title="Sair"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
