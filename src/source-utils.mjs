import { stripHtml, validateJob } from './job.mjs';
import { createFetch } from './network.mjs';

export const text = value => typeof value === 'string' ? value.trim() : '';
export const date = value => typeof value === 'string' ? value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null : null;
export const workModel = value => ({ remote: 'remote', hybrid: 'hybrid', 'on-site': 'onsite', onsite: 'onsite' })[text(value).toLowerCase()] ?? null;
export function html(value) {
  if (value != null && typeof value !== 'string') throw new TypeError('Conteúdo HTML inválido.');
  return stripHtml(value);
}
export function identifier(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) throw new Error('Identificador da vaga ausente.');
  return String(value);
}
export function array(value) {
  if (!Array.isArray(value)) throw new Error('Resposta malformada: era esperada uma lista de vagas.');
  return value;
}
export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta malformada: era esperado um objeto.');
  return value;
}
export function companyToken(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Identificador de empresa inválido; use o identificador da página de carreiras.');
  return value;
}
export function createSource({ name, label, kind, run, defaultEnabled = true }) {
  return { name, label, kind, defaultEnabled, async collect(ctx = {}) {
    const jobs = [], errors = [], seen = new Set(), observed = new Set(), deferred = new Set();
    const known = new Set(ctx.known ?? []), queue = [];
    const limit = ctx.search?.detalhesNovosPorFonte ?? 150;
    const log = ctx.log ?? (() => {});
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = Date.parse(today) - (ctx.search?.idadeMaximaDias ?? Infinity) * 86400000;
    let selected = 0, completed = 0;
    const check = () => ctx.signal?.throwIfAborted();
    if (kind === 'search' && (ctx.search?.fontes?.[name] === false || (!defaultEnabled && ctx.search?.fontes?.[name] !== true))) return { jobs, errors };
    const fetch = createFetch({ fetch: ctx.fetch, timeoutMs: ctx.timeoutMs });
    const warn = (target, step, error) => errors.push({ target: String(target), step,
      message: error instanceof TypeError || error instanceof SyntaxError || error instanceof RangeError
        ? 'Resposta malformada: campos da fonte em formato inesperado.'
        : error?.message || 'Falha inesperada ao consultar a fonte.' });
    const state = {
      ctx, seen, warn, stopped: false,
      sleep: ctx.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
      async request(url, options, format = 'json') {
        check();
        const response = await fetch(url, { ...options, signal: ctx.signal ?? options?.signal });
        check();
        if (!response.ok) {
          const error = new Error(`A fonte respondeu com erro HTTP ${response.status}.`);
          error.status = response.status;
          throw error;
        }
        try { return format === 'text' ? await response.text() : await response.json(); }
        catch { throw new Error('Resposta malformada: JSON inválido.'); }
      },
      async item(target, build, publishedAt = null) {
        check();
        if (known.has(target)) { observed.add(target); return; }
        if (seen.has(target) || state.stopped) return;
        // Só uma data de publicação válida permite excluir por idade.
        const published = date(publishedAt);
        if (published && Number.isFinite(Date.parse(published)) &&
            new Date(published).toISOString().slice(0, 10) === published && Date.parse(published) < cutoff) return;
        if (selected >= limit) { deferred.add(target); return; }
        seen.add(target);
        selected++;
        const task = async () => {
          if (ctx.signal?.aborted || state.stopped) return;
          try {
            const job = await build();
            check();
            const problems = validateJob(job);
            if (problems.length) throw new Error(`Vaga incompleta ou inválida: ${problems.join('; ')}.`);
            jobs.push(job);
          } catch (error) { if (!ctx.signal?.aborted) warn(target, 'detalhe', error); }
          finally { completed++; if (!ctx.signal?.aborted) log(`${label}: detalhes ${completed} de ${selected}.`); }
        };
        if (name === 'linkedin') await task();
        else queue.push(task);
      },
      async flush() {
        const tasks = queue.splice(0);
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
          while (next < tasks.length && !ctx.signal?.aborted && !state.stopped) await tasks[next++]();
        }));
      },
      listing(target, pageNumber, count) {
        check();
        log(`${label}: página ${pageNumber} (${target}), ${count} vagas na listagem.`);
      },
      pages: new Set(),
      page(items, key, pageNumber) {
        const signature = `${key}:${JSON.stringify(items.map(item => item?.id ?? item?.jobId ?? item))}`;
        if (state.pages.has(signature)) throw new Error('Paginação repetida; a coleta deste alvo foi interrompida.');
        state.pages.add(signature);
        if (ctx.maxPages && pageNumber >= ctx.maxPages) {
          warn(key, 'paginação', new Error('Limite de páginas desta execução atingido; resultado parcial.'));
          return false;
        }
        return true;
      },
    };
    try {
      const targets = kind === 'search' ? ctx.search?.termos ?? [] : ctx.companies ?? ctx.search?.empresas?.[name] ?? [];
      for (const target of array(targets)) {
        if (state.stopped || ctx.signal?.aborted) break;
        try { await run(state, kind === 'company' ? companyToken(target) : target); }
        catch (error) { if (!ctx.signal?.aborted) warn(target, 'busca', error); }
        await state.flush();
      }
    } catch (error) { warn(name, 'configuração', error); }
    if (deferred.size) warn(name, 'limite', new Error(`${deferred.size} vagas ficaram para a próxima rodada (teto de ${limit} detalhes novos por fonte).`));
    return { jobs, errors, observed: [...observed] };
  } };
}

// Extrai o elemento inteiro, incluindo divs aninhadas na descrição.
export function elementByClass(source, className) {
  // Comentários e elementos de texto bruto são tokens inteiros: seu conteúdo
  // pode conter tags aparentes, mas não participa da árvore da descrição.
  const tags = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)\b(?:"[^"]*"|'[^']*'|[^'">])*\s*>[\s\S]*?(?:<\/\1\s*>|$)|<\/?([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  let start = null, depth = 0, tagName;
  for (const match of source.matchAll(tags)) {
    if (!match[2]) continue;
    const closing = match[0].startsWith('</');
    if (start === null) {
      const classes = match[0].match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1]?.split(/\s+/);
      if (!closing && classes?.includes(className)) { start = match.index + match[0].length; tagName = match[2].toLowerCase(); depth = 1; }
    } else if (match[2].toLowerCase() === tagName) {
      depth += closing ? -1 : 1;
      if (depth === 0) return source.slice(start, match.index);
    }
  }
  return '';
}
export function nextData(source) {
  const value = source.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  try { return object(JSON.parse(value)); }
  catch { throw new Error('Resposta malformada: detalhe da vaga não encontrado na página.'); }
}
