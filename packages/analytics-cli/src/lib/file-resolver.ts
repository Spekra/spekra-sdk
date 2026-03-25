import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.pnpm']);

export interface ResolveJunitFilesOptions {
  cwd?: string;
}

async function collectFilesRecursively(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await collectFilesRecursively(absolutePath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function hasWildcard(input: string): boolean {
  return input.includes('*') || input.includes('?');
}

function escapeRegexChar(char: string): string {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}

function globToRegex(globPattern: string): RegExp {
  const normalized = globPattern.split(path.sep).join('/');
  let regex = '^';

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];
    const nextNext = normalized[i + 2];

    if (char === '*' && next === '*') {
      if (nextNext === '/') {
        // `**/` should match zero or more nested directories.
        regex += '(?:.*/)?';
        i += 2;
        continue;
      }

      regex += '.*';
      i++;
      continue;
    }

    if (char === '*') {
      regex += '[^/]*';
      continue;
    }

    if (char === '?') {
      regex += '[^/]';
      continue;
    }

    regex += escapeRegexChar(char);
  }

  regex += '$';
  return new RegExp(regex);
}

function normalizeForMatch(input: string): string {
  return input.split(path.sep).join('/');
}

export async function resolveJunitFiles(
  inputSpecs: string[],
  options: ResolveJunitFilesOptions = {}
): Promise<string[]> {
  const resolved = new Set<string>();
  const cwd = options.cwd ?? process.cwd();
  const allFiles = await collectFilesRecursively(cwd);

  for (const rawSpec of inputSpecs) {
    const spec = rawSpec.trim();
    if (!spec) {
      continue;
    }

    if (hasWildcard(spec)) {
      const isAbsoluteSpec = path.isAbsolute(spec);
      const normalizedSpec = normalizeForMatch(spec.replace(/^\.\//, ''));
      const regex = globToRegex(normalizedSpec);

      for (const file of allFiles) {
        const candidate = isAbsoluteSpec
          ? normalizeForMatch(path.resolve(file))
          : normalizeForMatch(path.relative(cwd, file));

        if (regex.test(candidate) && candidate.toLowerCase().endsWith('.xml')) {
          resolved.add(path.resolve(file));
        }
      }
      continue;
    }

    const absolute = path.resolve(cwd, spec);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolute);
    } catch {
      throw new Error(`Path not found: ${spec}`);
    }

    if (stat.isDirectory()) {
      const nestedFiles = await collectFilesRecursively(absolute);
      for (const file of nestedFiles) {
        if (file.toLowerCase().endsWith('.xml')) {
          resolved.add(path.resolve(file));
        }
      }
      continue;
    }

    if (stat.isFile()) {
      resolved.add(path.resolve(absolute));
    }
  }

  return [...resolved].sort();
}
