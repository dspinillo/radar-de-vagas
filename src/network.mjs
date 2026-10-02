// O prazo inclui a leitura do corpo, não apenas a chegada dos cabeçalhos.
export const USER_AGENT = 'RadarDeVagas/0.1 (coletor de vagas publicas; Node.js)';
export function createFetch({ fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  return async (url, options = {}) => {
    const controller = new AbortController();
    let rejectAbort;
    const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => {
      controller.abort();
      rejectAbort(new Error('Requisição cancelada.'));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    let timer;
    try {
      if (options.signal?.aborted) throw new Error('Requisição cancelada.');
      return await Promise.race([
        cancelled,
        (async () => {
          const headers = new Headers(options.headers);
          headers.set('User-Agent', USER_AGENT);
          const response = await fetchImpl(url, { ...options, headers, signal: controller.signal });
          const body = await response.text();
          return { ok: response.ok, status: response.status, url: response.url,
            headers: response.headers, text: async () => body, json: async () => JSON.parse(body) };
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Tempo limite da requisição excedido.')); }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Tempo limite ou cancelamento da requisição.', { cause: error });
      throw new Error('Não foi possível acessar a fonte.', { cause: error });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  };
}
