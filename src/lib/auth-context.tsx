import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "../../shared/types";
import { api, ApiError } from "./api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  needsSetup: boolean | null;
  login: (credentials: { username: string; password: string }) => Promise<User>;
  setup: (credentials: { username: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkStatus = async () => {
    try {
      setIsLoading(true);
      const status = await api.auth.setupStatus();
      setNeedsSetup(status.needsSetup);

      if (!status.needsSetup) {
        try {
          const me = await api.auth.me();
          setUser(me.user);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Erro ao verificar status de autenticação:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const login = async (credentials: { username: string; password: string }): Promise<User> => {
    const res = await api.auth.login(credentials);
    setUser(res.user);
    setNeedsSetup(false);
    return res.user;
  };

  const setup = async (credentials: { username: string; password: string }): Promise<User> => {
    const res = await api.auth.setup(credentials);
    setUser(res.user);
    setNeedsSetup(false);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        needsSetup,
        login,
        setup,
        logout,
        refresh: checkStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser utilizado dentro de um <AuthProvider>");
  }
  return ctx;
}
