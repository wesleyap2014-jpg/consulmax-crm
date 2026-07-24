import fs from "node:fs";

const file = "scripts/run-github-maggi-sync.mjs";

if (!fs.existsSync(file)) {
  console.log("patch maggi github segment execution: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
const marker = "execução Maggi isolada por segmento";

if (src.includes(marker)) {
  console.log("patch maggi github segment execution: no changes");
  process.exit(0);
}

const startMarker = "async function executeJob(job) {";
const endMarker = "\nconst job = await resolveJob();";
const start = src.indexOf(startMarker);
const end = start >= 0 ? src.indexOf(endMarker, start) : -1;

if (start < 0 || end < 0) {
  console.log("patch maggi github segment execution: target block not found");
  process.exit(1);
}

const replacement = String.raw`function retryableWorkerConnectionError(error) {
  const message = errorText(error).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("terminated") ||
    message.includes("worker local encerrou") ||
    message.includes("worker local não ficou disponível")
  );
}

function segmentLabel(segment) {
  return segment === "automoveis" ? "CAR" : "IMV";
}

function friendlyWorkerError(segment, error) {
  const raw = errorText(error);
  if (retryableWorkerConnectionError(error)) {
    return (
      "A sessão " +
      segmentLabel(segment) +
      " perdeu a conexão com o worker local após as tentativas automáticas."
    );
  }
  return raw;
}

async function runSegmentWithFreshWorker(segment) {
  const configuredAttempts = Number(
    process.env.MAGGI_SEGMENT_MAX_ATTEMPTS || 3,
  );
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.max(1, Math.min(5, configuredAttempts))
    : 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let child = null;
    try {
      log("execução Maggi isolada por segmento", {
        segment,
        label: segmentLabel(segment),
        attempt,
        maxAttempts,
      });

      child = startWorker();
      await waitForWorker(child);
      const result = await callWorker([segment]);
      return result;
    } catch (error) {
      lastError = error;
      const retryable = retryableWorkerConnectionError(error);
      log("falha na tentativa isolada Maggi", {
        segment,
        label: segmentLabel(segment),
        attempt,
        maxAttempts,
        retryable,
        childExitCode: child?.exitCode ?? null,
        error: errorText(error),
      });

      if (!retryable || attempt >= maxAttempts) {
        throw new Error(friendlyWorkerError(segment, error));
      }
    } finally {
      await stopWorker(child);
      await delay(1200);
    }
  }

  throw new Error(friendlyWorkerError(segment, lastError));
}

async function executeJob(job) {
  const segments = job.mode === "segment" ? [job.segment] : SEGMENTS;
  const progress =
    job.progress && typeof job.progress === "object"
      ? job.progress
      : emptyProgress(segments);
  const totals = {
    found: 0,
    created: 0,
    updated: 0,
    deactivated: 0,
  };
  const failures = [];

  try {
    progress.segments ||= {};
    for (const segment of segments) {
      progress.segments[segment] = {
        status: "running",
        message: "Abrindo sessão limpa " + segmentLabel(segment) + "...",
      };

      await updateJob(job.id, {
        current_stage: "Sincronizando " + segmentLabel(segment),
        current_item: segment,
        progress,
      });

      try {
        const result = await runSegmentWithFreshWorker(segment);
        applyResult(progress, [segment], result);
        totals.found += Number(result.found || 0);
        totals.created += Number(result.created || 0);
        totals.updated += Number(result.updated || 0);
        totals.deactivated += Number(result.deactivated || 0);

        progress.segments[segment].message =
          "Segmento " + segmentLabel(segment) + " concluído e gravado.";

        await updateJob(job.id, {
          current_stage: "Segmento " + segmentLabel(segment) + " concluído",
          current_item: "",
          progress,
          summary: {
            mode: job.mode,
            segment: job.segment,
            segmentsSuccess: segments.filter(
              (item) => progress.segments[item]?.status === "done",
            ).length,
            segmentsError: failures.length,
            groupsFound: totals.found,
            created: totals.created,
            updated: totals.updated,
            deactivated: totals.deactivated,
          },
        });
      } catch (error) {
        const message = friendlyWorkerError(segment, error);
        failures.push({ segment, message });
        progress.segments[segment] = {
          status: "error",
          message,
        };

        await updateJob(job.id, {
          current_stage: "Falha em " + segmentLabel(segment),
          current_item: "",
          progress,
          summary: {
            mode: job.mode,
            segment: job.segment,
            segmentsSuccess: segments.filter(
              (item) => progress.segments[item]?.status === "done",
            ).length,
            segmentsError: failures.length,
            groupsFound: totals.found,
            created: totals.created,
            updated: totals.updated,
            deactivated: totals.deactivated,
          },
        });
      }
    }

    const summary = {
      mode: job.mode,
      segment: job.segment,
      segmentsSuccess: segments.filter(
        (segment) => progress.segments[segment]?.status === "done",
      ).length,
      segmentsError: failures.length,
      groupsFound: totals.found,
      created: totals.created,
      updated: totals.updated,
      deactivated: totals.deactivated,
    };
    const finishedAt = new Date().toISOString();

    if (failures.length) {
      const partial = summary.segmentsSuccess > 0;
      const message = failures
        .map((failure) => segmentLabel(failure.segment) + ": " + failure.message)
        .join(" | ");

      await updateJob(job.id, {
        status: "error",
        finished_at: finishedAt,
        current_stage: partial
          ? "Sincronização parcial"
          : "Falha na sincronização",
        current_item: "",
        progress,
        summary,
        error_message: message,
      });

      log("sincronização Maggi encerrada com falhas segmentadas", {
        jobId: job.id,
        ...summary,
        failures,
      });
      process.exitCode = 1;
      return;
    }

    await recordAutomaticSuccess(job, summary, finishedAt);
    await updateJob(job.id, {
      status: "success",
      finished_at: finishedAt,
      current_stage: "Sincronização concluída",
      current_item: "",
      progress,
      summary,
      error_message: null,
    });

    log("execução concluída", { jobId: job.id, ...summary });
  } catch (error) {
    const message = errorText(error);
    log("falha geral no controlador Maggi", {
      jobId: job.id,
      error: message,
    });

    await updateJob(job.id, {
      status: "error",
      finished_at: new Date().toISOString(),
      current_stage: "Falha no controlador",
      current_item: "",
      progress,
      error_message: message,
    }).catch((updateError) =>
      log("falha ao atualizar trabalho", { error: errorText(updateError) }),
    );
    process.exitCode = 1;
  }
}
`;

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(file, src);
console.log("patch maggi github segment execution: applied");
