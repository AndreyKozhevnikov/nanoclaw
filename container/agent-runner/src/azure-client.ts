import { AzureOpenAI } from 'openai';

export function createAzureClient(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT is required');
  }

  const apiKey = process.env.AZURE_OPENAI_API_KEY || undefined;
  const adToken = process.env.AZURE_OPENAI_TOKEN || undefined;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview';

  if (adToken) {
    return new AzureOpenAI({
      endpoint,
      azureADTokenProvider: async () => adToken,
      apiVersion,
    });
  }

  return new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion,
  });
}

export function getDeployment(): string {
  return process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1';
}
