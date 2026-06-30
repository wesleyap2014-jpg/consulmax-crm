import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch maggi click results: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(needle, replacement, marker) {
  if (!src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

replaceOnce(
`  const clicked = await clickFirstVisible(page, [
    maggiOptionalEnv("MAGGI_AVAILABLE_GROUPS_LOGIN_BUTTON_SELECTOR"),
    'button:has-text("ACESSAR MINHA CONTA")',
    'ion-button:has-text("ACESSAR MINHA CONTA")',
    'button:has-text("Acessar")',
    'ion-button:has-text("Acessar")',
  ]).catch(() => false);

  if (!clicked) {`,
`  let clicked = true;
  try {
    await clickFirstVisible(page, [
      maggiOptionalEnv("MAGGI_AVAILABLE_GROUPS_LOGIN_BUTTON_SELECTOR"),
      'button:has-text("ACESSAR MINHA CONTA")',
      'ion-button:has-text("ACESSAR MINHA CONTA")',
      'button:has-text("Acessar")',
      'ion-button:has-text("Acessar")',
    ]);
  } catch {
    clicked = false;
  }

  if (!clicked) {`,
"let clicked = true;\n  try {\n    await clickFirstVisible(page, [\n      maggiOptionalEnv(\"MAGGI_AVAILABLE_GROUPS_LOGIN_BUTTON_SELECTOR\")"
);

replaceOnce(
`  const clicked = await clickFirstVisible(page, [
    'button:has-text("Sincronizar")',
    'ion-button:has-text("Sincronizar")',
    'div:has-text("Sincronizar")',
  ]).catch(() => false);

  if (!clicked) {`,
`  let clicked = true;
  try {
    await clickFirstVisible(page, [
      'button:has-text("Sincronizar")',
      'ion-button:has-text("Sincronizar")',
      'div:has-text("Sincronizar")',
    ]);
  } catch {
    clicked = false;
  }

  if (!clicked) {`,
"let clicked = true;\n  try {\n    await clickFirstVisible(page, [\n      'button:has-text(\"Sincronizar\")'"
);

replaceOnce(
`  const clicked = await clickFirstVisible(page, [
    'button:has-text("SIMULAR CONSÓRCIO")',
    'ion-button:has-text("SIMULAR CONSÓRCIO")',
  ]).catch(() => false);

  if (!clicked) await maggiClickText(page, "SIMULAR CONSÓRCIO", true);`,
`  let clicked = true;
  try {
    await clickFirstVisible(page, [
      'button:has-text("SIMULAR CONSÓRCIO")',
      'ion-button:has-text("SIMULAR CONSÓRCIO")',
    ]);
  } catch {
    clicked = false;
  }

  if (!clicked) await maggiClickText(page, "SIMULAR CONSÓRCIO", true);`,
"let clicked = true;\n  try {\n    await clickFirstVisible(page, [\n      'button:has-text(\"SIMULAR CONSÓRCIO\")'"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch maggi click results: applied");
} else {
  console.log("patch maggi click results: no changes");
}
