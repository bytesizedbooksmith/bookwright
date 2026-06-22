import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import open from "open";
import { registerApi } from "./api.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? 4242);
const isDev = process.env.EPUBMAKER_DEV === "1";

const app = express();
app.use(express.json({ limit: "5mb" }));

registerApi(app);

// In production we serve the built frontend. In dev, Vite serves it on 5173.
if (!isDev) {
  const dist = path.join(ROOT, "web", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  const url = isDev ? "http://localhost:5173" : `http://localhost:${PORT}`;
  console.log(`\n  EPUB Maker running at ${url}\n`);
  if (!isDev && process.env.EPUBMAKER_NO_OPEN !== "1") {
    open(url).catch(() => {});
  }
});
