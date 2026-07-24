import fs from "node:fs";

const file = "src/maggiAvailableGroups.ts";

if (!fs.existsSync(file)) {
  console.log("patch maggi isolated segment sessions: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
const marker = "sessão Maggi isolada iniciada";

if (src.includes(marker)) {
  console.log("patch maggi isolated segment sessions: no changes");
  process.exit(0);
}

const startMarker = "async function syncMaggiAvailableGroups(";
const endMarker = "\nexport function registerMaggiAvailableGroups";
const start = src.indexOf(startMarker);
const end = start >= 0 ? src.indexOf(endMarker, start) : -1;

if (start < 0 || end < 0) {
  console.log("patch maggi isolated segment sessions: target block not found");
  process.exit(1);
}

const replacement = `async function syncMaggiAvailableGroups(
  deps: RegisterDeps,
  segments: MaggiAvailableSegmentKey[]
): Promise<SyncResult> {
  let stage = "iniciando";
  const groupsBySegment: Partial<Record<MaggiAvailableSegmentKey, string[]>> = {};
  const readDetails: SyncResult["details"]["readDetails"] = [];
  let created = 0;
  let updated = 0;
  let deactivated = 0;

  try {
    for (const segmento of segments) {
      let browser: Browser | null = null;
      let context: any = null;

      try {
        stage = "abrindo sessão isolada " + segmento;
        deps.log("sessão Maggi isolada iniciada", { segmento });

        browser = await deps.launchBrowser();
        context = await browser.newContext({
          viewport: { width: 1366, height: 900 },
          locale: "pt-BR",
        });
        const page = await context.newPage();

        stage = "login " + segmento;
        await loginMaggi(deps, page);

        stage = "sincronização interna " + segmento;
        await runInternalSync(deps, page);

        stage = "lendo segmento " + segmento;
        const segment = SEGMENTS[segmento];
        const groups = await readGroupsForSegment(deps, page, segment);
        groupsBySegment[segmento] = groups;
        readDetails.push({
          segmento,
          linhas: groups.length,
          grupos: groups.length,
        });

        stage = "gravando segmento " + segmento;
        const segmentGroups: Partial<Record<MaggiAvailableSegmentKey, string[]>> = {};
        segmentGroups[segmento] = groups;
        const writeResult = await upsertAvailableGroups(deps, segmentGroups);
        created += writeResult.created;
        updated += writeResult.updated;
        deactivated += writeResult.deactivated;

        deps.log("sessão Maggi isolada concluída", {
          segmento,
          grupos: groups.length,
          created: writeResult.created,
          updated: writeResult.updated,
          deactivated: writeResult.deactivated,
        });
      } catch (error: any) {
        error.stage = error.stage || stage;
        throw error;
      } finally {
        if (context) await context.close().catch(() => null);
        if (browser) await browser.close().catch(() => null);
        deps.log("sessão Maggi isolada encerrada", { segmento });
      }
    }

    const found = Object.values(groupsBySegment).reduce(
      (sum, groups) => sum + (groups?.length || 0),
      0
    );

    return {
      ok: true,
      status: "synced",
      administradora: "maggi",
      found,
      created,
      updated,
      deactivated,
      message: "Grupos disponíveis Maggi sincronizados com sucesso em sessões isoladas.",
      details: { segments, groupsBySegment, readDetails },
    };
  } catch (error: any) {
    error.stage = error.stage || stage;
    throw error;
  }
}
`;

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(file, src);
console.log("patch maggi isolated segment sessions: applied");
