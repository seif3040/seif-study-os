import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { MobileAuthProvider } from "@/hooks/use-mobile-auth";
import { trpc, trpcClient } from "@/lib/trpc";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MobileAuthProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#f6fbfa" } }} />
        </MobileAuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
