import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { main } from '../bin/radar.mjs';
import { loadSearch, validateSearch } from '../src/data-dir.mjs';
import { addJobs, loadState, setMark, setTriage } from '../src/state.mjs';
import { buildAgentCommand } from '../src/triage-run.mjs';

const job = sourceId => ({ source: 'gupy', sourceId, title: 'Analista Fictício', company: 'Aurora Fictícia',
  url: `https://aurora.example/${sourceId}`, publishedAt: null,
  description: 'Descrição inteira.\n'.repeat(3000) + 'Último requisito.' });
async function setup(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'radar-commands-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const stdout = [], stderr = [];
  const options = { dataDir, stdout: value => stdout.push(value), stderr: value => stderr.push(value) };
  const call = async args => {
    stdout.length = stderr.length = 0;
    return main(args, options);
  };
  return { options, call, stdout, stderr };
}

test('paths cria pastas, aponta todos os arquivos e preserva os existentes; CLI real produz só JSON', async t => {
  const { options } = await setup(t);
  const { stdout } = await promisify(execFile)(process.execPath, ['bin/radar.mjs', 'paths'], {
    env: { ...process.env, RADAR_DATA_DIR: options.dataDir },
  });
  const paths = JSON.parse(stdout);
  assert.deepEqual(Object.keys(paths), ['dataDir', 'profile', 'search', 'ruler', 'resumes', 'interviews']);
  for (const [key, name] of Object.entries({ profile: 'perfil.md', search: 'busca.json', ruler: 'regua.md',
    resumes: 'curriculos', interviews: 'entrevistas' })) assert.equal(paths[key], join(paths.dataDir, name));
  for (const path of [paths.resumes, paths.interviews]) assert.ok((await stat(path)).isDirectory());
  await writeFile(paths.profile, 'Perfil fictício.');
  assert.equal(await main(['paths'], options), 0);
  assert.equal(await readFile(paths.profile, 'utf8'), 'Perfil fictício.');
});

test('pending usa teto 30, teto configurado e --limit; preserva descrição e ordena pela primeira coleta', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  await addJobs(Array.from({ length: 34 }, (_, index) => job(`vaga-${index}`)), options);
  await setMark('gupy:vaga-0', { status: 'applied', cutReason: null }, options);
  await setMark('gupy:vaga-1', { status: 'discarded', cutReason: 'Motivo fictício.' }, options);
  await setTriage('gupy:vaga-2', { fit: 4, reason: 'Motivo fictício.', alerts: [] }, options);
  await new Promise(resolve => setTimeout(resolve, 5));
  await addJobs([job('mais-nova')], options);
  assert.equal(await call(['pending']), 0);
  let pending = JSON.parse(stdout[0]);
  assert.equal(pending.length, 30);
  assert.equal(pending[0].id, 'gupy:mais-nova');
  assert.deepEqual(Object.keys(pending[0]), ['id', 'job', 'seen']);
  assert.equal(pending[0].job.description, job('mais-nova').description);
  assert.match(stderr[0], /^2 vagas/);
  assert.ok(pending.every(entry => !['gupy:vaga-0', 'gupy:vaga-1', 'gupy:vaga-2'].includes(entry.id)));
  await writeFile(join(options.dataDir, 'busca.json'), JSON.stringify({ ...await loadSearch(options), tetoTriagemPorRodada: 2 }));
  await call(['pending']);
  assert.equal(JSON.parse(stdout[0]).length, 2);
  await call(['pending', '--limit', '1']);
  assert.equal(JSON.parse(stdout[0]).length, 1);
  assert.match(stderr[0], /^31 vagas/);
});

test('show retorna envelope completo por alias; triage e track preservam os demais blocos', async t => {
  const { options, call, stdout } = await setup(t);
  const first = { ...job('estavel'), applyUrl: 'https://aurora.example/inscricao' };
  await addJobs([first, { ...first, source: 'lever', sourceId: 'alias' }], options);
  await setMark('gupy:estavel', { status: 'applied', cutReason: null }, options);
  const before = (await loadState(options)).jobs['gupy:estavel'];
  assert.equal(await call(['triage', 'lever:alias', '--fit', '5', '--reason', 'Bom encaixe.', '--alert', 'Idioma.', '--alert', 'Faixa.']), 0);
  assert.equal(await call(['track', 'lever:alias', '--stage', 'Entrevista', '--next', 'Preparar casos.', '--notes', 'Nota fictícia.']), 0);
  assert.equal(await call(['show', 'lever:alias']), 0);
  const envelope = JSON.parse(stdout[0]);
  for (const key of ['job', 'seen', 'mark']) assert.deepEqual(envelope[key], before[key]);
  assert.deepEqual(envelope.triage.alerts, ['Idioma.', 'Faixa.']);
  assert.equal(envelope.triage.fit, 5);
  assert.ok(envelope.triage.triagedAt);
  assert.equal(envelope.tracking.stage, 'Entrevista');
  assert.equal(envelope.tracking.next, 'Preparar casos.');
  assert.equal(envelope.tracking.notes, 'Nota fictícia.');
  assert.ok(envelope.tracking.updatedAt);
  await call(['track', 'gupy:estavel', '--stage', 'Concluído']);
  const tracking = (await loadState(options)).jobs['gupy:estavel'].tracking;
  assert.equal(tracking.next, 'Preparar casos.');
  assert.equal(tracking.notes, 'Nota fictícia.');
});

test('discards retorna somente descartes, com motivo e data', async t => {
  const { options, call, stdout } = await setup(t);
  await addJobs([job('sim'), job('nao')], options);
  await setMark('gupy:sim', { status: 'discarded', cutReason: 'Motivo fictício.' }, options);
  assert.equal(await call(['discards']), 0);
  const entries = JSON.parse(stdout[0]);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { id: 'gupy:sim', title: job('sim').title, company: job('sim').company,
    cutReason: 'Motivo fictício.', markedAt: (await loadState(options)).jobs['gupy:sim'].mark.markedAt });
});

test('uso inválido sai com 2, mensagem em português e sem alterar estado', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  await addJobs([job('vaga')], options);
  const path = join(options.dataDir, 'estado.json'), before = await readFile(path, 'utf8');
  for (const args of [
    ['paths', 'extra'], ['pending', '--limit'], ['pending', '--limit', '0'], ['pending', '--limit', '1.5'],
    ['pending', '--limit', '2', '--limit', '3'], ['show'], ['show', '__proto__'], ['show', 'gupy:ausente'],
    ['show', 'gupy:vaga', 'extra'], ['triage', 'gupy:vaga', '--fit', '6', '--reason', 'Texto'],
    ['triage', 'gupy:vaga', '--fit', '1'], ['triage', 'gupy:vaga', '--fit', '1', '--reason', ' '],
    ['triage', 'gupy:vaga', '--fit', '2', '--reason', 'Texto', '--alert', ' '], ['track', 'gupy:vaga', '--stage', ' '],
    ['discards', 'extra'], ['triage-run', 'extra'], ['schedule'], ['schedule', 'off', '--hours', '6'],
    ['schedule', 'on', '--hours', '0'], ['schedule', 'on', '--hours', '745'], ['schedule', 'status', 'extra'],
  ]) {
    assert.equal(await call(args), 2, args.join(' '));
    assert.equal(stdout.length, 0);
    assert.equal(stderr.length, 1);
  }
  assert.equal(await readFile(path, 'utf8'), before);
});

test('novos campos de busca são opcionais, validados e arquivo inválido é preservado', async t => {
  const { options, call, stderr } = await setup(t);
  const search = await loadSearch(options);
  for (const value of [0, -1, null, '2', 1.5]) assert.ok(validateSearch({ ...search, tetoTriagemPorRodada: value }).length);
  for (const value of [null, '', 'outro', 2]) assert.ok(validateSearch({ ...search, agente: value }).length);
  for (const agente of ['claude', 'codex']) assert.deepEqual(validateSearch({ ...search, agente, tetoTriagemPorRodada: 1 }), []);
  const invalid = JSON.stringify({ ...search, agente: null });
  await writeFile(join(options.dataDir, 'busca.json'), invalid);
  assert.equal(await call(['triage-run']), 1);
  assert.match(stderr[0], /agente/);
  assert.equal(await readFile(join(options.dataDir, 'busca.json'), 'utf8'), invalid);
});

test('triage-run desligado orienta sem iniciar agente', async t => {
  const { options, call, stdout } = await setup(t);
  options.spawn = () => assert.fail('Não deve iniciar agente.');
  assert.equal(await call(['triage-run']), 0);
  assert.match(stdout[0], /"agente": "claude".*"agente": "codex"/);
});
for (const agent of ['claude', 'codex']) {
  test(`triage-run ${agent}: prompt e repositório, stdin fechado, sem shell; repassa saída e falhas`, async t => {
    const { options, call, stderr } = await setup(t);
    await writeFile(join(options.dataDir, 'busca.json'), JSON.stringify({ ...await loadSearch(options), agente: agent }));
    options.repoDir = join(options.dataDir, 'repo com espaços & texto');
    const spec = buildAgentCommand(agent, options.repoDir, options.dataDir);
    assert.equal(spec.command, agent);
    const prompt = `Leia skills/triagem/SKILL.md e execute a skill de triagem do Radar de Vagas em modo não interativo.\nCaminho do repositório: ${options.repoDir}`;
    assert.deepEqual(spec.args, agent === 'claude'
      ? ['-p', prompt, '--add-dir', options.dataDir, '--allowedTools', 'Read', 'Edit', 'Write', 'Bash(node bin/radar.mjs:*)']
      : ['exec', '-s', 'workspace-write', '-c', 'model_reasoning_effort=medium', '--add-dir', options.dataDir, prompt]);
    for (const code of [0, 7, null]) {
      options.spawn = (command, args, config) => {
        assert.deepEqual({ command, args }, spec);
        assert.equal(config.cwd, options.repoDir);
        assert.equal(config.env.RADAR_DATA_DIR, options.dataDir);
        assert.deepEqual(config.stdio, ['ignore', 'inherit', 'inherit']);
        assert.equal(config.shell, false);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', code));
        return child;
      };
      assert.equal(await call(['triage-run']), code ?? 1);
    }
    options.spawn = () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('error', new Error('Falha fictícia.')));
      return child;
    };
    assert.equal(await call(['triage-run']), 1);
    assert.match(stderr[0], /instalação e o login/);
  });
}

test('interromper triage-run encerra o filho, retorna 130 e remove ouvintes', async t => {
  const { options, call } = await setup(t);
  await writeFile(join(options.dataDir, 'busca.json'), JSON.stringify({ ...await loadSearch(options), agente: 'codex' }));
  options.signals = new EventEmitter();
  options.spawn = () => {
    const child = new EventEmitter();
    child.kill = signal => { assert.equal(signal, 'SIGTERM'); queueMicrotask(() => child.emit('close', null)); };
    queueMicrotask(() => options.signals.emit('SIGTERM'));
    return child;
  };
  assert.equal(await call(['triage-run']), 130);
  assert.equal(options.signals.listenerCount('SIGTERM'), 0);
  assert.equal(options.signals.listenerCount('SIGINT'), 0);
});
