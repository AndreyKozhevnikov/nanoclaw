import fs from 'fs';

const GLOBAL_SYSTEM_MD = '/workspace/global/SYSTEM.md';
const PROJECT_GLOBAL_SYSTEM_MD = '/workspace/project/groups/global/SYSTEM.md';
const GROUP_SYSTEM_MD = '/workspace/group/SYSTEM.md';
const EXTRA_BASE = '/workspace/extra';
const CONFIG_SYSTEM_MD = '/workspace/config/SYSTEM.md';

export function loadSystemPrompt(isMain: boolean): string {
  const parts: string[] = [];

  // Non-main groups read from /workspace/global. Main group can read the same
  // file from the project mount if /workspace/global is not mounted.
  const globalCandidates = isMain
    ? [GLOBAL_SYSTEM_MD, PROJECT_GLOBAL_SYSTEM_MD]
    : [GLOBAL_SYSTEM_MD];
  for (const globalPath of globalCandidates) {
    if (fs.existsSync(globalPath)) {
      parts.push(fs.readFileSync(globalPath, 'utf-8'));
      break;
    }
  }

  if (fs.existsSync(GROUP_SYSTEM_MD)) {
    parts.push(fs.readFileSync(GROUP_SYSTEM_MD, 'utf-8'));
  }

  if (fs.existsSync(EXTRA_BASE)) {
    const entries = fs.readdirSync(EXTRA_BASE).sort();
    for (const entry of entries) {
      const mdPath = `${EXTRA_BASE}/${entry}/SYSTEM.md`;
      if (fs.existsSync(mdPath)) {
        parts.push(fs.readFileSync(mdPath, 'utf-8'));
      }
    }
  }

  if (fs.existsSync(CONFIG_SYSTEM_MD)) {
    parts.push(fs.readFileSync(CONFIG_SYSTEM_MD, 'utf-8'));
  }

  return parts.join('\n\n---\n\n') || 'You are a helpful assistant.';
}
