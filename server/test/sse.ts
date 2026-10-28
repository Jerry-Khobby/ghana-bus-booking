/** One Server-Sent Event as the browser's EventSource would see it. */
export interface SseEvent {
  type: string;
  data: string;
}

/**
 * A minimal EventSource for tests: opens the stream, parses events as they
 * arrive, and lets a test wait for the next one it cares about.
 */
export async function openStream(url: string, headers: HeadersInit = {}) {
  const controller = new AbortController();
  const response = await fetch(url, { headers, signal: controller.signal });
  const queue: SseEvent[] = [];
  const waiting: (() => void)[] = [];
  let ended = false;

  const pump = (async () => {
    if (!response.ok || !response.body) return;
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        let gap: number;
        while ((gap = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, gap);
          buffer = buffer.slice(gap + 2);
          const event: SseEvent = { type: 'message', data: '' };
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event.type = line.slice(6).trim();
            if (line.startsWith('data:')) event.data += line.slice(5).trim();
          }
          if (block.trim()) queue.push(event);
          waiting.splice(0).forEach((wake) => wake());
        }
      }
    } catch {
      // Aborted by close()
    } finally {
      ended = true;
      waiting.splice(0).forEach((wake) => wake());
    }
  })();

  /** The next event of this type, skipping others (pings, say). */
  async function next<T = unknown>(type: string, timeoutMs = 5000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = queue.findIndex((e) => e.type === type);
      if (index >= 0) {
        const [event] = queue.splice(index, 1);
        return JSON.parse(event.data) as T;
      }
      if (ended) throw new Error(`Stream ended before a "${type}" event`);
      const left = deadline - Date.now();
      if (left <= 0)
        throw new Error(`No "${type}" event within ${timeoutMs} ms`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        waiting.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Resolves once the server closes the stream. */
  async function ended$(timeoutMs = 5000) {
    await Promise.race([
      pump,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Stream stayed open')), timeoutMs),
      ),
    ]);
  }

  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    json: () => response.json() as Promise<{ error: { code: string } }>,
    next,
    ended: ended$,
    close: () => controller.abort(),
  };
}
