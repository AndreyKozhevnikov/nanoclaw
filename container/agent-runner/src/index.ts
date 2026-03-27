/**
 * NanoClaw Agent Runner (Azure OpenAI)
 * Runs inside a container, receives config via stdin, outputs results to stdout.
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createAzureClient, getDeployment } from './azure-client.js';
import { runAgentLoop } from './agent-loop.js';
import { SessionStore } from './session-store.js';
import { loadSystemPrompt } from './system-prompt.js';
import { McpManager, loadRemoteMcpServers } from './mcp-client.js';
import { toolDefinitions, executeCustomTool, CUSTOM_TOOL_NAMES } from './tools/index.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  secrets?: Record<string, string>;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) { resolve(null); return; }
      const messages = drainIpcInput();
      if (messages.length > 0) { resolve(messages.join('\n')); return; }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  // Inject secrets into process.env for the Azure OpenAI client.
  // The bash tool strips these from subprocess environments.
  for (const [key, value] of Object.entries(containerInput.secrets || {})) {
    process.env[key] = value;
  }

  let client: ReturnType<typeof createAzureClient>;
  try {
    client = createAzureClient();
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to create Azure OpenAI client: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  const deployment = getDeployment();
  const systemPrompt = loadSystemPrompt(containerInput.isMain);

  const mcpManager = new McpManager();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  try {
    await mcpManager.connectStdio('nanoclaw', 'node', [mcpServerPath], {
      NANOCLAW_CHAT_JID: containerInput.chatJid,
      NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
      NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
    });
    log('Connected to nanoclaw MCP server');
  } catch (err) {
    log(`Warning: Failed to connect nanoclaw MCP server: ${err instanceof Error ? err.message : String(err)}`);
  }

  const remoteMcpServers = loadRemoteMcpServers();
  for (const [name, config] of Object.entries(remoteMcpServers)) {
    try {
      await mcpManager.connectHttp(name, config.url, config.headers);
      log(`Connected to remote MCP server: ${name}`);
    } catch (err) {
      log(`Warning: Failed to connect MCP server ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const allTools = [...toolDefinitions, ...mcpManager.getToolDefinitions()];

  const executeTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (CUSTOM_TOOL_NAMES.has(name)) return executeCustomTool(name, args);
    if (name.startsWith('mcp__')) return mcpManager.executeTool(name, args);
    throw new Error(`Unknown tool: ${name}`);
  };

  const sessionStore = new SessionStore();
  let sessionId = containerInput.sessionId || crypto.randomUUID();

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  try {
    while (true) {
      log(`Starting agent loop (session: ${sessionId})...`);

      let messages = sessionStore.load(sessionId) || [];
      messages = SessionStore.truncate(messages);
      messages.push({ role: 'user', content: prompt });

      const result = await runAgentLoop({
        client,
        deployment,
        systemPrompt,
        tools: allTools,
        executeTool,
        messages,
        onAssistantMessage: (text) => log(`[assistant] ${text.slice(0, 200)}`),
        onToolCall: (name) => log(`[tool_call] ${name}`),
      });

      // Save session history (without system message to avoid duplication on reload)
      const toSave = result.messages.filter((m) => m.role !== 'system');
      sessionStore.save(sessionId, toSave);

      writeOutput({ status: 'success', result: result.finalText, newSessionId: sessionId });

      // Emit session-update marker so host can track the session
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log('Agent loop done, waiting for next IPC message...');

      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new turn`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({ status: 'error', result: null, newSessionId: sessionId, error: errorMessage });
    process.exit(1);
  } finally {
    await mcpManager.closeAll();
  }
}

main().catch((err) => {
  console.error('[agent-runner] Fatal error:', err);
  process.exit(1);
});

