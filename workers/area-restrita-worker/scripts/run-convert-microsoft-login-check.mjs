import { checkMicrosoftLogin } from "../src/convert-microsoft-login-check.mjs";

const result = await checkMicrosoftLogin();
const summary = {
  state: result.state,
  ok: result.ok,
  checkedAt: result.checkedAt,
  finalUrl: result.finalUrl || null,
  httpStatus: result.httpStatus ?? null,
  convertHttpStatus: result.convertHttpStatus ?? null,
  authorizationCodeSeen: result.authorizationCodeSeen ?? false,
  error: result.error || null,
};

console.log(`[embracon] Microsoft login-check: ${summary.state}; Convert HTTP ${summary.convertHttpStatus ?? "—"}; code ${summary.authorizationCodeSeen ? "captured" : "not_seen"}; URL ${summary.finalUrl || "—"}`);

if (summary.error) {
  console.error(`[embracon] Microsoft login-check detalhe: ${summary.error}`);
}
