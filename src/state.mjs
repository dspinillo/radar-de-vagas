import { open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ensureDataDir, resolveDataDir } from './data-dir.mjs';
import { makeId, validateJob, dedupKey } from './job.mjs';
import { sources as registeredSources } from './sources/index.mjs';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
const isString = value => typeof value === 'string';
const isNullableText = value => value === null || isString(value);
const isTimestamp = value => isString(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const isSource = value => isString(value) && /^[a-z0-9_-]+$/.test(value);
const isId = value => isString(value) && /^[a-z0-9_-]+:.+$/s.test(value);
const has = (object, key) => Object.hasOwn(object, key);
const put = (object, key, value) => Object.defineProperty(object, key, {
  value, enumerable: true, configurable: true, writable: true,
});

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function shape(value, fields, label) {
  requireValid(isObject(value) && Object.keys(value).length === fields.length &&
    fields.every(field => has(value, field)), `O bloco ${label} tem formato inválido.`);
}

function validateBlock(block, value) {
  if (value === null) return;
  if (block === 'triage') {
    shape(value, ['fit', 'reason', 'alerts', 'triagedAt'], 'triage');
    requireValid(Number.isInteger(value.fit) && value.fit >= 1 && value.fit <= 5 && isText(value.reason) &&
      Array.isArray(value.alerts) && Array.from(value.alerts).every(isText) && isTimestamp(value.triagedAt), 'A triagem é inválida.');
  } else if (block === 'mark') {
    shape(value, ['status', 'cutReason', 'markedAt'], 'mark');
    requireValid(['applied', 'discarded'].includes(value.status) && isNullableText(value.cutReason) &&
      (value.status !== 'discarded' || isText(value.cutReason)) && isTimestamp(value.markedAt),
    'A marcação precisa ser applied (inscrevi) ou discarded (descartar, com motivo).');
  } else {
    shape(value, ['stage', 'next', 'notes', 'updatedAt'], 'tracking');
    requireValid(isText(value.stage) && isNullableText(value.next) && isString(value.notes) && isTimestamp(value.updatedAt),
      'O acompanhamento é inválido.');
  }
}

function validateErrors(errors) {
  requireValid(Array.isArray(errors), 'Os erros da fonte precisam ser uma lista.');
  for (const error of errors) {
    shape(error, ['target', 'step', 'message'], 'erro da fonte');
    requireValid([error.target, error.step, error.message].every(isText), 'O erro da fonte precisa de alvo, etapa e mensagem.');
  }
}

function isHttpUrl(value) {
  try { return isString(value) && ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
}

function validateState(state) {
  shape(state, ['schemaVersion', 'jobs', 'aliases', 'sources'], 'estado');
  requireValid(state.schemaVersion === 1, 'Versão de estado não suportada; esperado schemaVersion 1.');
  requireValid([state.jobs, state.aliases, state.sources].every(isObject), 'Vagas, aliases e fontes precisam ser objetos.');
  for (const [id, entry] of Object.entries(state.jobs)) {
    requireValid(isId(id), 'Identificador de vaga inválido no estado.');
    shape(entry, ['job', 'seen', 'triage', 'mark', 'tracking'], 'vaga');
    const problems = validateJob(entry.job);
    requireValid(problems.length === 0, `Vaga inválida: ${problems.join('; ')}`);
    shape(entry.seen, ['firstSeenAt', 'lastSeenAt', 'dedupKey', 'alsoAt'], 'seen');
    requireValid(isTimestamp(entry.seen.firstSeenAt) && isTimestamp(entry.seen.lastSeenAt) &&
      entry.seen.firstSeenAt <= entry.seen.lastSeenAt && entry.seen.dedupKey === dedupKey(entry.job) &&
      Array.isArray(entry.seen.alsoAt), 'As informações de coleta são inválidas.');
    const jobId = makeId(entry.job.source, entry.job.sourceId);
    requireValid(jobId === id || (has(state.aliases, jobId) && state.aliases[jobId] === id),
      'A identidade da vaga não corresponde à entrada nem a um alias.');
    const seenIds = new Set();
    for (const alternate of entry.seen.alsoAt) {
      shape(alternate, ['id', 'url'], 'alsoAt');
      requireValid(isId(alternate.id) && isHttpUrl(alternate.url) && !seenIds.has(alternate.id) &&
        (alternate.id === id || (has(state.aliases, alternate.id) && state.aliases[alternate.id] === id)),
      'Uma identidade alternativa da vaga é inválida.');
      seenIds.add(alternate.id);
    }
    for (const block of ['triage', 'mark', 'tracking']) validateBlock(block, entry[block]);
  }
  for (const [alias, id] of Object.entries(state.aliases)) {
    requireValid(isId(alias) && isId(id) && !has(state.jobs, alias) && has(state.jobs, id), 'Alias inválido ou sem vaga de destino.');
    const entry = state.jobs[id];
    requireValid(makeId(entry.job.source, entry.job.sourceId) === alias || entry.seen.alsoAt.some(item => item.id === alias),
      'Alias sem identidade correspondente na vaga.');
  }
  for (const [source, run] of Object.entries(state.sources)) {
    requireValid(isSource(source), 'Nome de fonte inválido no estado.');
    shape(run, ['lastRunAt', 'errors'], 'fonte');
    requireValid(isTimestamp(run.lastRunAt), 'Data da rodada inválida.');
    validateErrors(run.errors);
  }
}

function emptyState() {
  return { schemaVersion: 1, jobs: {}, aliases: {}, sources: {} };
}

async function readState(directory) {
  let content;
  try {
    content = await readFile(join(directory, 'estado.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw new Error('Não foi possível ler estado.json. O arquivo foi preservado.', { cause: error });
  }
  try {
    // Decodificação estrita: byte inválido acusa corrupção em vez de virar "\uFFFD" na próxima gravação.
    const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
    validateState(state);
    return state;
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'o conteúdo não é JSON válido'
      : error instanceof TypeError ? 'o conteúdo não é UTF-8 válido' : error.message;
    throw new Error(`Estado inválido ou corrompido em estado.json: ${detail}. O arquivo foi preservado.`, { cause: error });
  }
}

/** Lê uma cópia atual; arquivo ausente equivale a um estado vazio. */
export async function loadState({ dataDir = resolveDataDir() } = {}) {
  return readState(await ensureDataDir(dataDir));
}

const STALE_LOCK_MS = 30000;

async function acquireLock(directory) {
  const path = join(directory, 'estado.lock');
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      return { handle: await open(path, 'wx', 0o600), path };
    } catch (error) {
      if (error.code !== 'EEXIST') throw new Error('Não foi possível obter a trava do estado.', { cause: error });
      // Uma escrita leva milissegundos: trava antiga é sobra de processo interrompido.
      const age = await stat(path).then(info => Date.now() - info.mtimeMs, () => 0);
      if (age > STALE_LOCK_MS) {
        await unlink(path).catch(() => {});
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error('O estado está ocupado (estado.lock). Tente novamente; se um processo foi interrompido, remova a trava somente depois de confirmar que nenhuma escrita está em andamento.');
      }
      await delay(25);
    }
  }
}

async function writeAtomic(directory, state) {
  const temporary = join(directory, `.estado-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, join(directory, 'estado.json'));
  } catch (error) {
    throw new Error('Não foi possível gravar estado.json de forma atômica.', { cause: error });
  } finally {
    if (handle) await handle.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function updateState(dataDir, change) {
  const directory = await ensureDataDir(dataDir);
  const lock = await acquireLock(directory);
  try {
    const state = await readState(directory);
    change(state, new Date().toISOString());
    validateState(state);
    await writeAtomic(directory, state);
    return state;
  } finally {
    await lock.handle.close();
    await unlink(lock.path);
  }
}

function canonicalId(state, id) {
  if (has(state.jobs, id)) return id;
  if (has(state.aliases, id)) return state.aliases[id];
  return null;
}

function applicationKey(job) {
  return job.applyUrl ? new URL(job.applyUrl).href : null;
}

/**
 * Dono: coleta. sources é o registro de fontes (nome/kind); runs contém
 * { source, errors }, inclusive para rodadas sem vagas. Nunca aceita envelopes.
 * Veja docs/estado-local.md para exemplos e regras de fusão.
 */
export async function addJobs(jobs, { dataDir = resolveDataDir(), sources = registeredSources, runs = [], observed = [], returnStats = false } = {}) {
  requireValid(Array.isArray(jobs) && Array.isArray(sources) && Array.isArray(runs), 'Vagas, fontes e rodadas precisam ser listas.');
  // Cópias antes da espera pela trava: o chamador não pode trocar entradas durante a escrita.
  requireValid(Array.isArray(observed) && observed.every(isId), 'Os identificadores reencontrados precisam ser uma lista de IDs completos.');
  const observedIds = [...observed];
  const incoming = structuredClone(jobs);
  const collectedRuns = structuredClone(runs);
  const kinds = new Map();
  for (const source of sources) {
    requireValid(isObject(source) && isSource(source.name) && ['search', 'company'].includes(source.kind) &&
      !kinds.has(source.name), 'O registro de fontes contém nome ou tipo inválido ou repetido.');
    kinds.set(source.name, source.kind);
  }
  for (const job of incoming) {
    const problems = validateJob(job);
    requireValid(problems.length === 0, `Vaga inválida: ${problems.join('; ')}`);
    requireValid(kinds.has(job.source), 'A fonte da vaga precisa estar no registro de fontes.');
  }
  const runErrors = new Map(incoming.map(job => [job.source, []]));
  const explicitRuns = new Set();
  for (const run of collectedRuns) {
    shape(run, ['source', 'errors'], 'rodada');
    requireValid(kinds.has(run.source) && !explicitRuns.has(run.source), 'A fonte da rodada precisa estar registrada e não pode se repetir.');
    validateErrors(run.errors);
    explicitRuns.add(run.source);
    runErrors.set(run.source, run.errors);
  }
  requireValid(observedIds.every(id => kinds.has(id.split(':')[0])), 'A fonte reencontrada precisa estar registrada.');
  let inserted = 0;
  const state = await updateState(dataDir, (state, now) => {
    for (const id of observedIds) {
      const knownId = canonicalId(state, id);
      if (knownId !== null) state.jobs[knownId].seen.lastSeenAt = now;
    }
    const applications = new Map();
    function index(id, job) {
      const key = applicationKey(job);
      if (!key) return;
      if (!applications.has(key)) applications.set(key, new Set());
      applications.get(key).add(id);
    }
    for (const [id, entry] of Object.entries(state.jobs)) index(id, entry.job);
    for (const job of incoming) {
      const id = makeId(job.source, job.sourceId);
      const knownId = canonicalId(state, id);
      if (knownId !== null) {
        state.jobs[knownId].seen.lastSeenAt = now;
        continue;
      }
      const matches = applications.get(applicationKey(job));
      // Ambiguidade no arquivo: não junta entradas existentes nem perde marcações.
      const match = matches?.size === 1 ? matches.values().next().value : null;
      if (match !== null) {
        const entry = state.jobs[match];
        put(state.aliases, id, match);
        entry.seen.lastSeenAt = now;
        entry.seen.alsoAt.push({ id, url: job.url });
        if (kinds.get(job.source) === 'company' && kinds.get(entry.job.source) === 'search') {
          const previousId = makeId(entry.job.source, entry.job.sourceId);
          if (!entry.seen.alsoAt.some(item => item.id === previousId)) {
            entry.seen.alsoAt.push({ id: previousId, url: entry.job.url });
          }
          entry.job = job;
          entry.seen.dedupKey = dedupKey(job);
        }
      } else {
        put(state.jobs, id, {
          job,
          seen: { firstSeenAt: now, lastSeenAt: now, dedupKey: dedupKey(job), alsoAt: [] },
          triage: null, mark: null, tracking: null,
        });
        inserted++;
        index(id, job);
      }
    }
    for (const [source, errors] of runErrors) put(state.sources, source, { lastRunAt: now, errors });
  });
  return returnStats ? { state, inserted } : state;
}

async function setBlock(id, block, value, dataDir) {
  requireValid(isId(id), 'Identificador de vaga inválido.');
  const input = structuredClone(value);
  const fields = {
    triage: ['fit', 'reason', 'alerts'],
    mark: ['status', 'cutReason'],
    tracking: ['stage', 'next', 'notes'],
  };
  if (input !== null) {
    if (block === 'tracking') requireValid(isObject(input) && has(input, 'stage') &&
      Object.keys(input).every(key => fields.tracking.includes(key)), 'O bloco tracking tem formato inválido.');
    else shape(input, fields[block], block);
  }
  return updateState(dataDir, (state, now) => {
    const target = canonicalId(state, id);
    requireValid(target !== null, 'Vaga não encontrada no estado.');
    const timestamp = { triage: 'triagedAt', mark: 'markedAt', tracking: 'updatedAt' }[block];
    const previous = block === 'tracking' ? { next: null, notes: '', ...state.jobs[target].tracking } : {};
    const next = input === null ? null : { ...previous, ...input, [timestamp]: now };
    validateBlock(block, next);
    state.jobs[target][block] = next;
  });
}

/** Dono: agente. null limpa apenas a triagem. */
export async function setTriage(id, triage, { dataDir = resolveDataDir() } = {}) {
  return setBlock(id, 'triage', triage, dataDir);
}

/** Dono: pessoa. null desfaz apenas a marcação. */
export async function setMark(id, mark, { dataDir = resolveDataDir() } = {}) {
  return setBlock(id, 'mark', mark, dataDir);
}

/** Dono: pessoa. Campos omitidos são preservados sob trava; null limpa o bloco. */
export async function setTracking(id, tracking, { dataDir = resolveDataDir() } = {}) {
  return setBlock(id, 'tracking', tracking, dataDir);
}
