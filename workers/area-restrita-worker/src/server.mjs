import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const startedAt = new Date().toISOString();

await fs.mkdir(PROFILE_DIR, { recursive: true });

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, {
      ok: true,
      service: "consulmax-area-restrita-worker",
      startedAt,
    });
  }

  if (request.method === "GET" && url.pathname === "/status") {
    return sendJson(response, 200, {
      ok: true,
      service: "consulmax-area-restrita-worker",
      railwayReady: true,
      profileDirectory: PROFILE_DIR,
      portalUrlConfigured: Boolean(process.env.AREA_RESTRITA_PORTAL_URL),
      usernameConfigured: Boolean(process.env.AREA_RESTRITA_USERNAME),
      passwordConfigured: Boolean(process.env.AREA_RESTRITA_PASSWORD),
      remoteAccessConfigured: Boolean(process.env.AREA_RESTRITA_VNC_PASSWORD),
      note: "Base do serviço ativa. Navegador remoto e sincronização serão habilitados na próxima etapa.",
    });
  }

  return sendJson(response, 404, {
    ok: false,
    error: "not_found",
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[area-restrita] serviço ativo em ${HOST}:${PORT}`);
  console.log(`[area-restrita] perfil persistente em ${PROFILE_DIR}`);
});

function shutdown(signal) {
  console.log(`[area-restrita] encerrando por ${signal}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
