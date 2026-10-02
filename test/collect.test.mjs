import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../src/collect.mjs';
import { loadSearch } from '../src/data-dir.mjs';
import { USER_AGENT } from '../src/network.mjs';
import { loadState, setMark } from '../src/state.mjs';
import { main } from '../bin/radar.mjs';

const run = promisify(execFile);
const noNetwork = async () => { throw new Error('Rede proibida neste teste.'); };
const emptyResult = () => ({ jobs: [], errors: [] });

function job(extra = {}) {
  return {
    source: 'gupy', sourceId: 'vaga:ficticia',
    url: 'https://agregador.example/vagas/ficticia',
    applyUrl: 'https://aurora.example/inscricao/ficticia',
    company: 'Aurora Fictícia', title: 'Analista de Planejamento',
    description: 'Descrição completa.\n\nÚltimo requisito preservado.',
    publishedAt: null, ...extra,
  };
}

function source(name = 'gupy', collect = async () => ({ jobs: [job()], errors: [] }), extra = {}) {
  return { name, label: `Fonte ${name}`, kind: 'search', defaultEnabled: true, collect, ...extra };
}

async function setup(t, changes = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'radar-collect-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const search = { termos: ['planejamento fictício'], localidade: null, modelo: null,
    idadeMaximaDias: null, fontes: { gupy: true, linkedin: false },
    empresas: { greenhouse: [], lever: [], ashby: [], inhire: [] }, ...changes };
  await writeFile(join(dataDir, 'busca.json'), JSON.stringify(search));
  return { dataDir, fetch: noNetwork, sources: [source()] };
}

test('duas rodadas não duplicam vagas; resumo conta novas sem repetir ids', async t => {
  const options = await setup(t);
  options.sources = [source('gupy', async () => ({ jobs: [job(), job()], errors: [] }))];
  const first = await collect(options);
  const second = await collect(options);
  assert.equal(first.totalNew, 1);
  assert.equal(first.sources[0].seen, 2);
  assert.equal(first.sources[0].new, 1);
  assert.equal(second.totalNew, 0);
  assert.equal(second.sources[0].new, 0);
  const state = await loadState(options);
  assert.deepEqual(Object.keys(state.jobs), ['gupy:vaga:ficticia']);
  assert.equal(state.jobs['gupy:vaga:ficticia'].job.description, job().description);
});

test('marcação entre duas coletas é preservada integralmente', async t => {
  const options = await setup(t);
  await collect(options);
  await setMark('gupy:vaga:ficticia', { status: 'discarded', cutReason: 'Modelo incompatível.' }, options);
  const before = (await loadState(options)).jobs['gupy:vaga:ficticia'].mark;
  await collect(options);
  assert.deepEqual((await loadState(options)).jobs['gupy:vaga:ficticia'].mark, before);
});

test('marcação feita durante a consulta da fonte também sobrevive à gravação', async t => {
  const options = await setup(t);
  await collect(options);
  let mark;
  options.sources = [source('gupy', async () => {
    const state = await setMark('gupy:vaga:ficticia', { status: 'applied', cutReason: null }, options);
    mark = state.jobs['gupy:vaga:ficticia'].mark;
    return { jobs: [job()], errors: [] };
  })];
  await collect(options);
  assert.deepEqual((await loadState(options)).jobs['gupy:vaga:ficticia'].mark, mark);
});

test('exceção solta vira erro persistido e a fonte seguinte grava normalmente', async t => {
  const options = await setup(t, { fontes: { gupy: true, linkedin: true } });
  options.sources = [source('linkedin', async () => { throw new Error('Falha fictícia.'); }), source()];
  const summary = await collect(options);
  const errors = [{ target: 'linkedin', step: 'coleta', message: 'Falha fictícia.' }];
  assert.deepEqual(summary.sources[0], { source: 'linkedin', label: 'Fonte linkedin', seen: 0, new: 0, errors });
  assert.equal(summary.totalNew, 1);
  const state = await loadState(options);
  assert.deepEqual(state.sources.linkedin.errors, errors);
  assert.ok(state.sources.linkedin.lastRunAt);
  assert.ok(state.jobs['gupy:vaga:ficticia']);
});

test('fonte desligada e fonte por empresa sem empresas não rodam nem registram rodada', async t => {
  const options = await setup(t, { fontes: { gupy: false, linkedin: false } });
  const unexpected = async () => { assert.fail('Fonte desligada executou.'); };
  options.sources = [source('gupy', unexpected), source('linkedin', unexpected),
    source('greenhouse', unexpected, { kind: 'company' }),
    source('ficticia', unexpected, { defaultEnabled: false })];
  const summary = await collect(options);
  assert.deepEqual(summary.sources, []);
  assert.equal(summary.totalNew, 0);
  assert.deepEqual((await loadState(options)).sources, {});
});

test('known contém sourceId inteiro na segunda rodada, permitindo pular detalhes', async t => {
  const options = await setup(t);
  const known = [];
  options.sources = [source('gupy', async ctx => {
    known.push([...ctx.known]);
    return { jobs: ctx.known.has('vaga:ficticia') ? [] : [job()], errors: [] };
  })];
  await collect(options);
  const second = await collect(options);
  assert.deepEqual(known, [[], ['vaga:ficticia']]);
  assert.equal(second.sources[0].seen, 0);
  assert.ok((await loadState(options)).sources.gupy.lastRunAt);
});

test('mesma inscrição por termo e empresa funde; known preserva aliases e a identidade original', async t => {
  const options = await setup(t, {
    empresas: { greenhouse: ['aurora-ficticia'], lever: [], ashby: [], inhire: [] },
  });
  const companyJob = job({ source: 'greenhouse', sourceId: 'aurora-ficticia/vaga:um',
    url: 'https://aurora.example/vagas/ficticia', title: 'Analista Sênior' });
  const known = { gupy: [], greenhouse: [] };
  options.sources = [source('gupy', async ctx => {
    known.gupy.push([...ctx.known]);
    return { jobs: [job()], errors: [] };
  }), source('greenhouse', async ctx => {
    known.greenhouse.push([...ctx.known]);
    assert.deepEqual(ctx.companies, ['aurora-ficticia']);
    return { jobs: [companyJob], errors: [] };
  }, { kind: 'company' })];
  const first = await collect(options);
  assert.equal(first.totalNew, 1);
  assert.deepEqual(first.sources.map(item => item.new), [1, 0]);
  await setMark('gupy:vaga:ficticia', { status: 'applied', cutReason: null }, options);
  assert.equal((await collect(options)).totalNew, 0);
  const state = await loadState(options);
  assert.deepEqual(Object.keys(state.jobs), ['gupy:vaga:ficticia']);
  assert.deepEqual(state.jobs['gupy:vaga:ficticia'].job, companyJob);
  assert.equal(state.jobs['gupy:vaga:ficticia'].mark.status, 'applied');
  assert.equal(state.aliases['greenhouse:aurora-ficticia/vaga:um'], 'gupy:vaga:ficticia');
  assert.deepEqual(known, { gupy: [[], ['vaga:ficticia']], greenhouse: [[], ['aurora-ficticia/vaga:um']] });
});

test('rodadas vazias e com erros parciais são persistidas; sucesso posterior limpa erros', async t => {
  const options = await setup(t);
  const errors = [{ target: 'planejamento fictício', step: 'busca', message: 'Indisponível.' }];
  options.sources = [source('gupy', async () => ({ jobs: [job()], errors }))];
  const partial = await collect(options);
  assert.equal(partial.totalNew, 1);
  assert.deepEqual((await loadState(options)).sources.gupy.errors, errors);
  options.sources = [source('gupy', async () => ({ jobs: [], errors }))];
  assert.deepEqual((await collect(options)).sources[0].errors, errors);
  options.sources = [source('gupy', async () => emptyResult())];
  await collect(options);
  const state = await loadState(options);
  assert.deepEqual(state.sources.gupy.errors, []);
  assert.ok(state.sources.gupy.lastRunAt);
  assert.equal(Object.keys(state.jobs).length, 1);
});

test('contexto leva busca, empresas, fetch identificado, sleep e log injetados', async t => {
  const options = await setup(t, { fontes: { gupy: false, linkedin: true } });
  const sleep = async () => {};
  const log = () => {};
  let requests = 0;
  options.fetch = async (url, init) => {
    requests++;
    assert.equal(url, 'https://fonte.example/vagas');
    assert.equal(init.headers.get('User-Agent'), USER_AGENT);
    assert.ok(init.signal instanceof AbortSignal);
    return { ok: true, status: 200, text: async () => '{"vagas":[]}' };
  };
  options.sources = [source('linkedin', async ctx => {
    assert.deepEqual(ctx.search, await loadSearch(options));
    assert.deepEqual(ctx.companies, []);
    assert.ok(ctx.known instanceof Set);
    assert.equal(ctx.sleep, sleep);
    assert.equal(ctx.log, log);
    assert.deepEqual(await (await ctx.fetch('https://fonte.example/vagas')).json(), { vagas: [] });
    return emptyResult();
  }, { defaultEnabled: false })];
  const summary = await collect({ ...options, sleep, log });
  assert.deepEqual(summary.sources[0].errors, []);
  assert.equal(requests, 1);
});

test('primeira execução cria pasta e busca fictícia e devolve o aviso', async t => {
  const options = await setup(t);
  options.dataDir = join(options.dataDir, 'primeira-execucao');
  options.sources = [source('gupy', async () => emptyResult())];
  const summary = await collect(options);
  assert.match(summary.warnings[0], /EXEMPLO FICTÍCIO/);
  assert.equal((await loadSearch(options)).fontes.linkedin, false);
  assert.ok((await loadState(options)).sources.gupy.lastRunAt);
});

test('retorno inválido e lançamento sem Error são isolados da fonte seguinte', async t => {
  const options = await setup(t, { fontes: { gupy: true, linkedin: true } });
  for (const broken of [async () => null, async () => ({ jobs: [job({ source: 'gupy' })], errors: [] }),
    async () => ({ jobs: [], errors: [{}] }), async () => { throw null; }]) {
    options.sources = [source('linkedin', broken), source()];
    const summary = await collect(options);
    assert.equal(summary.sources[0].errors.length, 1);
    assert.equal(summary.sources[1].seen, 1);
    assert.ok((await loadState(options)).jobs['gupy:vaga:ficticia']);
  }
});

test('estado corrompido impede consultas e permanece intacto', async t => {
  const options = await setup(t);
  const path = join(options.dataDir, 'estado.json');
  await writeFile(path, '{ inválido');
  let called = false;
  options.sources = [source('gupy', async () => { called = true; return emptyResult(); })];
  await assert.rejects(collect(options), /Estado inválido ou corrompido/);
  assert.equal(called, false);
  assert.equal(await readFile(path, 'utf8'), '{ inválido');
});

test('CLI imprime contagens e avisos e retorna zero mesmo quando só há erro da fonte', async t => {
  const options = await setup(t);
  const stdout = [], stderr = [];
  const cliOptions = { collect: () => collect(options), stdout: text => stdout.push(text), stderr: text => stderr.push(text) };
  assert.equal(await main(['collect'], cliOptions), 0);
  assert.match(stdout.join('\n'), /Fonte gupy: 1 vagas vistas, 1 novas, 0 erros/);
  assert.match(stdout.join('\n'), /Total: 1 vagas novas/);
  options.sources = [source('gupy', async () => { throw new Error('Falha fictícia.'); })];
  assert.equal(await main(['collect'], cliOptions), 0);
  assert.match(stderr.join('\n'), /Aviso.*Fonte gupy.*Falha fictícia/);
  assert.deepEqual((await loadState(options)).sources.gupy.errors,
    [{ target: 'gupy', step: 'coleta', message: 'Falha fictícia.' }]);
});

test('CLI real sem fontes ativas sai com um; ajuda e comando inválido não coletam', async t => {
  const options = await setup(t, { fontes: { gupy: false, linkedin: false } });
  await assert.rejects(run(process.execPath, ['bin/radar.mjs', 'collect'], {
    env: { ...process.env, RADAR_DATA_DIR: options.dataDir },
  }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /Total: 0 vagas novas/);
    assert.match(error.stderr, /nenhuma fonte rodou/);
    return true;
  });
  const cliOptions = { collect: async () => assert.fail('Coleta indevida.'), stdout: () => {}, stderr: () => {} };
  assert.equal(await main(['--help'], cliOptions), 0);
  assert.equal(await main([], cliOptions), 0);
  for (const args of [['desconhecido'], ['collect', 'extra']]) assert.equal(await main(args, cliOptions), 2);
});

test('CLI comunica falha fatal de busca sem alterar arquivo nem consultar fontes', async t => {
  const options = await setup(t);
  const path = join(options.dataDir, 'busca.json');
  await writeFile(path, '{ inválido');
  const stderr = [];
  assert.equal(await main(['collect'], { collect: () => collect(options),
    stdout: () => {}, stderr: text => stderr.push(text) }), 1);
  assert.match(stderr[0], /Não foi possível coletar.*busca.json/);
  assert.equal(await readFile(path, 'utf8'), '{ inválido');
});
