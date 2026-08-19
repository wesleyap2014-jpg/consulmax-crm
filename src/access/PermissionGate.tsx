import React from "react";
import { useAccess } from "./AccessContext";

type PermissionGateProps = {
  guide: string;
  kind: "info" | "action";
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function PermissionGate({
  guide,
  kind,
  permission,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { canInfo, canAction } = useAccess();
  const allowed =
    kind === "info" ? canInfo(guide, permission) : canAction(guide, permission);
  return allowed ? <>{children}</> : <>{fallback}</>;
}

export function useGuidePermissions(guide: string) {
  const access = useAccess();
  return {
    canView: access.canViewGuide(guide),
    canInfo: (permission: string) => access.canInfo(guide, permission),
    canAction: (permission: string) => access.canAction(guide, permission),
  };
}
