import fs from 'fs';
import path from 'path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const SESSION_DIR = '/home/node/.agent/sessions';

export class SessionStore {
  private dir: string;

  constructor(dir: string = SESSION_DIR) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  save(sessionId: string, messages: ChatCompletionMessageParam[]): void {
    const filePath = path.join(this.dir, `${sessionId}.json`);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(messages));
    fs.renameSync(tmpPath, filePath);
  }

  load(sessionId: string): ChatCompletionMessageParam[] | null {
    const filePath = path.join(this.dir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Truncate a message array to stay under a rough token estimate.
   * Keeps the system prompt and the most recent messages.
   */
  static truncate(messages: ChatCompletionMessageParam[], maxChars = 300_000): ChatCompletionMessageParam[] {
    const json = JSON.stringify(messages);
    if (json.length <= maxChars) return messages;

    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : messages;

    // Drop oldest pairs until under limit
    let trimmed = rest;
    while (trimmed.length > 2) {
      trimmed = trimmed.slice(2);
      const check = systemMsg ? [systemMsg, ...trimmed] : trimmed;
      if (JSON.stringify(check).length <= maxChars) return check;
    }

    return systemMsg ? [systemMsg, ...trimmed] : trimmed;
  }
}
