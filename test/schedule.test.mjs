import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlist, buildTaskXml, schedule } from '../src/schedule.mjs';
import { scheduledRun } from '../src/scheduled-run.mjs';
import { main } from '../bin/radar.mjs';

async function setup(t, platform = 'darwin') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'radar-schedule-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  let registered = false;
  const options = { dataDir: join(root, 'dados'), homeDir: join(root, 'home-ficticio'),
    repoDir: join(root, 'repo com espaço & acento'), nodePath: process.execPath, path: '/bin:/opt/agent/bin',
    hours: 6, uid: 501, platform, now: new Date('2026-10-02T12:00:00.000Z'),
    run: async (command, args) => {
      calls.push([command, args]);
      if (['print', '/Query'].includes(args[0])) {
        if (!registered) throw Object.assign(new Error('Ausente.'), {
          code: platform === 'darwin' ? 113 : 1, stderr: 'ERROR: The system cannot find the file specified.',
        });
        return { stdout: args.includes('CSV') ? '"Radar de Vagas","02/10/2026 18:00:00","Ready"\r\n'
          : '<Task><Settings><Enabled>true</Enabled></Settings></Task>' };
      }
      if (['bootstrap', '/Create'].includes(args[0])) registered = true;
      if (['bootout', '/Delete'].includes(args[0])) registered = false;
      return { stdout: '' };
    } };
  return { options, calls };
}

test('plist puro: intervalo, retomada ao carregar, argumentos separados e XML escapado', async t => {
  const { options } = await setup(t);
  const output = buildPlist(options);
  assert.equal(output, buildPlist(options));
  assert.match(output, /<key>StartInterval<\/key><integer>21600<\/integer>/);
  assert.match(output, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(output, /repo com espaço &amp; acento/);
  assert.ok(!output.includes('repo com espaço & acento'));
  assert.match(output, /<key>ProgramArguments<\/key><array><string>[^<]+<\/string><string>[^<]+scheduled-run.mjs<\/string><string>[^<]+dados<\/string><\/array>/);
  assert.match(output, /<key>PATH<\/key><string>\/bin:\/opt\/agent\/bin<\/string>/);
  assert.equal((output.match(/agendamento.log/g) ?? []).length, 2);
  assert.ok(!output.includes('/bin/sh'));
});

test('XML puro: repetição ilimitada, StartWhenAvailable, sessão do usuário e argumentos escapados', async t => {
  const { options } = await setup(t, 'win32');
  const config = { ...options, startAt: options.now.toISOString() };
  const output = buildTaskXml(config);
  assert.equal(output, buildTaskXml(config));
  assert.match(output, /encoding="UTF-16"/);
  assert.match(output, /<StartBoundary>2026-10-02T12:00:00.000Z<\/StartBoundary>/);
  assert.match(output, /<Interval>PT6H<\/Interval>/);
  assert.ok(!output.includes('<Duration>'));
  assert.match(output, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(output, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(output, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(output, /<Arguments>&quot;.*scheduled-run.mjs&quot; &quot;.*dados&quot; &quot;--path&quot; &quot;.*&quot;<\/Arguments>/);
  assert.ok(!output.includes('cmd.exe'));
  const escaped = buildTaskXml({ ...config, dataDir: 'C:\\Dados com espaço\\' });
  assert.ok(escaped.includes('C:\\Dados com espaço\\\\&quot;'));
});

for (const platform of ['darwin', 'win32']) {
  test(`schedule ${platform}: status, on, troca de intervalo e off idempotente sem agendador real`, async t => {
    const { options, calls } = await setup(t, platform);
    const stdout = [], stderr = [];
    const run = args => main(args, { ...options, stdout: text => stdout.push(text), stderr: text => stderr.push(text) });
    assert.equal(await run(['schedule', 'status']), 0);
    assert.match(stdout.pop(), /desligado/);
    assert.equal(await run(['schedule', 'on']), 0);
    assert.match(stdout.pop(), /ligado/);
    assert.match(stderr.pop(), /máquina desligada/);
    const plist = join(options.homeDir, 'Library', 'LaunchAgents', 'com.radar-de-vagas.collect.plist');
    const task = join(options.dataDir, 'agendamento.xml');
    const file = platform === 'darwin' ? plist : task;
    const encoding = platform === 'darwin' ? 'utf8' : 'utf16le';
    const content = await readFile(file, encoding);
    if (platform === 'win32') assert.equal(content[0], '\uFEFF');
    assert.match(content, platform === 'darwin' ? /<integer>21600<\/integer>/ : /<Interval>PT6H<\/Interval>/);
    assert.equal(await run(['schedule', 'status']), 0);
    assert.match(stdout.pop(), platform === 'darwin' ? /Próxima execução: não informada/ : /Próxima execução: 02\/10\/2026 18:00:00/);
    assert.equal(await run(['schedule', 'on', '--hours', '2']), 0);
    assert.match(await readFile(file, encoding), platform === 'darwin' ? /<integer>7200<\/integer>/ : /<Interval>PT2H<\/Interval>/);
    assert.equal(await run(['schedule', 'off']), 0);
    assert.match(stdout.pop(), /desligado/);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
    assert.equal(await run(['schedule', 'off']), 0);
    assert.equal(await run(['schedule', 'status']), 0);
    assert.match(stdout.pop(), /desligado/);
    assert.deepEqual(await readdir(options.dataDir), ['busca.json']);
    assert.ok(calls.every(([command]) => command === (platform === 'darwin' ? 'launchctl' : 'schtasks')));
    if (platform === 'darwin') assert.ok(calls.some(([, args]) => args[0] === 'bootstrap' && args[1] === 'gui/501' && args[2] === plist));
    else assert.ok(calls.some(([, args]) => args[0] === '/Create' && args.includes(task)));
  });
}

test('falhas de permissão não viram status desligado nem apagam arquivos', async t => {
  const { options } = await setup(t);
  await schedule('on', options);
  const file = join(options.homeDir, 'Library', 'LaunchAgents', 'com.radar-de-vagas.collect.plist');
  const before = await readFile(file, 'utf8');
  options.run = async () => { throw Object.assign(new Error('Negado.'), { code: 1, stderr: 'Access is denied.' }); };
  await assert.rejects(schedule('off', options), /permissões/);
  assert.equal(await readFile(file, 'utf8'), before);
  await assert.rejects(schedule('status', { ...options, platform: 'win32' }), /permissões/);
  await assert.rejects(schedule('on', { ...options, platform: 'linux' }), /somente no Mac e no Windows/);
});

test('execução agendada coleta antes da triagem e grava log na pasta temporária, inclusive falhas', async t => {
  const { options } = await setup(t);
  for (const codes of [[0, 0], [1, 0], [0, 7], [130]]) {
    const calls = [];
    const result = await scheduledRun(options.dataDir, { run: async (args, config) => {
      calls.push(args[0]);
      assert.equal(config.dataDir, options.dataDir);
      config.stdout(`Saída de ${args[0]}.`);
      config.stderr('Aviso fictício.');
      return codes[calls.length - 1];
    } });
    assert.equal(result, codes[0] || codes[1]);
    assert.deepEqual(calls, codes[0] === 130 ? ['collect'] : ['collect', 'triage-run']);
  }
  assert.equal(await scheduledRun(options.dataDir, { run: async () => { throw new Error('Falha fictícia.'); } }), 1);
  const log = await readFile(join(options.dataDir, 'agendamento.log'), 'utf8');
  assert.match(log, /Saída de collect[\s\S]*Saída de triage-run/);
  assert.match(log, /Aviso fictício/);
  assert.match(log, /Falha na execução agendada: Falha fictícia/);
});

test('falha ao registrar remove definição; Windows desabilitado aparece desligado e off tolera tarefa parada', async t => {
  const { options } = await setup(t);
  const run = options.run;
  options.run = async (command, args) => {
    if (['bootstrap', '/Create'].includes(args[0])) throw new Error('Falha fictícia ao registrar.');
    return run(command, args);
  };
  await assert.rejects(schedule('on', options), /Falha fictícia/);
  assert.deepEqual(await readdir(join(options.homeDir, 'Library', 'LaunchAgents')), []);
  const windows = await setup(t, 'win32');
  const winRun = windows.options.run;
  windows.options.run = async (command, args) => {
    if (args[0] === '/Create') throw new Error('Falha fictícia ao registrar.');
    return winRun(command, args);
  };
  await assert.rejects(schedule('on', windows.options), /Falha fictícia/);
  assert.deepEqual(await readdir(windows.options.dataDir), ['busca.json']);
  windows.options.run = async (_, args) => {
    if (args[0] === '/Query') return { stdout: '<Task><Settings><Enabled>false</Enabled></Settings></Task>' };
    if (args[0] === '/End') throw Object.assign(new Error('Parada.'), { code: 1, stderr: 'The task is not running.' });
    assert.equal(args[0], '/Delete');
    return { stdout: '' };
  };
  assert.deepEqual(await schedule('status', windows.options), { enabled: false, nextRun: null });
  assert.deepEqual(await schedule('off', windows.options), { enabled: false, nextRun: null });
});
