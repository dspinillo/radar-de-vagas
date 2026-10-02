import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addJobs, loadState, setMark, setTracking, setTriage } from '../src/state.mjs';

const run = promisify(execFile);
const sources = [
  { name: 'gupy', kind: 'search' },
  { name: 'linkedin', kind: 'search' },
  { name: 'greenhouse', kind: 'company' },
  { name: 'lever', kind: 'company' },
];
const mark = { status: 'discarded', cutReason: 'Modelo incompatível com a busca fictícia.' };
const triage = { fit: 3, reason: 'Encaixe de exemplo.', alerts: ['Conferir modelo.'] };
const tracking = { stage: 'entrevista', next: 'Preparar exemplos fictícios.', notes: 'Anotação de teste.' };

function job(extra = {}) {
  return {
    source: 'gupy', sourceId: 'vaga-ficticia',
    url: 'https://agregador.example/vagas/ficticia',
    applyUrl: 'https://aurora.example/inscricao/ficticia',
    company: 'Aurora Fictícia', title: 'Analista de Planejamento',
    description: 'Descrição inteira.\n\nRequisito final que não pode desaparecer.',
    publishedAt: null,
    ...extra,
  };
}

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'radar-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { dataDir: join(root, 'dados'), sources };
}

async function seed(t) {
  const options = await setup(t);
  await addJobs([job()], options);
  return options;
}

test('estado ausente devolve envelope vazio sem gravar estado.json', async t => {
  const options = await setup(t);
  assert.deepEqual(await loadState(options), { schemaVersion: 1, jobs: {}, aliases: {}, sources: {} });
  assert.deepEqual(await readdir(options.dataDir), []);
});

test('primeira coleta carimba o estado sem mudar a vaga ou inventar publicação', async t => {
  const options = await seed(t);
  const state = await loadState(options);
  const entry = state.jobs['gupy:vaga-ficticia'];
  assert.deepEqual(entry.job, job());
  assert.equal(entry.job.publishedAt, null);
  assert.equal(entry.seen.firstSeenAt, entry.seen.lastSeenAt);
  assert.equal(entry.seen.dedupKey, 'aurora ficticia|analista de planejamento');
  assert.deepEqual(entry.seen.alsoAt, []);
  assert.equal(entry.triage, null);
  assert.equal(entry.mark, null);
  assert.equal(entry.tracking, null);
  assert.equal(state.sources.gupy.lastRunAt, entry.seen.lastSeenAt);
});

test('segunda coleta não duplica, não atualiza o anúncio conhecido e não apaga ausentes', async t => {
  const options = await seed(t);
  const before = await loadState(options);
  await addJobs([job({ description: 'Outra descrição', title: 'Outro título' }), job()], options);
  await addJobs([], { ...options, runs: [{ source: 'gupy', errors: [] }] });
  const after = await loadState(options);
  assert.equal(Object.keys(after.jobs).length, 1);
  assert.deepEqual(after.jobs['gupy:vaga-ficticia'].job, before.jobs['gupy:vaga-ficticia'].job);
  assert.equal(after.jobs['gupy:vaga-ficticia'].seen.firstSeenAt, before.jobs['gupy:vaga-ficticia'].seen.firstSeenAt);
  assert.ok(after.jobs['gupy:vaga-ficticia'].seen.lastSeenAt >= before.jobs['gupy:vaga-ficticia'].seen.lastSeenAt);
});

test('nova coleta preserva integralmente marcação, triagem e acompanhamento', async t => {
  const options = await seed(t);
  const id = 'gupy:vaga-ficticia';
  await setMark(id, mark, options);
  await setTriage(id, triage, options);
  await setTracking(id, tracking, options);
  const before = (await loadState(options)).jobs[id];
  await addJobs([job({ description: 'Não pode substituir.' })], options);
  const after = (await loadState(options)).jobs[id];
  for (const block of ['job', 'mark', 'triage', 'tracking']) assert.deepEqual(after[block], before[block]);
});

test('cada dono pode limpar só o seu bloco', async t => {
  const options = await seed(t);
  const id = 'gupy:vaga-ficticia';
  await setMark(id, mark, options);
  await setTriage(id, triage, options);
  await setTracking(id, tracking, options);
  const before = (await loadState(options)).jobs[id];
  await setTriage(id, null, options);
  let entry = (await loadState(options)).jobs[id];
  assert.equal(entry.triage, null);
  assert.deepEqual(entry.mark, before.mark);
  assert.deepEqual(entry.tracking, before.tracking);
  await setMark(id, null, options);
  await setTracking(id, null, options);
  entry = (await loadState(options)).jobs[id];
  assert.equal(entry.mark, null);
  assert.equal(entry.tracking, null);
});

test('mesmo link de inscrição funde, mantém a chave e prioriza fonte por empresa', async t => {
  const options = await seed(t);
  const id = 'gupy:vaga-ficticia';
  await setMark(id, mark, options);
  await setTriage(id, triage, options);
  await setTracking(id, tracking, options);
  const before = (await loadState(options)).jobs[id];
  const companyJob = job({ source: 'greenhouse', sourceId: 'aurora/vaga-ficticia',
    url: 'https://aurora.example/vagas/ficticia', title: 'Analista de Planejamento Sênior' });
  await addJobs([companyJob], options);
  const state = await loadState(options);
  assert.deepEqual(Object.keys(state.jobs), [id]);
  assert.deepEqual(state.jobs[id].job, companyJob);
  assert.equal(state.aliases['greenhouse:aurora/vaga-ficticia'], id);
  assert.deepEqual(state.jobs[id].seen.alsoAt, [
    { id: 'greenhouse:aurora/vaga-ficticia', url: companyJob.url },
    { id, url: job().url },
  ]);
  assert.equal(state.jobs[id].seen.firstSeenAt, before.seen.firstSeenAt);
  assert.match(state.jobs[id].seen.dedupKey, /senior$/);
  for (const block of ['mark', 'triage', 'tracking']) assert.deepEqual(state.jobs[id][block], before[block]);
  await setMark('greenhouse:aurora/vaga-ficticia', { status: 'applied', cutReason: null }, options);
  await addJobs([companyJob, job()], options);
  const after = await loadState(options);
  assert.equal(after.jobs[id].mark.status, 'applied');
  assert.deepEqual(after.jobs[id].seen.alsoAt, state.jobs[id].seen.alsoAt);
});

test('fonte por empresa já preferida não é substituída por agregador nem outra empresa', async t => {
  const options = await setup(t);
  const first = job({ source: 'greenhouse', sourceId: 'aurora/primeira' });
  await addJobs([first, job(), job({ source: 'lever', sourceId: 'aurora/outra' })], options);
  const state = await loadState(options);
  assert.deepEqual(Object.keys(state.jobs), ['greenhouse:aurora/primeira']);
  assert.deepEqual(state.jobs['greenhouse:aurora/primeira'].job, first);
  assert.equal(state.jobs['greenhouse:aurora/primeira'].seen.alsoAt.length, 2);
  assert.equal(state.aliases['gupy:vaga-ficticia'], 'greenhouse:aurora/primeira');
});

test('empresa e título iguais apenas sugerem duplicata; ids locais iguais não bastam', async t => {
  const options = await setup(t);
  await addJobs([
    job({ applyUrl: null }),
    job({ source: 'linkedin', applyUrl: null }),
    job({ source: 'greenhouse', sourceId: 'aurora/vaga-ficticia', applyUrl: 'https://aurora.example/outra' }),
  ], options);
  const state = await loadState(options);
  assert.equal(Object.keys(state.jobs).length, 3);
  assert.equal(new Set(Object.values(state.jobs).map(entry => entry.seen.dedupKey)).size, 1);
  assert.deepEqual(state.aliases, {});
});

test('parâmetros distintos no link de inscrição não são removidos para forçar fusão', async t => {
  const options = await setup(t);
  await addJobs([job({ applyUrl: 'https://aurora.example/inscricao?id=primeira' }),
    job({ source: 'linkedin', applyUrl: 'https://aurora.example/inscricao?id=segunda' })], options);
  assert.equal(Object.keys((await loadState(options)).jobs).length, 2);
});

test('rodadas sem vagas guardam erros da fonte, e sucesso posterior limpa só aquela fonte', async t => {
  const options = await setup(t);
  const errors = [{ target: 'termo fictício', step: 'detalhe', message: 'Falha fictícia.' }];
  await addJobs([], { ...options, runs: [{ source: 'gupy', errors }, { source: 'linkedin', errors }] });
  const before = await loadState(options);
  assert.deepEqual(before.sources.gupy.errors, errors);
  await addJobs([job()], options);
  const after = await loadState(options);
  assert.deepEqual(after.sources.gupy.errors, []);
  assert.deepEqual(after.sources.linkedin, before.sources.linkedin);
});

for (const content of ['{ quebrado', 'null', '[]', '{}', JSON.stringify({ schemaVersion: 2, jobs: {}, aliases: {}, sources: {} })]) {
  test(`estado corrompido ou incompatível é preservado: ${content}`, async t => {
    const options = await setup(t);
    await mkdir(options.dataDir);
    const path = join(options.dataDir, 'estado.json');
    await writeFile(path, content);
    await assert.rejects(loadState(options), /Estado inválido ou corrompido.*preservado/);
    await assert.rejects(addJobs([job()], options), /Estado inválido ou corrompido.*preservado/);
    await assert.rejects(setMark('gupy:vaga-ficticia', mark, options), /Estado inválido ou corrompido/);
    assert.equal(await readFile(path, 'utf8'), content);
    assert.deepEqual(await readdir(options.dataDir), ['estado.json']);
  });
}

test('corrupção interna, alias pendente e bloco de pessoa inválido também impedem escrita', async t => {
  const options = await seed(t);
  const valid = await loadState(options);
  const path = join(options.dataDir, 'estado.json');
  const corruptions = [
    state => { state.jobs['gupy:vaga-ficticia'].mark = { status: 'applied' }; },
    state => { state.aliases['linkedin:outra'] = 'gupy:inexistente'; },
    state => { state.jobs['gupy:vaga-ficticia'].job.description = ''; },
    state => { state.jobs['gupy:vaga-ficticia'].seen.lastSeenAt = 'ontem'; },
    state => { state.jobs['gupy:vaga-ficticia'].seen.dedupKey = 'outra'; },
    state => { state.sources.gupy.errors = [{}]; },
  ];
  for (const corrupt of corruptions) {
    const state = structuredClone(valid);
    corrupt(state);
    const content = JSON.stringify(state);
    await writeFile(path, content);
    await assert.rejects(addJobs([job()], options), /Estado inválido ou corrompido/);
    assert.equal(await readFile(path, 'utf8'), content);
  }
});

test('rejeita envelopes e entradas inválidas sem alterar estado, e libera a trava após erro', async t => {
  const options = await seed(t);
  const path = join(options.dataDir, 'estado.json');
  const before = await readFile(path, 'utf8');
  for (const operation of [
    () => addJobs([job({ mark })], options),
    () => addJobs([job({ source: 'nao-registrada' })], options),
    () => addJobs([job({ description: '' })], options),
    () => addJobs([], { ...options, runs: [{ source: 'gupy', errors: [{}] }] }),
    () => setMark('gupy:vaga-ficticia', { status: 'discarded', cutReason: '' }, options),
    () => setMark('gupy:vaga-ficticia', { ...mark, tracking }, options),
    () => setTriage('gupy:vaga-ficticia', { ...triage, fit: 6 }, options),
    () => setTracking('gupy:vaga-ficticia', { ...tracking, stage: '' }, options),
    () => setMark('gupy:ausente', mark, options),
  ]) {
    await assert.rejects(operation);
    assert.equal(await readFile(path, 'utf8'), before);
    assert.deepEqual(await readdir(options.dataDir), ['estado.json']);
  }
  await setMark('gupy:vaga-ficticia', mark, options);
});

test('retornos são cópias e não oferecem caminho para sobrescrever blocos de outro dono', async t => {
  const options = await seed(t);
  const state = await loadState(options);
  state.jobs['gupy:vaga-ficticia'].mark = mark;
  state.jobs = {};
  const persisted = await loadState(options);
  assert.equal(Object.keys(persisted.jobs).length, 1);
  assert.equal(persisted.jobs['gupy:vaga-ficticia'].mark, null);
});

test('gravação usa troca de arquivo e remove temporários; arquivos de dados são privados', async t => {
  const options = await seed(t);
  const path = join(options.dataDir, 'estado.json');
  const before = await stat(path);
  await setMark('gupy:vaga-ficticia', mark, options);
  const after = await stat(path);
  if (process.platform !== 'win32') {
    assert.notEqual(before.ino, after.ino);
    assert.equal(after.mode & 0o777, 0o600);
    assert.equal((await stat(options.dataDir)).mode & 0o777, 0o700);
  }
  assert.deepEqual(await readdir(options.dataDir), ['estado.json']);
});

test('escritas simultâneas releem sob a trava e preservam todos os donos e vagas', async t => {
  const options = await seed(t);
  const id = 'gupy:vaga-ficticia';
  await Promise.all([
    setMark(id, mark, options), setTriage(id, triage, options), setTracking(id, tracking, options),
    ...Array.from({ length: 8 }, (_, index) => addJobs([job({ sourceId: `nova-${index}`, applyUrl: null })], options)),
  ]);
  const state = await loadState(options);
  assert.equal(Object.keys(state.jobs).length, 9);
  assert.equal(state.jobs[id].mark.status, mark.status);
  assert.equal(state.jobs[id].triage.reason, triage.reason);
  assert.equal(state.jobs[id].tracking.notes, tracking.notes);
});

test('trava funciona entre processos distintos sem perder marcação ou coleta', async t => {
  const options = await seed(t);
  const moduleUrl = new URL('../src/state.mjs', import.meta.url).href;
  const script = `
    import { addJobs, setMark } from ${JSON.stringify(moduleUrl)};
    const options = JSON.parse(process.env.RADAR_TEST_OPTIONS);
    const index = process.env.RADAR_TEST_INDEX;
    if (index === 'mark') await setMark('gupy:vaga-ficticia', ${JSON.stringify(mark)}, options);
    else await addJobs([{ ...${JSON.stringify(job())}, sourceId: 'processo-' + index, applyUrl: null }], options);
  `;
  await Promise.all(['mark', 'a', 'b', 'c'].map(index => run(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, RADAR_TEST_OPTIONS: JSON.stringify(options), RADAR_TEST_INDEX: index },
  })));
  const state = await loadState(options);
  assert.equal(Object.keys(state.jobs).length, 4);
  assert.equal(state.jobs['gupy:vaga-ficticia'].mark.status, mark.status);
});

test('nomes especiais de propriedades não alteram protótipos nem desaparecem do estado', async t => {
  const options = await setup(t);
  options.sources = [...sources, { name: '__proto__', kind: 'search' }, { name: 'constructor', kind: 'search' }];
  await addJobs([job({ source: '__proto__', sourceId: 'id:com:separadores', applyUrl: null }),
    job({ source: 'constructor', applyUrl: null })], options);
  const state = await loadState(options);
  assert.ok(Object.hasOwn(state.sources, '__proto__'));
  assert.ok(Object.hasOwn(state.sources, 'constructor'));
  assert.equal(Object.keys(state.jobs).length, 2);
  assert.equal(Object.getPrototypeOf(state.sources), Object.prototype);
});

test('triagem com lacuna na lista de alertas é recusada e o estado continua legível', async t => {
  const options = await seed(t);
  await assert.rejects(setTriage('gupy:vaga-ficticia', { ...triage, alerts: Array(1) }, options), /triagem é inválida/);
  assert.equal((await loadState(options)).jobs['gupy:vaga-ficticia'].triage, null);
});

test('byte inválido em estado.json acusa corrupção e a coleta não regrava o arquivo', async t => {
  const options = await seed(t);
  await setMark('gupy:vaga-ficticia', mark, options);
  const path = join(options.dataDir, 'estado.json');
  const bytes = await readFile(path);
  bytes[bytes.indexOf('Modelo incompat')] = 0xff;
  await writeFile(path, bytes);
  await assert.rejects(addJobs([job({ sourceId: 'outra-vaga', applyUrl: null })], options), /UTF-8 válido.*preservado/);
  assert.deepEqual(await readFile(path), bytes);
});

test('trava esquecida por processo interrompido é descartada', async t => {
  const options = await seed(t);
  const lock = join(options.dataDir, 'estado.lock');
  await writeFile(lock, '');
  const old = new Date(Date.now() - 60000);
  await utimes(lock, old, old);
  await setMark('gupy:vaga-ficticia', mark, options);
  assert.equal((await loadState(options)).jobs['gupy:vaga-ficticia'].mark.status, 'discarded');
  assert.ok(!(await readdir(options.dataDir)).includes('estado.lock'));
});
