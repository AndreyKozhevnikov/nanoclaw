import type { AzureOpenAI } from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

export interface AgentLoopOptions {
  client: AzureOpenAI;
  deployment: string;
  systemPrompt: string;
  tools: ChatCompletionTool[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  messages: ChatCompletionMessageParam[];
  maxTurns?: number;
  temperature?: number;
  onAssistantMessage?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
}

export interface AgentLoopResult {
  finalText: string | null;
  messages: ChatCompletionMessageParam[];
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    client, deployment, systemPrompt, tools, executeTool,
    messages, maxTurns = 200, temperature = 0.3,
    onAssistantMessage, onToolCall,
  } = opts;

  if (messages.length === 0 || messages[0].role !== 'system') {
    messages.unshift({ role: 'system', content: systemPrompt });
  }

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.chat.completions.create({
      model: deployment,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature,
      parallel_tool_calls: true,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error('No response from model');

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      onAssistantMessage?.(assistantMessage.content || '');
      return { finalText: assistantMessage.content, messages };
    }

    const toolResults = await Promise.all(
      assistantMessage.tool_calls.map(async (toolCall) => {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }
        onToolCall?.(toolCall.function.name, args);

        let result: string;
        try {
          result = await executeTool(toolCall.function.name, args);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        return {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: result,
        };
      }),
    );

    messages.push(...toolResults);
  }

  return { finalText: null, messages };
}
