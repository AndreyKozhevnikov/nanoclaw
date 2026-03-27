export async function webFetch(url: string, maxBytes = 50_000): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'nanoclaw-agent/1.0' },
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    const result = `Status: ${response.status}\nContent-Type: ${contentType}\n\n${text}`;
    return result.slice(0, maxBytes);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
