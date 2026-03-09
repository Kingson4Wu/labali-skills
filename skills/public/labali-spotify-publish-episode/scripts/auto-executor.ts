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
  d1_attempted: boolean;
  d1_success: boolean;
  d1_error?: string;
  final_mode: "d1" | "d2";
  final_status: "published";
  final_url: string;
}

async function appendFallbackRecord(record: FallbackRecord): Promise<void> {
  const dir = resolve(".cache/spotify-publish");
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await appendFile(resolve(dir, "d1-d2-fallback-history.jsonl"), line, "utf8");
}

export async function execute(
  inputs: PublishEpisodeInputs,
  context: AutoExecutorContext = {}
): Promise<{ status: "published"; show: string; url: string }> {
  const log = context.logger ?? ((msg: string) => console.log(`[spotify-publish-auto] ${msg}`));
  const preferDeterministic = context.preferDeterministic ?? true;

  let d1Attempted = false;
  let d1Success = false;
  let d1Error: string | undefined;

  if (preferDeterministic) {
    d1Attempted = true;
    try {
      log("D1 deterministic attempt");
      const d1Result = await executeDeterministic(inputs, {
        logger: (msg) => log(`[d1] ${msg}`),
        prompt: context.prompt,
      });
      d1Success = true;
      await appendFallbackRecord({
        timestamp: new Date().toISOString(),
        title: inputs.title,
        d1_attempted: d1Attempted,
        d1_success: d1Success,
        final_mode: "d1",
        final_status: d1Result.status,
        final_url: d1Result.url,
      });
      return d1Result;
    } catch (error) {
      d1Error = error instanceof Error ? error.message : String(error);
      log(`D1 failed, downgrade to D2: ${d1Error}`);
    }
  }

  const d2Result = await executePolicy(inputs, {
    logger: (msg) => log(`[d2] ${msg}`),
    prompt: context.prompt,
  });

  await appendFallbackRecord({
    timestamp: new Date().toISOString(),
    title: inputs.title,
    d1_attempted: d1Attempted,
    d1_success: d1Success,
    d1_error: d1Error,
    final_mode: "d2",
    final_status: d2Result.status,
    final_url: d2Result.url,
  });

  return d2Result;
}

export default execute;

