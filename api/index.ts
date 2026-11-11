import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/_core/app.js";

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const apiPath = url.searchParams.get("__seif_api_path");
  const storagePath = url.searchParams.get("__seif_storage_path");

  if (apiPath !== null) {
    url.pathname = "/api/" + apiPath;
    url.searchParams.delete("__seif_api_path");
  } else if (storagePath !== null) {
    url.pathname = "/manus-storage/" + storagePath;
    url.searchParams.delete("__seif_storage_path");
  }

  req.url = url.pathname + url.search;
  return app(req, res);
}
