import fs from "node:fs";
import path from "node:path";

const root = "api";
let changed = 0;
let inspected = 0;

const legacyMetaScopes = `    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_engagement",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "instagram_manage_comments",
      ...splitScopes(process.env.META_SOCIAL_EXTRA_SCOPES),
    ];`;

const providerSpecificMetaScopes = `    const scopes = provider === "instagram"
      ? [
          "pages_show_list",
          "pages_read_engagement",
          "instagram_basic",
          "instagram_content_publish",
          ...splitScopes(process.env.META_INSTAGRAM_EXTRA_SCOPES),
          ...splitScopes(process.env.META_SOCIAL_EXTRA_SCOPES),
        ]
      : [
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_posts",
          "pages_manage_engagement",
          ...splitScopes(process.env.META_FACEBOOK_EXTRA_SCOPES),
          ...splitScopes(process.env.META_SOCIAL_EXTRA_SCOPES),
        ];`;

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

    if (full.replaceAll("\\", "/").endsWith("api/marketing/_social.ts")) {
      src = src.replace(legacyMetaScopes, providerSpecificMetaScopes);
    }

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
      console.log(`[serverless-esm-v1] ${full}: compatibilidade aplicada`);
    }
  }
}

walk(root);
console.log(`[serverless-esm-v1] concluído: ${changed} arquivo(s) alterado(s) de ${inspected} inspecionados`);
