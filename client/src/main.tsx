import { notifyStudy } from "@/lib/studyAlerts";
import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

const completionMessages: Record<string, string> = {
  "tasks.complete": "اتسجّل إكمال المهمة",
  "studyPlan.complete": "اتسجّل إكمال الدرس",
  "studyPlan.review": "اتسجّلت المراجعة",
  "planner.finishStudy": "خلصت المذاكرة",
  "planner.finishYearReview": "خلصت المراجعة",
  "planner.attend": "اتسجّل حضور الحصة",
  "planner.assessmentStatus": "اتسجّل إكمال التقييم",
  "exams.completeAttempt": "اتسجّل الامتحان",
  "prayers.log": "اتسجّلت الصلاة",
  "prayers.setNafl": "اتسجّلت النافلة",
  "goals.updateProgress": "حققت هدفك",
  "habits.complete": "اتسجّل الإنجاز",
  "pomodoro.complete": "اتسجّلت جلسة التركيز",
  "video.setProgress": "اتسجّل تقدّم الفيديو",
  "video.end": "اتسجّلت جلسة الفيديو",
};

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "success") {
    const [path] = event.mutation.options.mutationKey ?? [];
    const action = Array.isArray(path) ? path.join(".") : "";
    const message = completionMessages[action];
    const result = event.mutation.state.data as { alreadyCompleted?: boolean; completedNow?: boolean; missingHomework?: unknown[] } | undefined;
    const input = event.mutation.state.variables as { status?: string; progress?: string; done?: boolean; finishEarly?: boolean } | undefined;
    if (message && !result?.alreadyCompleted && !result?.missingHomework?.length
      && (action !== "goals.updateProgress" || result?.completedNow)
      && (action !== "planner.assessmentStatus" || input?.status === "completed")
      && (action !== "video.setProgress" || input?.progress === "finished" || input?.progress === "reviewed")
      && (action !== "prayers.setNafl" || input?.done)
      && (action !== "pomodoro.complete" || input?.finishEarly)) {
      notifyStudy(message, "completed");
    }
  }
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
