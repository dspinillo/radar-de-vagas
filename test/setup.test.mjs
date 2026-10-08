import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../bin/radar.mjs';
import { setup as runSetup } from '../src/setup.mjs';

async function setup(t, agents = []) {
  const root = await mkdtemp(join(tmpdir(), 'radar-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  await mkdir(bin);
  for (const agent of agents) {
    await writeFile(join(bin, agent), '');
    await chmod(join(bin, agent), 0o755);
  }
  const stdout = [], stderr = [];
  const options = { dataDir: join(root, 'dados'), path: bin, platform: 'linux',
    stdout: line => stdout.push(line), stderr: line => stderr.push(line) };
  return { options, stdout, stderr, text: () => stdout.join('\n') };
}

test('setup cria a busca de exemplo e aponta o onboarding no agente encontrado', async t => {
  const { options, text, stdout } = await setup(t, ['codex']);
  assert.equal(await main(['setup'], options), 0);
  assert.match(text(), /Busca: ainda com o exemplo fictício/);
  assert.match(text(), /Perfil: ainda não criado/);
  assert.match(text(), /Agentes encontrados: codex/);
  assert.match(text(), /Agendamento: disponível com systemd de usuário/);
  assert.match(text(), /abra o agente: codex\n.*skills\/onboarding\/SKILL\.md/);
  const before = await readFile(join(options.dataDir, 'busca.json'), 'utf8');
  stdout.length = 0;
  assert.equal(await main(['setup'], options), 0);
  assert.equal(await readFile(join(options.dataDir, 'busca.json'), 'utf8'), before);
});

test('setup sem agente ensina o caminho manual; com perfil e busca prontos manda coletar', async t => {
  const manual = await setup(t);
  assert.equal(await main(['setup'], manual.options), 0);
  assert.match(manual.text(), /Agentes encontrados: nenhum/);
  assert.match(manual.text(), /1\. Edite .*busca\.json.*"aviso"[\s\S]*2\. npm run collect[\s\S]*3\. npm run open/);
  assert.doesNotMatch(manual.text(), /onboarding/);

  const ready = await setup(t, ['claude', 'codex']);
  await main(['paths'], { ...ready.options, stdout: () => {} });
  const file = join(ready.options.dataDir, 'busca.json');
  const { aviso, ...search } = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify(search));
  await writeFile(join(ready.options.dataDir, 'perfil.md'), 'Perfil fictício.');
  assert.equal(await main(['setup'], ready.options), 0);
  assert.match(ready.text(), /Busca: pronta[\s\S]*Perfil: encontrado[\s\S]*claude e codex[\s\S]*1\. npm run collect/);
});

test('setup recusa Node antigo, acusa busca inválida sem apagar e não aceita argumentos', async t => {
  const { options, stderr, text } = await setup(t);
  assert.equal(await main(['setup'], { ...options, nodeVersion: '18.19.0' }), 1);
  assert.match(stderr.pop(), /Node\.js 20 ou superior.*18\.19\.0/);
  assert.equal(await main(['setup', 'extra'], options), 2);
  await mkdir(options.dataDir, { recursive: true });
  await writeFile(join(options.dataDir, 'busca.json'), '{ quebrado');
  assert.equal(await runSetup({ ...options, platform: 'freebsd' }), 0);
  assert.match(text(), /Busca: com problema\. .*JSON válido/);
  assert.match(text(), /Agendamento: indisponível neste sistema/);
  assert.equal(await readFile(join(options.dataDir, 'busca.json'), 'utf8'), '{ quebrado');
});
