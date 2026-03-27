import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { executeBash } from './bash.js';
import { readFile, writeFile, editFile, globFiles, grepFiles } from './files.js';
import { webFetch } from './web.js';

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a bash command in the workspace. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default 120000)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file with line numbers. Supports offset and limit for large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (relative to /workspace/group or absolute)' },
          offset: { type: 'number', description: 'Line number to start from (0-based)' },
          limit: { type: 'number', description: 'Number of lines to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating directories as needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (relative to /workspace/group or absolute within /workspace)' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace a unique string in a file. The old_string must appear exactly once.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_string: { type: 'string', description: 'The exact string to replace (must be unique in the file)' },
          new_string: { type: 'string', description: 'The replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob_files',
      description: 'Find files matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. "*.ts", "**/*.json")' },
          cwd: { type: 'string', description: 'Directory to search in (default: /workspace/group)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_files',
      description: 'Search for a pattern in files using grep.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          directory: { type: 'string', description: 'Directory to search in (default: /workspace/group)' },
          include: { type: 'string', description: 'File pattern to include (e.g. "*.ts")' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch content from a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
];

export async function executeCustomTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'bash':
      return executeBash(String(args.command), args.timeout as number | undefined);
    case 'read_file':
      return readFile(String(args.path), args.offset as number | undefined, args.limit as number | undefined);
    case 'write_file':
      return writeFile(String(args.path), String(args.content));
    case 'edit_file':
      return editFile(String(args.path), String(args.old_string), String(args.new_string));
    case 'glob_files':
      return globFiles(String(args.pattern), args.cwd as string | undefined);
    case 'grep_files':
      return grepFiles(String(args.pattern), args.directory as string | undefined, args.include as string | undefined);
    case 'web_fetch':
      return webFetch(String(args.url));
    default:
      throw new Error(`Unknown custom tool: ${name}`);
  }
}

export const CUSTOM_TOOL_NAMES = new Set(toolDefinitions.map((t) => t.function.name));
