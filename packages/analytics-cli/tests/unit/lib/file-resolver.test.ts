import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveJunitFiles } from '../../../src/lib/file-resolver';

describe('resolveJunitFiles', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'spekra-analytics-cli-'));

    await mkdir(path.join(tempDir, 'reports', 'nested'), { recursive: true });
    await writeFile(path.join(tempDir, 'reports', 'root.xml'), '<testsuites />', 'utf8');
    await writeFile(path.join(tempDir, 'reports', 'nested', 'child.xml'), '<testsuites />', 'utf8');
    await writeFile(path.join(tempDir, 'reports', 'ignore.txt'), 'not xml', 'utf8');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves XML files from a directory input', async () => {
    const files = await resolveJunitFiles(['reports'], { cwd: tempDir });

    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/child\.xml$|root\.xml$/);
    expect(files[1]).toMatch(/child\.xml$|root\.xml$/);
  });

  it('resolves XML files from a glob input', async () => {
    const files = await resolveJunitFiles(['reports/**/*.xml'], { cwd: tempDir });

    expect(files).toHaveLength(2);
    expect(files.every((file) => file.endsWith('.xml'))).toBe(true);
  });

  it('throws on missing path', async () => {
    await expect(resolveJunitFiles(['does-not-exist'], { cwd: tempDir })).rejects.toThrow(
      'Path not found: does-not-exist'
    );
  });
});
