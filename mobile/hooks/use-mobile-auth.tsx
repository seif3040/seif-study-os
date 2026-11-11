import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { getSessionToken, signIn as requestSignIn, signOut as requestSignOut } from "@/lib/auth";

const AuthContext = createContext<{
  authenticated: boolean;
  loading: boolean;
  signIn: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
} | null>(null);

export function MobileAuthProvider({ children }: PropsWithChildren) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessionToken().then(token => setAuthenticated(Boolean(token))).finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    authenticated,
    loading,
    async signIn(password: string) {
      await requestSignIn("seif94803@gmail.com", password);
      setAuthenticated(true);
    },
    async signOut() {
      await requestSignOut();
      setAuthenticated(false);
    },
  }), [authenticated, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useMobileAuth must be used inside MobileAuthProvider");
  return value;
}
