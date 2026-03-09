import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { type ExecutorContext, type PublishEpisodeInputs } from "./core";
import { executeDeterministic } from "./deterministic";
import { execute as executePolicy } from "./executor";

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
  final_status: "published";
  final_url: string;
}

async function appendFallbackRecord(record: FallbackRecord): Promise<void> {
  const dir = resolve(".cache/spotify-publish");
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await appendFile(resolve(dir, "deterministic-policy-fallback-history.jsonl"), line, "utf8");
}

export async function execute(
  inputs: PublishEpisodeInputs,
  context: AutoExecutorContext = {}
): Promise<{ status: "published"; show: string; url: string }> {
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

  return d2Result;
}

export default execute;
