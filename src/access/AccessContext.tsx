import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  buildFullPermissionMatrix,
  guideKeyForPath,
  permissionAllowed,
  type PermissionMatrix,
} from "./permissionCatalog";

type AccessProfileRow = {
  id: string;
  name: string;
  description?: string | null;
  permissions: PermissionMatrix;
  is_active: boolean;
  is_system?: boolean;
};

type CurrentUserAccess = {
  id: string;
  auth_user_id: string;
  nome: string;
  role?: string | null;
  scopes?: string[] | null;
  is_active?: boolean | null;
  unit_id?: string | null;
  hierarchy_level?: string | null;
};

export type UserAccessAssignment = {
  user_id: string;
  access_profile_id?: string | null;
  partner_category_id?: string | null;
  partner_category_since?: string | null;
};

type AccessContextValue = {
  loading: boolean;
  error: string | null;
  user: CurrentUserAccess | null;
  assignment: UserAccessAssignment | null;
  accessProfile: AccessProfileRow | null;
  legacyMode: boolean;
  isAdmin: boolean;
  canViewGuide: (guideKey: string) => boolean;
  canInfo: (guideKey: string, permissionKey: string) => boolean;
  canAction: (guideKey: string, permissionKey: string) => boolean;
  canAccessPath: (pathname: string) => boolean;
  refresh: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue | null>(null);
const FULL_LEGACY = buildFullPermissionMatrix();

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUserAccess | null>(null);
  const [assignment, setAssignment] = useState<UserAccessAssignment | null>(null);
  const [accessProfile, setAccessProfile] = useState<AccessProfileRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await supabase.auth.getUser();
      const authUser = auth.data.user;
      if (auth.error) throw auth.error;
      if (!authUser) {
        setUser(null);
        setAssignment(null);
        setAccessProfile(null);
        return;
      }

      const userRes = await supabase
        .from("users")
        .select("id,auth_user_id,nome,role,scopes,is_active,unit_id,hierarchy_level")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();

      if (userRes.error) throw userRes.error;
      const crmUser = (userRes.data || null) as CurrentUserAccess | null;
      setUser(crmUser);

      if (!crmUser?.id) {
        setAssignment(null);
        setAccessProfile(null);
        return;
      }

      const assignmentRes = await supabase
        .from("user_access_assignments")
        .select("user_id,access_profile_id,partner_category_id,partner_category_since")
        .eq("user_id", crmUser.id)
        .maybeSingle();

      if (assignmentRes.error) throw assignmentRes.error;
      const currentAssignment = (assignmentRes.data || null) as UserAccessAssignment | null;
      setAssignment(currentAssignment);

      if (!currentAssignment?.access_profile_id) {
        setAccessProfile(null);
        return;
      }

      const profileRes = await supabase
        .from("access_profiles")
        .select("id,name,description,permissions,is_active,is_system")
        .eq("id", currentAssignment.access_profile_id)
        .maybeSingle();

      if (profileRes.error) throw profileRes.error;
      const profile = (profileRes.data || null) as AccessProfileRow | null;
      setAccessProfile(profile?.is_active === false ? null : profile);
    } catch (e: any) {
      console.error("[AccessProvider]", e);
      setError(e?.message || "Não foi possível carregar o perfil de acesso.");
      // Compatibilidade: enquanto um usuário não recebeu um Perfil de Acesso,
      // o CRM mantém exatamente o comportamento anterior.
      setAssignment(null);
      setAccessProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("crm:access-updated", handler);
    return () => window.removeEventListener("crm:access-updated", handler);
  }, [refresh]);

  const legacyMode = !assignment?.access_profile_id || !accessProfile;
  const isAdmin = user?.role === "admin";
  const matrix = legacyMode ? FULL_LEGACY : accessProfile?.permissions || {};

  const canViewGuide = useCallback(
    (guideKey: string) => {
      // Admin mantém sempre a porta de recuperação da administração de usuários/perfis.
      if (isAdmin && guideKey === "usuarios") return true;
      return permissionAllowed(matrix, guideKey, "view");
    },
    [isAdmin, matrix],
  );

  const canInfo = useCallback(
    (guideKey: string, permissionKey: string) => {
      if (isAdmin && guideKey === "usuarios" && permissionKey === "access") return true;
      return permissionAllowed(matrix, guideKey, "info", permissionKey);
    },
    [isAdmin, matrix],
  );

  const canAction = useCallback(
    (guideKey: string, permissionKey: string) => {
      if (
        isAdmin &&
        guideKey === "usuarios" &&
        ["manage_profiles", "assign_profiles", "manage_partner_categories"].includes(permissionKey)
      ) {
        return true;
      }
      return permissionAllowed(matrix, guideKey, "action", permissionKey);
    },
    [isAdmin, matrix],
  );

  const canAccessPath = useCallback(
    (pathname: string) => {
      if (pathname === "/perfil" || pathname === "/alterar-senha" || pathname === "/inicio" || pathname === "/") {
        return true;
      }

      if (pathname.startsWith("/usuarios/perfis")) {
        return isAdmin || canAction("usuarios", "manage_profiles");
      }

      if (pathname.startsWith("/whatsapp/campanhas")) {
        return canViewGuide("whatsapp") && canInfo("whatsapp", "campaigns");
      }
      if (pathname.startsWith("/whatsapp/modelos")) {
        return canViewGuide("whatsapp") && canInfo("whatsapp", "templates");
      }
      if (pathname.startsWith("/whatsapp/autorizacoes")) {
        return canViewGuide("whatsapp") && canInfo("whatsapp", "authorizations");
      }
      if (pathname.startsWith("/simuladores/add") || pathname.match(/^\/simuladores\/admin\//)) {
        return canViewGuide("simuladores") && canAction("simuladores", "manage_admins");
      }
      if (pathname.startsWith("/rh/vagas")) {
        return canViewGuide("rh") && canInfo("rh", "vacancies");
      }

      const guideKey = guideKeyForPath(pathname);
      return guideKey ? canViewGuide(guideKey) : true;
    },
    [canAction, canInfo, canViewGuide, isAdmin],
  );

  const value = useMemo<AccessContextValue>(
    () => ({
      loading,
      error,
      user,
      assignment,
      accessProfile,
      legacyMode,
      isAdmin,
      canViewGuide,
      canInfo,
      canAction,
      canAccessPath,
      refresh,
    }),
    [
      loading,
      error,
      user,
      assignment,
      accessProfile,
      legacyMode,
      isAdmin,
      canViewGuide,
      canInfo,
      canAction,
      canAccessPath,
      refresh,
    ],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess deve ser usado dentro de AccessProvider.");
  return value;
}

export function dispatchAccessUpdated() {
  window.dispatchEvent(new CustomEvent("crm:access-updated"));
}
