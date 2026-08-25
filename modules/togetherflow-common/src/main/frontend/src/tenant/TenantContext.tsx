/**
 * Active-tenant context (REQUIREMENTS.md §8 multi-tenancy, §7.5 shell).
 *
 * Every list query and start/deploy action reads the tenant from here rather than
 * threading a parameter through each call site — retrofitting that later is the
 * expensive path the requirements explicitly warn against.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface TenantContextValue {
  tenantId: string | undefined;
  setTenantId: (tenantId: string | undefined) => void;
  /** Tenants the signed-in user may switch between; empty means single-tenant. */
  availableTenants: string[];
}

const TenantContext = createContext<TenantContextValue | null>(null);

export interface TenantProviderProps {
  children: ReactNode;
  initialTenantId?: string;
  availableTenants?: string[];
}

export function TenantProvider({
  children,
  initialTenantId,
  availableTenants = [],
}: TenantProviderProps) {
  const [tenantId, setTenantId] = useState<string | undefined>(initialTenantId);

  const value = useMemo(
    () => ({ tenantId, setTenantId, availableTenants }),
    [tenantId, availableTenants],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
