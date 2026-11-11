import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.js";
import { registerStorageProxy } from "./storageProxy.js";
import { subjectAnalytics } from "../db.js";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { registerPrivateAuthRoutes } from "../privateAuthRoutes.js";

export function createApp() {
  const app = express();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerPrivateAuthRoutes(app);
  app.get("/api/analytics/subjects", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const { user } = await createContext({ req, res, info: {} as Parameters<typeof createContext>[0]["info"] });
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const subjects = await subjectAnalytics(user.id);
      if (req.query.format !== "csv") return res.json({ subjects });
      const columns = ["title", "chapters", "lessons", "completed", "minutes", "trackedMinutes", "allocatedMinutes", "focusSessions", "reviews", "activeDays", "attempts", "averageScore", "averageComprehension", "bestScore"] as const;
      function quote(value: unknown) {
        let safe = String(value ?? "");
        if (typeof value === "string" && /^[\s]*[=+\-@]/.test(safe)) safe = "'" + safe;
        return '"' + safe.replaceAll('"', '""') + '"';
      }
      const csv = [columns.join(","), ...subjects.map(subject => columns.map(column => quote(subject[column])).join(","))].join("\r\n");
      return res.type("text/csv").attachment("seif-study-subjects.csv").send("\uFEFF" + csv);
    } catch {
      return res.status(500).json({ error: "Could not load subject analytics" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
