import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import Constants from "expo-constants";
import type { AppRouter } from "../../server/routers";
import { getSessionToken } from "./auth";

const apiBaseUrl = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "https://seifstudy-ufsrnaxx.manus.space";

export const trpc = createTRPCReact<AppRouter>();
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${apiBaseUrl}/api/trpc`,
      transformer: superjson,
      async headers() {
        const token = await getSessionToken();
        return {
          "x-client": "seif-study-os-mobile",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
      },
    }),
  ],
});
