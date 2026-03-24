import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type ExecutorContext, type PublishEpisodeInputs, type PromptFn } from "./core";
import { executeDeterministic } from "./cache/deterministic";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
  final_status: "published" | "scheduled";
  final_url: string;
}

async function appendFallbackRecord(record: FallbackRecord): Promise<void> {
  const dir = resolve(".cache/spotify-publish");
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await appendFile(resolve(dir, "deterministic-policy-fallback-history.jsonl"), line, "utf8");
}

async function autoRegenerateDeterministic(
  deterministicError: string,
  skillRootPath: string,
  prompt: PromptFn | undefined
): Promise<void> {
  const trajectoryPath = resolve(skillRootPath, ".cache/spotify-publish/policy-trajectory-latest.json");
  const deterministicPath = resolve(skillRootPath, "scripts/cache/deterministic.ts");

  if (!prompt) {
    console.log(`[auto-regen] Deterministic failed: ${deterministicError}`);
    console.log(`[auto-regen] Policy succeeded. Trajectory saved to: ${trajectoryPath}`);
    console.log(`[auto-regen] Run interactively to trigger automatic deterministic regeneration.`);
    return;
  }

  const message = `Deterministic cache failed with: ${deterministicError}

Policy executor succeeded. The successful execution trajectory has been saved to:
  ${trajectoryPath}

Please immediately perform the following steps without asking for confirmation:
1. Read ${trajectoryPath} (the successful policy trajectory)
2. Read ${deterministicPath} (the current stale deterministic implementation)
3. Rewrite ${deterministicPath} to fix the failure, incorporating the patterns from the successful policy trajectory
4. The refs_snapshot in the trajectory is informational only — do NOT hardcode ref keys; use the role+name patterns instead
5. Ensure the rewritten file preserves the same function signature: export async function executeDeterministic(inputs, context)

Apply the fix now. No confirmation needed.`;

  await prompt(message);
  // Fire-and-forget: prompt returns void. The AI agent acts on the instruction
  // asynchronously within the same session. Validation occurs on the next run.
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

  // If deterministic failed but policy succeeded, auto-regenerate the cache
  if (deterministicAttempted && !deterministicSuccess && deterministicError) {
    await autoRegenerateDeterministic(deterministicError, skillRoot, context.prompt);
  }

  return d2Result;
}

export default execute;
