/**
 * API Login - entry point of `bun run api:login`.
 *
 * Wires the synced CLI (scripts/lib/api-login-core.ts) to this project's auth
 * adapter (scripts/api-login.project.ts). Adapt the adapter, never this file.
 */

import * as projectAdapter from './api-login.project';
import { runApiLogin } from './lib/api-login-core';

process.exit(await runApiLogin(projectAdapter));
