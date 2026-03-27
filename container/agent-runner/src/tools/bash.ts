import { execFile } from 'child_process';

const STRIPPED_ENV_VARS = new Set([
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_TOKEN',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_VERSION',
  'AZURE_OPENAI_DEPLOYMENT',
  'OPENAI_API_KEY',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'INTERNAL_MCP_TOKEN',
  'NANOCLAW_MCP_SERVERS',
]);

export async function executeBash(command: string, timeout = 120_000): Promise<string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k, v]) => v !== undefined && !STRIPPED_ENV_VARS.has(k),
    ),
  ) as Record<string, string>;

  return new Promise((resolve) => {
    execFile(
      'bash',
      ['-c', command],
      {
        cwd: '/workspace/group',
        env,
        timeout,
        maxBuffer: 1024 * 1024 * 10,
      },
      (err, stdout, stderr) => {
        let output = stdout;
        if (stderr) output += `\nSTDERR:\n${stderr}`;
        if (err && 'code' in err) output += `\n[exit code: ${err.code}]`;
        resolve(output.slice(0, 50_000));
      },
    );
  });
}
