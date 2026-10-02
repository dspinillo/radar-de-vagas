import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../bin/radar.mjs';
import { startServer } from '../src/page/server.mjs';
import { openBrowser } from '../src/open-browser.mjs';

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`open serve a página e encerra com ${signal}, sem abrir navegador real`, async t => {
    const dataDir = await mkdtemp(join(tmpdir(), 'radar-open-'));
    t.after(() => rm(dataDir, { recursive: true, force: true }));
    const signals = new EventEmitter(), output = [], errors = [];
    let url, closed = 0;
    const result = await main(['open'], {
      signals, stdout: value => output.push(value), stderr: value => errors.push(value),
      startServer: async () => {
        const server = await startServer({ dataDir, port: 0 });
        t.after(() => server.close());
        return { url: server.url, close: async () => { closed++; await server.close(); } };
      },
      openBrowser: async address => {
        url = address;
        try {
          const response = await fetch(url);
          assert.equal(response.status, 200);
          assert.match(await response.text(), /Radar de Vagas/i);
        } finally { signals.emit(signal); }
      },
    });
    assert.equal(result, 0);
    assert.equal(closed, 1);
    assert.ok(output.some(value => value.includes(url)));
    assert.ok(output.some(value => value.includes('Ctrl+C')));
    assert.deepEqual(errors, []);
    assert.equal(signals.listenerCount('SIGINT'), 0);
    assert.equal(signals.listenerCount('SIGTERM'), 0);
    await assert.rejects(fetch(url));
  });
}
test('falha do abridor mantém endereço disponível até encerrar', async () => {
  const signals = new EventEmitter(), errors = [];
  let closed = false;
  const result = await main(['open'], {
    signals, stdout: () => {}, stderr: value => { errors.push(value); signals.emit('SIGINT'); },
    startServer: async () => ({ url: 'http://127.0.0.1:4317', close: async () => { closed = true; } }),
    openBrowser: async () => { throw new Error('Abridor indisponível.'); },
  });
  assert.equal(result, 0);
  assert.equal(closed, true);
  assert.match(errors[0], /manualmente/);
});
test('falha ao iniciar servidor retorna erro sem chamar abridor', async () => {
  const errors = [];
  assert.equal(await main(['open'], {
    stdout: () => {}, stderr: value => errors.push(value),
    startServer: async () => { throw new Error('Falha fictícia.'); },
    openBrowser: () => assert.fail('Não deve abrir.'),
  }), 1);
  assert.match(errors[0], /Não foi possível abrir o radar/);
});
test('ajuda em português sem argumento e argumentos inválidos não iniciam servidor', async () => {
  const output = [];
  const options = { stdout: value => output.push(value), stderr: () => {},
    startServer: () => assert.fail('Não deve iniciar.'), collect: () => assert.fail('Não deve coletar.') };
  for (const args of [[], ['-h'], ['--help']]) assert.equal(await main(args, options), 0);
  for (const args of [['open', 'extra'], ['inexistente']]) assert.equal(await main(args, options), 1);
  assert.ok(output.every(value => /Uso:/.test(value) && /collect/.test(value) && /open/.test(value)));
});
for (const [platform, executable, prefix] of [
  ['darwin', 'open', []], ['win32', 'rundll32.exe', ['url.dll,FileProtocolHandler']], ['linux', 'xdg-open', []],
]) {
  test(`abridor usa comando nativo em ${platform} sem shell`, async () => {
    const calls = [], url = 'http://127.0.0.1:4317';
    await openBrowser(url, { platform, run: async (...args) => calls.push(args) });
    assert.deepEqual(calls, [[executable, [...prefix, url]]]);
  });
}
