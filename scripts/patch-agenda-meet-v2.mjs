import fs from "node:fs";

const path = "src/pages/AgendaSalaV2.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

const old = `    return () => { disposed = true; };\n  }, [room, enabled, eventId, version, onNewText]);`;
const next = `    return undefined;\n  }, [room, enabled, eventId, version, onNewText]);`;
if (src.includes(old)) {
  src = src.replace(old, next);
  console.log("[agenda-meet-v2] transcritores preservados entre atualizações da sala");
} else if (src.includes(next)) {
  console.log("[agenda-meet-v2] já aplicado");
} else {
  console.log("[agenda-meet-v2] trecho não encontrado");
}

if (src !== before) fs.writeFileSync(path, src);
