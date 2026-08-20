import fs from "node:fs";

const file = "scripts/run-github-maggi-sync.mjs";

if (!fs.existsSync(file)) {
  console.log("patch maggi entry retry: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceBlock(startMarker, endMarker, replacement, marker) {
  if (src.includes(marker)) return true;

  const start = src.indexOf(startMarker);
  const end = start >= 0 ? src.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) return false;

  src = src.slice(0, start) + replacement + src.slice(end);
  changed = true;
  return true;
}

const retryReplacement = String.raw`// MAGGI_ENTRY_RETRY_V1
function retryableMaggiEntryError(error) {
  const message = errorText(error).toLowerCase();
  return (
    message.includes("não foi possível carregar a entrada do app maggi") ||
    message.includes("tela de login maggi não carregou") ||
    message.includes("campo de usuario da maggi não encontrado") ||
    message.includes("campo de usuário da maggi não encontrado") ||
    message.includes("campo de senha da maggi não encontrado") ||
    (message.includes("maggi") &&
      message.includes("não carregou") &&
      (message.includes("entrada") || message.includes("login") || message.includes("flutter")))
  );
}

function retryableWorkerConnectionError(error) {
  const message = errorText(error).toLowerCase();
  return (
    retryableMaggiEntryError(error) ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("terminated") ||
    message.includes("worker local encerrou") ||
    message.includes("worker local não ficou disponível")
  );
}

`;

const friendlyReplacement = String.raw`// MAGGI_ENTRY_FRIENDLY_ERROR_V1
function friendlyWorkerError(segment, error) {
  const raw = errorText(error);
  if (retryableMaggiEntryError(error)) return raw;
  if (retryableWorkerConnectionError(error)) {
    return (
      "A sessão " +
      segmentLabel(segment) +
      " perdeu a conexão com o worker local após as tentativas automáticas."
    );
  }
  return raw;
}

`;

const retryOk = replaceBlock(
  "function retryableWorkerConnectionError(error) {",
  "function segmentLabel(segment) {",
  retryReplacement,
  "MAGGI_ENTRY_RETRY_V1"
);

const friendlyOk = replaceBlock(
  "function friendlyWorkerError(segment, error) {",
  "async function runSegmentWithFreshWorker(segment) {",
  friendlyReplacement,
  "MAGGI_ENTRY_FRIENDLY_ERROR_V1"
);

if (!retryOk || !friendlyOk) {
  console.error("patch maggi entry retry: target block not found");
  process.exit(1);
}

if (!changed) {
  console.log("patch maggi entry retry: no changes");
  process.exit(0);
}

fs.writeFileSync(file, src);
console.log("patch maggi entry retry: applied");
