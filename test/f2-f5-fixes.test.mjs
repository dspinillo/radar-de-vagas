import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir, stat, utimes, realpath, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { main } from '../bin/radar.mjs';
import { addJobs, loadState, setMark } from '../src/state.mjs';
import { loadSearch } from '../src/data-dir.mjs';
import { schedule } from '../src/schedule.mjs';
import { scheduledRun } from '../src/scheduled-run.mjs';
import * as view from '../src/page/view.mjs';

const execute = promisify(execFile);
const job = { source: 'gupy', sourceId: 'ficticia', title: 'Analista Fictício', company: 'Aurora Fictícia',
  url: 'https://aurora.example/vaga', description: 'Descrição fictícia completa.', publishedAt: null };
const id = 'gupy:ficticia';
async function setup(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'radar-fixes-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, 'dados');
  const options = { dataDir, stdout() {}, stderr() {} };
  const call = args => main(args, options);
  const tracking = async () => (await loadState(options)).jobs[id].tracking;
  return { root, options, call, tracking };
}
async function configure(options, agent) {
  const search = { ...await loadSearch(options), fontes: { gupy: false, linkedin: false },
    empresas: { greenhouse: [], lever: [], ashby: [], inhire: [] } };
  if (agent) search.agente = agent;
  await writeFile(join(options.dataDir, 'busca.json'), JSON.stringify(search));
}

test('track preserva omissões, limpa explicitamente e recusa conflitos sem gravar', async t => {
  const { options, call, tracking } = await setup(t);
  await addJobs([job], options);
  assert.equal(await call(['track', id, '--stage', 'entrevista', '--next', 'Amanhã', '--notes', 'Histórico']), 0);
  assert.equal(await call(['track', id, '--stage', 'oferta']), 0);
  assert.deepEqual({ ...await tracking(), updatedAt: null }, { stage: 'oferta', next: 'Amanhã', notes: 'Histórico', updatedAt: null });
  assert.equal(await call(['track', id, '--stage', 'oferta', '--clear-next']), 0);
  assert.equal((await tracking()).next, null);
  assert.equal((await tracking()).notes, 'Histórico');
  assert.equal(await call(['track', id, '--stage', 'oferta', '--clear-notes']), 0);
  assert.equal((await tracking()).notes, '');
  const before = await readFile(join(options.dataDir, 'estado.json'));
  for (const flags of [['--clear-next', '--next', 'Texto'], ['--notes=Texto', '--clear-notes'],
    ['--clear-notes=true'], ['--clear-next', '--clear-next'], ['--clear-next', 'extra']]) {
    assert.equal(await call(['track', id, '--stage', 'oferta', ...flags]), 2);
    assert.deepEqual(await readFile(join(options.dataDir, 'estado.json')), before);
  }
});

test('track concorrente por alias preserva campos com releitura dentro da trava', async t => {
  const { options, call, tracking } = await setup(t);
  const first = { ...job, applyUrl: 'https://aurora.example/inscricao' };
  await addJobs([first, { ...first, source: 'lever', sourceId: 'alias' }], options);
  const result = await Promise.all([
    call(['track', id, '--stage', 'entrevista', '--next', 'Amanhã']),
    call(['track', 'lever:alias', '--stage', 'entrevista', '--notes', 'Histórico']),
  ]);
  assert.deepEqual(result, [0, 0]);
  assert.equal((await tracking()).next, 'Amanhã');
  assert.equal((await tracking()).notes, 'Histórico');
});

for (const equals of [false, true]) {
  test(`CLI aceita valores literais iniciados por -- ${equals ? 'com =' : 'separados'}`, async t => {
    const { options, tracking } = await setup(t);
    await addJobs([job], options);
    const flags = pairs => pairs.flatMap(([key, value]) => equals ? [`${key}=${value}`] : [key, value]);
    const cli = args => execute(process.execPath, ['bin/radar.mjs', ...args], {
      env: { ...process.env, RADAR_DATA_DIR: options.dataDir },
    });
    await cli(['triage', id, ...flags([['--fit', '3'], ['--reason', '--home office'], ['--alert', '--stage'], ['--alert', '--texto=a=b']])]);
    const triage = (await loadState(options)).jobs[id].triage;
    assert.equal(triage.reason, '--home office');
    assert.deepEqual(triage.alerts, ['--stage', '--texto=a=b']);
    await cli(['track', id, ...flags([['--stage', '--entrevista'], ['--next', '--clear-next'], ['--notes', '--histórico=a=b']])]);
    assert.deepEqual({ ...await tracking(), updatedAt: null }, {
      stage: '--entrevista', next: '--clear-next', notes: '--histórico=a=b', updatedAt: null,
    });
  });
}

for (const platform of ['darwin', 'win32']) {
  test(`agenda ${platform} valida executáveis antes de substituir e grava ambiente`, async t => {
    const { root, options } = await setup(t);
    await configure(options, 'claude');
    const agentDir = join(root, 'agente fictício & ferramentas');
    await mkdir(agentDir);
    await writeFile(join(agentDir, platform === 'win32' ? 'claude.exe' : 'claude'), 'Executável fictício.', { mode: 0o700 });
    const calls = [];
    const config = { ...options, platform, homeDir: join(root, 'home-ficticio'), nodePath: process.execPath,
      path: agentDir, env: { RADAR_DATA_DIR: options.dataDir }, run: async (_, args) => { calls.push(args); return { stdout: '' }; } };
    assert.equal((await schedule('on', config)).enabled, true);
    const file = platform === 'darwin' ? join(config.homeDir, 'Library/LaunchAgents/com.radar-de-vagas.collect.plist')
      : join(options.dataDir, 'agendamento.xml');
    const content = await readFile(file, platform === 'darwin' ? 'utf8' : 'utf16le');
    const separator = platform === 'darwin' ? ':' : ';';
    const path = `${agentDir}${separator}${dirname(process.execPath)}`.replaceAll('&', '&amp;');
    assert.ok(content.includes(path));
    assert.ok(content.includes(process.execPath));
    assert.ok(content.includes(platform === 'darwin' ? 'RADAR_DATA_DIR' : '--data-env'));
    assert.ok(content.includes(options.dataDir));
    calls.length = 0;
    await assert.rejects(schedule('on', { ...config, path: '' }), /executável claude.*instalação e o PATH/);
    assert.equal(calls.length, 0);
    assert.equal(await readFile(file, platform === 'darwin' ? 'utf8' : 'utf16le'), content);
    await assert.rejects(schedule('on', { ...config, nodePath: join(root, 'node-ausente') }), /executável.*node-ausente/);
    assert.equal(calls.length, 0);
  });
}

test('agenda sem agente corrige PATH vazio; resolve node por nome e rejeita arquivo não executável', async t => {
  const { root, options } = await setup(t);
  await configure(options);
  const config = { ...options, platform: 'darwin', homeDir: join(root, 'home-ficticio'), env: {}, path: '', run: async () => ({ stdout: '' }) };
  await schedule('on', config);
  const file = join(config.homeDir, 'Library/LaunchAgents/com.radar-de-vagas.collect.plist');
  assert.ok((await readFile(file, 'utf8')).includes(`<key>PATH</key><string>${dirname(process.execPath)}</string>`));
  assert.ok(!(await readFile(file, 'utf8')).includes('RADAR_DATA_DIR'));
  await schedule('on', { ...config, nodePath: 'node', path: dirname(process.execPath) });
  if (process.platform !== 'win32') {
    await writeFile(join(root, 'node-sem-permissao'), 'Fictício.', { mode: 0o600 });
    await assert.rejects(schedule('on', { ...config, nodePath: join(root, 'node-sem-permissao') }), /executável/);
  }
});

test('executor com Node absoluto e PATH mínimo inicia agente fictício com pasta temporária', { skip: process.platform === 'win32' }, async t => {
  const { root, options } = await setup(t);
  await configure(options, 'claude');
  const agentDir = join(root, 'agente');
  const nodeDir = join(root, 'node');
  await mkdir(agentDir);
  await mkdir(nodeDir);
  await symlink(process.execPath, join(nodeDir, 'node'));
  await writeFile(join(nodeDir, 'claude'), '#!/usr/bin/env node\nprocess.exit(91);\n', { mode: 0o700 });
  await writeFile(join(agentDir, 'claude'), '#!/usr/bin/env node\nconsole.log("Agente fictício: " + process.env.RADAR_DATA_DIR);\n', { mode: 0o700 });
  const config = { ...options, platform: 'darwin', homeDir: join(root, 'home-ficticio'), env: { RADAR_DATA_DIR: options.dataDir },
    path: agentDir, nodePath: join(nodeDir, 'node'), run: async () => ({ stdout: '' }) };
  await schedule('on', config);
  const plist = await readFile(join(config.homeDir, 'Library/LaunchAgents/com.radar-de-vagas.collect.plist'), 'utf8');
  const path = plist.match(/<key>PATH<\/key><string>([^<]+)<\/string>/)[1];
  // Mesmo contrato de argumentos usado pelo XML; nenhuma fonte de rede está ligada.
  await assert.rejects(execute(process.execPath, ['src/scheduled-run.mjs', options.dataDir, '--path', path, '--data-env', options.dataDir], {
    env: { PATH: '' },
  }), error => error.code === 1); // Sem fontes, a coleta retorna 1.
  const log = await readFile(join(options.dataDir, 'agendamento.log'), 'utf8');
  assert.ok(log.includes(`Agente fictício: ${options.dataDir}`));
  assert.match(log, /Triagem encerrada com código 0/);
});

test('log de 8 MiB retém o final, limita novas saídas e não cria arquivos de rotação', async t => {
  const { options } = await setup(t);
  await mkdir(options.dataDir);
  const file = join(options.dataDir, 'agendamento.log');
  await writeFile(file, 'Início descartável.\n' + 'x'.repeat(8 * 1024 * 1024) + '\nFinal preservado.\n');
  for (let round = 0; round < 3; round++) {
    assert.equal(await scheduledRun(options.dataDir, { run: async () => 0 }), 0);
    assert.ok((await stat(file)).size < 257 * 1024);
  }
  let log = await readFile(file, 'utf8');
  assert.ok(!log.includes('Início descartável.'));
  assert.ok(log.includes('Final preservado.'));
  await scheduledRun(options.dataDir, { run: async (args, config) => {
    if (args[0] === 'collect') {
      config.stdout('á'.repeat(700 * 1024));
      assert.ok((await stat(file)).size <= 256 * 1024);
    } else {
      const child = config.spawn(process.execPath, ['-e', 'process.stdout.write("x".repeat(2*1024*1024), () => process.stderr.write("Fim do agente fictício.\\n"));'], {});
      await once(child, 'close');
    }
    return 0;
  } });
  assert.ok((await stat(file)).size <= 1024 * 1024);
  log = await readFile(file, 'utf8');
  assert.ok(!log.includes('\uFFFD'));
  assert.match(log, /Fim do agente fictício/);
  assert.match(log, /Triagem encerrada com código 0/);
  assert.deepEqual(await readdir(options.dataDir), ['agendamento.log']);
});

test('trava impede sobreposição e libera após sucesso ou falha', async t => {
  const { options } = await setup(t);
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = scheduledRun(options.dataDir, { run: async args => {
    if (args[0] === 'collect') { started(); await gate; }
    return 0;
  } });
  await ready;
  try {
    assert.equal(await scheduledRun(options.dataDir, { run: () => assert.fail('Não deve executar.') }), 0);
    assert.match(await readFile(join(options.dataDir, 'agendamento.log'), 'utf8'), /Execução ignorada.*anterior/);
  } finally { release(); await first; }
  const lock = join(options.dataDir, 'agendamento.lock');
  await assert.rejects(stat(lock), { code: 'ENOENT' });
  assert.equal(await scheduledRun(options.dataDir, { run: async () => { throw new Error('Falha fictícia.'); } }), 1);
  await assert.rejects(stat(lock), { code: 'ENOENT' });
});

test('trava antiga preserva PID vivo, recupera PID morto e arquivo incompleto antigo', async t => {
  const { options } = await setup(t);
  await mkdir(options.dataDir);
  const lock = join(options.dataDir, 'agendamento.lock');
  const old = new Date(Date.now() - 86400000);
  await writeFile(lock, String(process.pid));
  await utimes(lock, old, old);
  assert.equal(await scheduledRun(options.dataDir, { run: () => assert.fail('Processo vivo deve ser preservado.') }), 0);
  assert.equal(await readFile(lock, 'utf8'), String(process.pid));
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const deadPid = child.pid;
  await once(child, 'close');
  for (const content of [String(deadPid), '']) {
    await writeFile(lock, content);
    await utimes(lock, old, old);
    let count = 0;
    assert.equal(await scheduledRun(options.dataDir, { run: async () => { count++; return 0; } }), 0);
    assert.equal(count, 2);
    await assert.rejects(stat(lock), { code: 'ENOENT' });
  }
  await writeFile(lock, '');
  assert.equal(await scheduledRun(options.dataDir, { run: () => assert.fail('Trava incompleta recente deve ser preservada.') }), 0);
});

test('trava impede outra rodada entre processos distintos', async t => {
  const { root, options } = await setup(t);
  const script = join(root, 'rodada.mjs');
  const moduleUrl = new URL('../src/scheduled-run.mjs', import.meta.url).href;
  await writeFile(script, `import { scheduledRun } from ${JSON.stringify(moduleUrl)};
    process.exitCode = await scheduledRun(process.argv[2], { run: async args => {
      if (args[0] === 'collect') {
        process.stdout.write('Pronto.\\n');
        await new Promise(resolve => process.stdin.once('data', resolve));
      }
      return 0;
    } });`);
  const child = spawn(process.execPath, [script, options.dataDir], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const closed = once(child, 'close');
  await once(child.stdout, 'data');
  try {
    assert.equal(await scheduledRun(options.dataDir, { run: () => assert.fail('Não deve iniciar outra rodada.') }), 0);
    assert.equal(await readFile(join(options.dataDir, 'agendamento.lock'), 'utf8'), String(child.pid));
  } finally {
    child.stdin.end('Encerrar.');
    assert.equal((await closed)[0], 0);
  }
  await assert.rejects(stat(join(options.dataDir, 'agendamento.lock')), { code: 'ENOENT' });
});

test('ID continua visível após inscrevi; copiar usa o ID literal e informa falha da área de transferência', async t => {
  const { options } = await setup(t);
  await addJobs([job], options);
  await setMark(id, { status: 'applied', cutReason: null }, options);
  const jobs = view.toJobs(await loadState(options));
  const html = view.renderRows(jobs);
  assert.match(html, /<small[^>]*>ID: gupy:ficticia<\/small>/);
  assert.match(html, /data-action="copy-id"/);
  const escaped = view.renderRows([{ ...jobs[0], id: 'gupy:<script>&"' }]);
  assert.ok(escaped.includes('ID: gupy:&lt;script&gt;&amp;&quot;'));
  assert.ok(!escaped.includes('<script>'));
  const elements = new Map();
  const select = key => {
    if (!elements.has(key)) elements.set(key, { value: key === '#status' ? 'all' : '', dataset: {}, handlers: {},
      addEventListener(event, callback) { this.handlers[event] = callback; }, focus() {} });
    return elements.get(key);
  };
  let copied;
  const context = { ...view, document: { querySelector: select, documentElement: { dataset: {} } },
    localStorage: { getItem: () => null }, navigator: { clipboard: { writeText: async text => { copied = text; } } },
    fetch: async () => ({ ok: true, json: async () => ({ jobs, sources: {} }) }) };
  const code = (await readFile(new URL('../src/page/page.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/, '');
  runInNewContext(code, context);
  const button = { dataset: { action: 'copy-id' }, closest: () => ({ dataset: { id } }) };
  const click = () => select('#jobs').handlers.click({ target: { closest: () => button } });
  await click();
  assert.equal(copied, id);
  assert.match(select('#feedback').textContent, /Identificador copiado/);
  context.navigator.clipboard.writeText = async () => { throw new Error('Negado.'); };
  await click();
  assert.match(select('#feedback').textContent, /copie manualmente/);
});

test('documentação copiada para pasta temporária usa marketplace ./ e fecha versão 0.1.0', async t => {
  const { root } = await setup(t);
  for (const file of ['README.md', 'package.json', 'CHANGELOG.md', 'ARCHITECTURE.md', 'CONTEXT.md']) {
    await cp(new URL(`../${file}`, import.meta.url), join(root, file));
  }
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  assert.match(readme, /^claude plugin marketplace add \.\/$/m);
  assert.doesNotMatch(readme, /^claude plugin marketplace add \.$/m);
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.0');
  const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## \[Não lançado\]\s+## \[0\.1\.0\] - 2026-10-02/);
  assert.ok(!(await readFile(join(root, 'CONTEXT.md'), 'utf8')).includes('`web/`'));
});
