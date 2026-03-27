import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export function readFile(
  filePath: string,
  offset?: number,
  limit?: number,
): string {
  const abs = path.resolve('/workspace/group', filePath);
  if (!abs.startsWith('/workspace/') && !path.isAbsolute(filePath)) {
    return `Error: Path outside workspace`;
  }

  if (!fs.existsSync(abs)) return `Error: File not found: ${filePath}`;

  const content = fs.readFileSync(abs, 'utf-8');
  const lines = content.split('\n');
  const start = offset ?? 0;
  const end = limit != null ? start + limit : lines.length;
  const slice = lines.slice(start, end);

  return slice
    .map((line, i) => `${start + i + 1}  ${line}`)
    .join('\n');
}

export function writeFile(filePath: string, content: string): string {
  const abs = path.resolve('/workspace/group', filePath);
  if (!abs.startsWith('/workspace/')) {
    return `Error: Path outside workspace`;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return `Written: ${abs}`;
}

export function editFile(
  filePath: string,
  oldString: string,
  newString: string,
): string {
  const abs = path.resolve('/workspace/group', filePath);
  if (!abs.startsWith('/workspace/')) {
    return `Error: Path outside workspace`;
  }
  if (!fs.existsSync(abs)) return `Error: File not found: ${filePath}`;

  const content = fs.readFileSync(abs, 'utf-8');
  const count = content.split(oldString).length - 1;
  if (count === 0) return `Error: String not found in file`;
  if (count > 1) return `Error: String matches ${count} times (must be unique)`;

  fs.writeFileSync(abs, content.replace(oldString, newString), 'utf-8');
  return `Edited: ${abs}`;
}

export function globFiles(pattern: string, cwd?: string): string {
  try {
    const result = execFileSync(
      'bash',
      ['-c', `find ${cwd || '/workspace/group'} -type f -name "${pattern}" 2>/dev/null | head -200`],
      { encoding: 'utf-8', timeout: 10_000 },
    );
    return result.trim() || '(no matches)';
  } catch {
    return '(no matches)';
  }
}

export function grepFiles(
  pattern: string,
  directory?: string,
  include?: string,
): string {
  const dir = directory || '/workspace/group';
  const args = ['-r', '-n', '--include', include || '*', pattern, dir];
  try {
    return execFileSync('grep', args, {
      encoding: 'utf-8',
      timeout: 15_000,
      maxBuffer: 1024 * 1024 * 5,
    }).slice(0, 50_000);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && err.status === 1) {
      return '(no matches)';
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
