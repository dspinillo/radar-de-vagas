import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSource } from '../src/source-utils.mjs';
import { sources } from '../src/sources/index.mjs';
import { collect } from '../src/collect.mjs';
import { createFetch } from '../src/network.mjs';
import { loadSearch, validateSearch } from '../src/data-dir.mjs';
import { addJobs, loadState, setMark, setTriage, setTracking } from '../src/state.mjs';
import { main } from '../bin/radar.mjs';
import * as view from '../src/page/view.mjs';

const response = body => new Response(typeof body === 'string' ? body : JSON.stringify(body));
const fixture = async name => readFile(new URL(`./fixtures/sources/${name}`, import.meta.url), 'utf8');
const fixtures = JSON.parse(await fixture('responses.json'));
const gupyDetail = await fixture('gupy-detail.html');
const search = { termos: ['qualquer título'], localidade: null, modelo: 'remoto', idadeMaximaDias: 30,
  fontes: { gupy: true, linkedin: true }, empresas: { greenhouse: ['aurora'], lever: ['nebulosa'], ashby: ['orbita'], inhire: ['constelacao'] } };
const job = (sourceId = 'ficticia', source = 'gupy') => ({ source, sourceId, url: `https://aurora.example/${sourceId}`,
  title: 'Outro título comercial', company: 'Aurora Fictícia', description: 'Descrição completa.', workModel: 'onsite', publishedAt: null });
const fakeSource = (name, run) => ({ name, label: name, kind: 'search', defaultEnabled: true, collect: run });
async function setup(t, changes = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'radar-finais-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await writeFile(join(dataDir, 'busca.json'), JSON.stringify({ ...search, ...changes }));
  return { dataDir };
}

for (const [name, field, dateKey] of [['gupy', 'data', 'publishedDate'], ['greenhouse', 'jobs', 'first_published'],
  ['ashby', 'jobs', 'publishedAt'], ['inhire', 'jobsPage', 'publishedAt']]) {
  test(`${name}: idade da listagem impede detalhe; ausência de data passa sem corte de título ou modelo`, async () => {
    const listing = structuredClone(fixtures[name]);
    const item = listing[field][0];
    item[dateKey] = '2000-01-01';
    const unknown = { ...item, [dateKey]: null, id: 'sem-data', ...(name === 'inhire' ? { jobId: 'sem-data' } : {}) };
    listing[field].push(unknown);
    let calls = 0;
    const result = await sources.find(s => s.name === name).collect({ search, fetch: async () => {
      calls++;
      if (calls === 1) return response(listing);
      return response(name === 'gupy' ? gupyDetail : fixtures.inhireDetail);
    } });
    assert.deepEqual(result.errors, []);
    assert.equal(result.jobs.length, 1);
    assert.ok(result.jobs[0].sourceId.endsWith('sem-data'));
    assert.equal(calls, ['gupy', 'inhire'].includes(name) ? 2 : 1);
  });
}
test('LinkedIn usa a data de cada cartão antes do detalhe e conserva chamadas em série', async () => {
  const list = await fixture('linkedin-list.html'), detail = await fixture('linkedin-detail.html');
  const old = list.replace('</li>', '<time datetime="2000-01-01"></time></li>');
  const unknown = list.replaceAll('50101', '50102');
  const replies = [old + unknown, detail, ''];
  const events = [];
  const result = await sources.find(s => s.name === 'linkedin').collect({ search,
    sleep: async ms => events.push(`espera ${ms}`), fetch: async url => { events.push(String(url)); return response(replies.shift()); } });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].sourceId, '50102');
  assert.deepEqual(events.filter(e => e.startsWith('espera')), ['espera 1000', 'espera 1000']);
  assert.match(events[2], /jobPosting\/50102/);
});
test('idade civil inclui o dia limite; datas desconhecidas ou inválidas nunca são descartadas', async () => {
  const boundary = new Date(Date.parse(new Date().toISOString().slice(0, 10)) - 30 * 86400000).toISOString().slice(0, 10);
  const source = createSource({ name: 'gupy', label: 'Gupy', kind: 'search', async run(s) {
    for (const [id, date] of [['limite', boundary], ['nula', null], ['invalida', '2000-02-31'], ['antiga', '2000-01-01']]) {
      await s.item(id, async () => job(id), date);
    }
  } });
  const result = await source.collect({ search });
  assert.deepEqual(result.jobs.map(j => j.sourceId).sort(), ['invalida', 'limite', 'nula']);
});
for (const name of ['gupy', 'greenhouse', 'lever', 'ashby', 'inhire']) {
  test(`${name}: helper executa quatro detalhes simultâneos, nunca cinco`, async () => {
    let active = 0, peak = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const source = createSource({ name, label: name, kind: 'search', async run(s) {
      for (let i = 0; i < 9; i++) await s.item(`vaga-${i}`, async () => {
        active++; peak = Math.max(peak, active);
        if (active === 4) release();
        await gate;
        await delay(1);
        active--;
        return job(`vaga-${i}`, name);
      });
    } });
    const result = await source.collect({ search: { termos: ['um'] } });
    assert.equal(peak, 4);
    assert.equal(result.jobs.length, 9);
  });
}
test('teto padrão 150 é global por fonte e não inclui conhecidas; adiadas não são observadas', async () => {
  const source = createSource({ name: 'gupy', label: 'Gupy', kind: 'search', async run(s) {
    for (let i = 0; i < 154; i++) await s.item(`vaga-${i}`, async () => job(`vaga-${i}`));
  } });
  const result = await source.collect({ search: { termos: ['um', 'dois'] }, known: new Set(['vaga-0']) });
  assert.equal(result.jobs.length, 150);
  assert.deepEqual(result.observed, ['vaga-0']);
  assert.match(result.errors[0].message, /3 vagas ficaram para a próxima rodada/);
});
test('teto configurado passa à Gupy; rodada seguinte coleta a fila e atualiza lastSeenAt sem rebuscar detalhes', async t => {
  const options = await setup(t, { detalhesNovosPorFonte: 1, termos: ['um'] });
  let details = 0;
  const listing = { data: ['um', 'dois', 'tres'].map(id => ({ ...fixtures.gupy.data[0], id })) };
  options.sources = [sources.find(s => s.name === 'gupy')];
  options.fetch = async url => {
    if (String(url).includes('/api/job-search/')) return response(listing);
    details++; return response(gupyDetail);
  };
  const logs = [];
  const first = await collect({ ...options, log: value => logs.push(value) });
  assert.equal(first.totalNew, 1);
  assert.match(first.sources[0].errors[0].message, /2 vagas ficaram/);
  await setMark('gupy:um', { status: 'applied', cutReason: null }, options);
  await setTriage('gupy:um', { fit: 3, reason: 'Exemplo.', alerts: [] }, options);
  await setTracking('gupy:um', { stage: 'entrevista', next: null, notes: 'Exemplo.' }, options);
  const before = (await loadState(options)).jobs['gupy:um'];
  await delay(5);
  const second = await collect(options);
  const after = (await loadState(options)).jobs['gupy:um'];
  assert.equal(second.totalNew, 1);
  assert.equal(second.sources[0].seen, 2);
  assert.equal(details, 2);
  assert.ok(after.seen.lastSeenAt > before.seen.lastSeenAt);
  for (const block of ['job', 'mark', 'triage', 'tracking']) assert.deepEqual(after[block], before[block]);
  assert.equal(after.seen.firstSeenAt, before.seen.firstSeenAt);
  assert.deepEqual(Object.keys((await loadState(options)).jobs).sort(), ['gupy:dois', 'gupy:um']);
  assert.match(logs.join('\n'), /fonte iniciada[\s\S]*página 1[\s\S]*detalhes 1 de 1[\s\S]*fonte concluída/);
});
test('reencontro por alias atualiza apenas seen, sem criar entrada nem alterar decisões', async t => {
  const options = await setup(t);
  const original = { ...job(), applyUrl: 'https://aurora.example/aplicar' };
  await addJobs([original, { ...original, source: 'greenhouse', sourceId: 'aurora/ficticia' }], options);
  await setMark('gupy:ficticia', { status: 'applied', cutReason: null }, options);
  const before = (await loadState(options)).jobs['gupy:ficticia'];
  await delay(5);
  const result = await addJobs([], { ...options, observed: ['greenhouse:aurora/ficticia'], returnStats: true });
  assert.equal(result.inserted, 0);
  const after = result.state.jobs['gupy:ficticia'];
  assert.ok(after.seen.lastSeenAt > before.seen.lastSeenAt);
  for (const block of ['job', 'mark', 'triage', 'tracking']) assert.deepEqual(after[block], before[block]);
});
test('duas coletas simultâneas contam uma única inserção dentro da trava', async t => {
  const options = await setup(t);
  let count = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  options.sources = [fakeSource('gupy', async () => {
    if (++count === 2) release();
    await gate;
    return { jobs: [job()], errors: [] };
  })];
  const results = await Promise.all([collect(options), collect(options)]);
  assert.deepEqual(results.map(r => r.totalNew).sort(), [0, 1]);
  assert.equal(Object.keys((await loadState(options)).jobs).length, 1);
});
for (const mode of ['injetado', 'arquivo']) {
  test(`prazo total ${mode}: fonte que nunca resolve vira erro e a próxima continua`, { timeout: 6000 }, async t => {
    const options = await setup(t, { prazoFonteSegundos: 1 });
    let signal;
    options.sources = [fakeSource('linkedin', async ctx => { signal = ctx.signal; return new Promise(() => {}); }),
      fakeSource('gupy', async () => ({ jobs: [job()], errors: [] }))];
    const result = await collect({ ...options, ...(mode === 'injetado' ? { sourceTimeoutMs: 20 } : {}) });
    assert.equal(signal.aborted, true);
    assert.match(result.sources[0].errors[0].message, /Prazo total/);
    assert.equal(result.sources[1].new, 1);
    assert.match((await loadState(options)).sources.linkedin.errors[0].message, /Prazo total/);
  });
}
test('cancelamento rejeita fetch pendente e não inicia requisições após abortar', async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetch = createFetch({ fetch: async () => { calls++; return new Promise(() => {}); } });
  const pending = fetch('https://aurora.example', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /cancelamento/);
  await assert.rejects(fetch('https://aurora.example', { signal: controller.signal }));
  assert.equal(calls, 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`CLI ${signal}: progresso chega antes do fim; fonte anterior já está salva e não sobram trava ou temporários`, async t => {
    const options = await setup(t);
    const signals = new EventEmitter(), logs = [];
    options.sources = [fakeSource('gupy', async () => ({ jobs: [job()], errors: [] })), fakeSource('linkedin', async () => {
      assert.ok((await loadState(options)).jobs['gupy:ficticia']);
      signals.emit(signal);
      return new Promise(() => {});
    })];
    const code = await main(['collect'], { signals, stdout: text => logs.push(text), stderr: () => {},
      collect: ctx => collect({ ...options, ...ctx }) });
    assert.equal(code, 130);
    assert.ok((await loadState(options)).jobs['gupy:ficticia']);
    assert.deepEqual((await readdir(options.dataDir)).sort(), ['busca.json', 'estado.json']);
    assert.match(logs.join('\n'), /fonte iniciada[\s\S]*estado salvo/);
    assert.equal(signals.listenerCount(signal), 0);
  });
}
test('Ctrl+C real durante escrita atômica aguarda limpeza de trava e temporário', async t => {
  const options = await setup(t);
  const script = `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { collect } from './src/collect.mjs';
    import { main } from './bin/radar.mjs';
    const open = fs.open;
    fs.open = async (...args) => {
      const handle = await open(...args);
      if (String(args[0]).includes('.estado-')) {
        process.kill(process.pid, 'SIGINT');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return handle;
    };
    syncBuiltinESMExports();
      process.exitCode = await main(['collect'], { collect: ctx => collect({ ...ctx, sources: [{
        name: 'gupy', label: 'Gupy', kind: 'search', defaultEnabled: true,
        collect: async () => ({ jobs: [${JSON.stringify(job())}], errors: [] }),
      }] }) });

  `;
  await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, RADAR_DATA_DIR: options.dataDir }, timeout: 10000,
  }), error => { assert.equal(error.code, 130, error.stderr); return true; });
  assert.ok((await loadState(options)).jobs['gupy:ficticia']);
  assert.deepEqual((await readdir(options.dataDir)).sort(), ['busca.json', 'estado.json']);
});
test('campos opcionais da busca aceitam somente inteiros positivos e preservam arquivos antigos', async t => {
  assert.deepEqual(validateSearch(search), []);
  for (const key of ['detalhesNovosPorFonte', 'prazoFonteSegundos']) {
    for (const value of [0, -1, null, 1.5, '150']) assert.ok(validateSearch({ ...search, [key]: value }).length);
    assert.deepEqual(validateSearch({ ...search, [key]: 2 }), []);
  }
  const options = await setup(t);
  const empty = { dataDir: join(options.dataDir, 'padroes') };
  const config = await loadSearch(empty);
  assert.equal(config.detalhesNovosPorFonte, 150);
  assert.equal(config.prazoFonteSegundos, 600);
});
for (const staleFails of [false, true]) {
  test(`marcação exige GET posterior ao POST mesmo com GET antigo ${staleFails ? 'falhando' : 'atrasado'}`, async () => {
    const elements = new Map();
    const select = key => {
      if (!elements.has(key)) elements.set(key, { value: key === '#status' ? 'all' : '', dataset: {},
        addEventListener() {}, focus() {} });
      return elements.get(key);
    };
    const entry = { id: 'gupy:ficticia', job: job(), seen: { firstSeenAt: '2026-01-01' }, mark: null };
    let getCount = 0, release, posted = false;
    const stale = new Promise((resolve, reject) => { release = () => staleFails ? reject(new Error('Falha fictícia.')) : resolve(response({ jobs: [entry], sources: {} })); });
    const context = { ...view, document: { querySelector: select, querySelectorAll: () => [], documentElement: { dataset: {} } },
      localStorage: { getItem: () => null }, fetch: async (_, options) => {
        if (options?.method === 'POST') { posted = true; return response({}); }
        getCount++;
        if (getCount === 2) return stale;
        return response({ jobs: [{ ...entry, mark: posted ? { status: 'applied' } : null }], sources: {} });
      } };
    const code = (await readFile(new URL('../src/page/page.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/, '');
    runInNewContext(code + '\nglobalThis.app = { refresh, mark };', context);
    await context.app.refresh();
    const pending = context.app.refresh().catch(() => {});
    const save = context.app.mark({ dataset: { id: entry.id }, querySelector: () => ({ textContent: entry.job.title }) }, { status: 'applied', cutReason: null });
    await delay(0);
    assert.equal(posted, true);
    release();
    await Promise.all([pending, save]);
    assert.equal(getCount, 3);
    assert.match(select('#jobs').innerHTML, /Inscrita/);
    assert.match(select('#jobs').innerHTML, /Desfazer marcação/);
    assert.match(select('#feedback').textContent, /Decisão salva/);
  });
}
