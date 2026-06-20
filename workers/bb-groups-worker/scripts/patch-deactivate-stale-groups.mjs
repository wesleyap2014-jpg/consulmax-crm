import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch deactivate stale groups: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(needle, replacement, marker = replacement) {
  if (!src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

function replaceRegex(regex, replacement, marker) {
  if (!src.includes(marker) && regex.test(src)) {
    src = src.replace(regex, replacement);
    changed = true;
  }
}

replaceOnce(
  "  created: number;\n  updated: number;",
  "  created: number;\n  updated: number;\n  deactivated?: number;",
  "deactivated?: number;"
);

const newUpsertFunction = `async function deactivateMissingGroups(segmento: SegmentKey, activeGroupCodes: string[]) {
  const activeSet = new Set(activeGroupCodes.map((grupo) => String(grupo || "").trim()).filter(Boolean));

  const { data: activeRows, error: listErr } = await supabase
    .from("sim_bb_groups")
    .select("id, grupo")
    .eq("segmento", segmento)
    .eq("is_active", true);

  if (listErr) throw listErr;

  const staleRows = (activeRows || []).filter((row: any) => {
    const grupo = String(row?.grupo || "").trim();
    return grupo && !activeSet.has(grupo);
  });

  if (!staleRows.length) {
    return 0;
  }

  const { error: deactivateErr } = await supabase
    .from("sim_bb_groups")
    .update({ is_active: false })
    .in(
      "id",
      staleRows.map((row: any) => row.id)
    );

  if (deactivateErr) throw deactivateErr;

  log("grupos indisponíveis inativados", {
    segmento,
    total: staleRows.length,
    grupos: staleRows.map((row: any) => row.grupo),
  });

  return staleRows.length;
}

async function upsertGroups(payloads: any[]) {
  let created = 0;
  let updated = 0;
  let deactivated = 0;
  const segmentos = Array.from(
    new Set(payloads.map((payload) => String(payload?.segmento || "").trim()).filter(Boolean))
  ) as SegmentKey[];

  for (const payload of payloads) {
    const { data: existing, error: findErr } = await supabase
      .from("sim_bb_groups")
      .select("id, config")
      .eq("grupo", payload.grupo)
      .eq("segmento", payload.segmento)
      .maybeSingle();

    if (findErr) throw findErr;

    const existingConfig =
      existing?.config && typeof existing.config === "object"
        ? existing.config
        : {};

    if (existingConfig?.assemblyResult) {
      payload.config = {
        ...payload.config,
        assemblyResult: existingConfig.assemblyResult,
      };
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("sim_bb_groups")
        .update(payload)
        .eq("id", existing.id);

      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabase.from("sim_bb_groups").insert(payload);

      if (error) throw error;
      created += 1;
    }
  }

  for (const segmento of segmentos) {
    const activeGroupCodes = payloads
      .filter((payload) => payload.segmento === segmento)
      .map((payload) => String(payload.grupo || "").trim())
      .filter(Boolean);

    deactivated += await deactivateMissingGroups(segmento, activeGroupCodes);
  }

  log("gravação no Supabase concluída", {
    created,
    updated,
    deactivated,
    total: payloads.length,
  });

  return { created, updated, deactivated };
}

async function processSegment`;

if (!src.includes("async function deactivateMissingGroups")) {
  const regex = /async function upsertGroups\(payloads: any\[\]\) \{[\s\S]*?\n\}\n\nasync function processSegment/;
  if (regex.test(src)) {
    src = src.replace(regex, newUpsertFunction);
    changed = true;
  } else {
    console.log("patch deactivate stale groups: upsertGroups block not found");
  }
}

replaceOnce(
  "const { created, updated } = await upsertGroups(payloads);",
  "const { created, updated, deactivated } = await upsertGroups(payloads);",
  "const { created, updated, deactivated } = await upsertGroups(payloads);"
);

replaceRegex(
  /(found: payloads\.length,\n\s*created,\n\s*updated,\n)(\s*details: \{)/,
  "$1      deactivated,\n$2",
  "found: payloads.length,\n      created,\n      updated,\n      deactivated,"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch deactivate stale groups: applied");
} else {
  console.log("patch deactivate stale groups: no changes");
}
