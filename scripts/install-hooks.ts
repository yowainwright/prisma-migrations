#!/usr/bin/env bun

import { existsSync, writeFileSync, chmodSync, mkdirSync } from "fs";
import { join } from "path";

const HOOKS_DIR = ".git/hooks";

const PRE_COMMIT = `#!/usr/bin/env bun

import { $ } from 'bun';

console.log('Running pre-commit checks...');

try {
  await $\`bun run format\`;
  await $\`bun run lint\`;
  await $\`bun run build\`;
  await $\`bun run test\`;
  console.log('✓ All pre-commit checks passed');
} catch (error) {
  console.error('✗ Pre-commit checks failed');
  process.exit(1);
}
`;

const POST_MERGE = `#!/usr/bin/env bun

import { $ } from 'bun';
import { existsSync } from 'fs';

console.log('Running post-merge checks...');

const lockfilePath = 'bun.lockb';
const packageJsonPath = 'package.json';

const lockfileChanged = await $\`git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD\`.text();

if (lockfileChanged.includes(lockfilePath) || lockfileChanged.includes(packageJsonPath)) {
  console.log('Dependencies changed, running bun install...');
  await $\`bun install\`;
  console.log('✓ Dependencies updated');
} else {
  console.log('✓ No dependency changes detected');
}
`;

const HOOKS = {
  "pre-commit": PRE_COMMIT,
  "post-merge": POST_MERGE,
};

const installHooks = (): void => {
  const isGitRepo = existsSync(".git");
  if (!isGitRepo) {
    console.log("Not a git repository, skipping hook installation");
    return;
  }

  const hooksDir = HOOKS_DIR;
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  let installed = 0;
  let skipped = 0;

  const hookNames = Object.keys(HOOKS) as Array<keyof typeof HOOKS>;
  for (const hookName of hookNames) {
    const hookPath = join(hooksDir, hookName);
    const hookExists = existsSync(hookPath);

    if (hookExists) {
      skipped = skipped + 1;
      continue;
    }

    const hookContent = HOOKS[hookName];
    writeFileSync(hookPath, hookContent, { mode: 0o755 });
    chmodSync(hookPath, 0o755);
    installed = installed + 1;
    console.log(`Installed ${hookName} hook`);
  }

  const hasInstalledHooks = installed > 0;
  if (hasInstalledHooks) {
    console.log(`\nInstalled ${installed} git hook(s)`);
  }

  const hasSkippedHooks = skipped > 0;
  if (hasSkippedHooks) {
    console.log(`Skipped ${skipped} existing hook(s)`);
  }

  const hasNoChanges = installed === 0 && skipped === 0;
  if (hasNoChanges) {
    console.log("No hooks to install");
  }
};

installHooks();
