import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

for (const directory of ['src', 'scripts', 'test', 'example/public']) {
  const files = await readdir(directory, { recursive: true });
  for (const file of files.filter(name => /\.(m?js)$/.test(name))) {
    const check = spawnSync(process.execPath, ['--check', join(directory, file)], { stdio: 'inherit' });
    if (check.status !== 0) process.exit(1);
  }
}
