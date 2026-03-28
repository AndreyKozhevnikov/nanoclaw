import fs from 'fs';

const GLOBAL_SYSTEM_MD = '/workspace/global/SYSTEM.md';
const GROUP_SYSTEM_MD = '/workspace/group/SYSTEM.md';
const EXTRA_BASE = '/workspace/extra';
const CONFIG_SYSTEM_MD = '/workspace/config/SYSTEM.md';

export function loadSystemPrompt(_isMain: boolean): string {
  const parts: string[] = [];

  if (fs.existsSync(GLOBAL_SYSTEM_MD)) {
    parts.push(fs.readFileSync(GLOBAL_SYSTEM_MD, 'utf-8'));
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
