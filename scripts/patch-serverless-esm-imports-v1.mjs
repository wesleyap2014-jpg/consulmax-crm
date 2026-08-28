import fs from "node:fs";
import path from "node:path";

const root = "api";
let changed = 0;
let inspected = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    inspected += 1;
    const before = fs.readFileSync(full, "utf8");
    let src = before;
    src = src.replaceAll('from "./_supabase"', 'from "./_supabase.js"');
    src = src.replaceAll("from './_supabase'", "from './_supabase.js'");
    src = src.replaceAll('from "../_supabase"', 'from "../_supabase.js"');
    src = src.replaceAll("from '../_supabase'", "from '../_supabase.js'");
    src = src.replaceAll('from "./_livekit-server"', 'from "./_livekit-server.js"');
    src = src.replaceAll("from './_livekit-server'", "from './_livekit-server.js'");
    src = src.replaceAll('from "./_social"', 'from "./_social.js"');
    src = src.replaceAll("from './_social'", "from './_social.js'");
    src = src.replaceAll('import("./_social")', 'import("./_social.js")');
    src = src.replaceAll("import('./_social')", "import('./_social.js')");
    if (src !== before) {
      fs.writeFileSync(full, src);
      changed += 1;
      console.log(`[serverless-esm-v1] ${full}: imports ESM corrigidos`);
    }
  }
}

walk(root);
console.log(`[serverless-esm-v1] concluído: ${changed} arquivo(s) alterado(s) de ${inspected} inspecionados`);
