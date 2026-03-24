import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type ExecutorContext, type PublishEpisodeInputs } from "./core";
import { execute as executePolicy } from "./executor";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface AutoExecutorContext extends ExecutorContext {
  preferDeterministic?: boolean;
}

interface FallbackRecord {
  timestamp: string;
  title: string;
  deterministic_attempted: boolean;
  deterministic_success: boolean;
  deterministic_error?: string;
  final_mode: "deterministic" | "policy";
  final_status: "published" | "scheduled";
  final_url: string;
}

async function appendFallbackRecord(record: FallbackRecord): Promise<void> {
  const dir = resolve(skillRoot, ".cache/spotify-publish");
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await appendFile(resolve(dir, "deterministic-policy-fallback-history.jsonl"), line, "utf8");
}

async function markPendingRegen(deterministicError: string): Promise<void> {
  const cacheDir = resolve(skillRoot, ".cache/spotify-publish");
  await mkdir(cacheDir, { recursive: true });
  const marker = {
    timestamp: new Date().toISOString(),
    deterministic_error: deterministicError,
    trajectory_path: resolve(skillRoot, ".cache/spotify-publish/policy-trajectory-latest.json"),
    deterministic_path: resolve(skillRoot, "scripts/cache/deterministic.ts"),
  };
  await writeFile(resolve(cacheDir, "pending-regen.json"), JSON.stringify(marker, null, 2), "utf8");
  console.log(`[auto-regen] Deterministic failed. Pending regen marker written — will be applied on next interactive run.`);
}

export async function execute(
  inputs: PublishEpisodeInputs,
  context: AutoExecutorContext = {}
): Promise<{ status: "published" | "scheduled"; show: string; url: string }> {
  const log = context.logger ?? ((msg: string) => console.log(`[spotify-publish-auto] ${msg}`));
  const disableDeterministicCache = inputs.disable_deterministic_cache ?? false;
  const preferDeterministic = context.preferDeterministic ?? !disableDeterministicCache;

  let deterministicAttempted = false;
  let deterministicSuccess = false;
  let deterministicError: string | undefined;

  if (preferDeterministic) {
    deterministicAttempted = true;
    try {
      log("Deterministic trajectory cache attempt");
      const { executeDeterministic } = await import("./cache/deterministic");
      const deterministicResult = await executeDeterministic(inputs, {
        logger: (msg) => log(`[deterministic] ${msg}`),
        prompt: context.prompt,
      });
      deterministicSuccess = true;
      await appendFallbackRecord({
        timestamp: new Date().toISOString(),
        title: inputs.title,
        deterministic_attempted: deterministicAttempted,
        deterministic_success: deterministicSuccess,
        final_mode: "deterministic",
        final_status: deterministicResult.status,
        final_url: deterministicResult.url,
      });
      return deterministicResult;
    } catch (error) {
      deterministicError = error instanceof Error ? error.message : String(error);
      log(`Deterministic trajectory cache failed, downgrade to policy executor: ${deterministicError}`);
    }
  }

  log("Policy executor running as reliability baseline");
  const d2Result = await executePolicy(inputs, {
    logger: (msg) => log(`[policy] ${msg}`),
    prompt: context.prompt,
  });

  await appendFallbackRecord({
    timestamp: new Date().toISOString(),
    title: inputs.title,
    deterministic_attempted: deterministicAttempted,
    deterministic_success: deterministicSuccess,
    deterministic_error: deterministicError,
    final_mode: "policy",
    final_status: d2Result.status,
    final_url: d2Result.url,
  });

  // If deterministic failed but policy succeeded, mark for async regen on next run
  if (deterministicAttempted && !deterministicSuccess && deterministicError) {
    await markPendingRegen(deterministicError).catch(() => { /* non-fatal */ });
  }

  return d2Result;
}

export default execute;
