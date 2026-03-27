import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

interface McpToolDef {
  openaiName: string;
  mcpName: string;
  serverName: string;
  description: string;
  parameters: object;
}

interface McpConnection {
  name: string;
  client: Client;
  tools: McpToolDef[];
}

export class McpManager {
  private connections: McpConnection[] = [];

  async connectStdio(
    name: string,
    command: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<void> {
    const transport = new StdioClientTransport({ command, args, env });
    const client = new Client({ name: `nanoclaw-${name}`, version: '1.0.0' });
    await client.connect(transport);

    const { tools = [] } = await client.listTools();
    const mcpTools: McpToolDef[] = tools.map((t) => ({
      openaiName: `mcp__${name}__${t.name}`,
      mcpName: t.name,
      serverName: name,
      description: t.description || '',
      parameters: t.inputSchema,
    }));

    this.connections.push({ name, client, tools: mcpTools });
  }

  async connectHttp(
    name: string,
    url: string,
    headers: Record<string, string> = {},
  ): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    });
    const client = new Client({ name: `nanoclaw-${name}`, version: '1.0.0' });
    await client.connect(transport);

    const { tools = [] } = await client.listTools();
    const mcpTools: McpToolDef[] = tools.map((t) => ({
      openaiName: `mcp__${name}__${t.name}`,
      mcpName: t.name,
      serverName: name,
      description: t.description || '',
      parameters: t.inputSchema,
    }));

    this.connections.push({ name, client, tools: mcpTools });
  }

  getToolDefinitions(): ChatCompletionTool[] {
    return this.connections.flatMap((conn) =>
      conn.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.openaiName,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        },
      })),
    );
  }

  async executeTool(openaiName: string, args: Record<string, unknown>): Promise<string> {
    for (const conn of this.connections) {
      const tool = conn.tools.find((t) => t.openaiName === openaiName);
      if (tool) {
        const result = await conn.client.callTool({ name: tool.mcpName, arguments: args });
        const content = result.content as Array<{ type: string; text?: string }>;
        return content.map((c) => c.text || '').join('\n');
      }
    }
    throw new Error(`Unknown MCP tool: ${openaiName}`);
  }

  async closeAll(): Promise<void> {
    for (const conn of this.connections) {
      try {
        await conn.client.close();
      } catch {
        // ignore
      }
    }
  }
}

export interface RemoteMcpConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Load remote MCP server configs from environment variable NANOCLAW_MCP_SERVERS.
 * Format: JSON object mapping name -> { url, headers? }
 */
export function loadRemoteMcpServers(): Record<string, RemoteMcpConfig> {
  const raw = process.env.NANOCLAW_MCP_SERVERS;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
