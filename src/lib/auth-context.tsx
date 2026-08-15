import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { users, type User } from "@/mock/users";

export type DemoRole = "pm" | "foreman";

export interface DemoAccount {
  role: DemoRole;
  roleLabel: string;
  user: User;
}

export const demoAccounts: DemoAccount[] = [
  { role: "pm", roleLabel: "Руководитель проекта", user: users.find((u) => u.id === "u-sokolov")! },
  { role: "foreman", roleLabel: "Прораб", user: users.find((u) => u.id === "u-gareev")! },
];

interface AuthContextValue {
  account: DemoAccount | null;
  signIn: (role: DemoRole) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Демо-роль живет только в памяти: никакого localStorage и реальной авторизации. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<DemoAccount | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      signIn: (role) => setAccount(demoAccounts.find((a) => a.role === role) ?? null),
      signOut: () => setAccount(null),
    }),
    [account],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
