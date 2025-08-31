import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

export default function Header() {
  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-white shadow">
      <div className="font-extrabold text-[#1E293F]">
        Consulmax • <span className="text-[#A11C27]">Maximize as suas conquistas</span>
      </div>
      <button
        onClick={onLogout}
        className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
        title="Encerrar sessão"
      >
        Sair
      </button>
    </header>
  );
}
