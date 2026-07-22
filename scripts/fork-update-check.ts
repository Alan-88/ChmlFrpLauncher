// Run with: pnpm exec vite build --ssr scripts/fork-update-check.ts --outDir dist/fork-update-check && node dist/fork-update-check/fork-update-check.js
import assert from "node:assert/strict";

const {
  FORK_UPDATE_DISABLED_MESSAGE,
  FORK_UPDATES_ENABLED,
  updateService,
} = await import("../src/services/updateService");

assert.equal(FORK_UPDATES_ENABLED, false);
assert.equal(updateService.getAutoCheckEnabled(), false);
await assert.rejects(updateService.checkUpdate(), new RegExp(FORK_UPDATE_DISABLED_MESSAGE));
await assert.rejects(
  updateService.installUpdate(),
  new RegExp(FORK_UPDATE_DISABLED_MESSAGE),
);

console.log("fork update check passed");
