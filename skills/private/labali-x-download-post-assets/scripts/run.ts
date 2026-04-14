#!/usr/bin/env node
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'post-url': { type: 'string', short: 'u' },
    'output-dir': { type: 'string', short: 'o' },
    'cdp-port': { type: 'string', short: 'p', default: '9222' },
    'profile-dir': { type: 'string', short: 'd' },
    'timeout-ms': { type: 'string', short: 't' },
    'overwrite': { type: 'boolean', short: 'w', default: false },
    'help': { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: npx tsx run.ts --post-url <url> [--output-dir <dir>] [--overwrite]`);
  process.exit(0);
}

const inputs = {
  post_url: values['post-url'] as string | undefined,
  output_dir: values['output-dir'] as string | undefined,
  cdp_port: values['cdp-port'] as string | undefined,
  profile_dir: values['profile-dir'] as string | undefined,
  timeout_ms: values['timeout-ms'] ? parseInt(values['timeout-ms'] as string) : undefined,
  overwrite: values.overwrite,
};

const { execute } = await import('./executor.js');
const result = await execute(inputs);
console.log(JSON.stringify(result, null, 2));
