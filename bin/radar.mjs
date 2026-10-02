#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collect } from '../src/collect.mjs';
import { startServer } from '../src/page/server.mjs';
import { openBrowser } from '../src/open-browser.mjs';
import { stateCommand, stateCommands } from '../src/commands.mjs';

const help = 'Uso: node bin/radar.mjs <comando>\n\ncollect  Coleta vagas da busca.\nopen     Abre o radar no navegador.\npaths    Mostra os caminhos dos dados.\npending [--limit N]  Lista vagas para triagem.\nshow <id>  Mostra a vaga inteira.\ntriage <id> --fit <1 a 5> --reason "texto" [--alert "texto"]...\ndiscards  Lista os descartes.\ntrack <id> --stage "texto" [--next "texto" | --clear-next] [--notes "texto" | --clear-notes]\ntriage-run  Executa a skill de triagem no agente configurado.\nschedule on [--hours 6] | off | status\n--help   Mostra esta ajuda.';

async function openCommand({ startServer: serve, openBrowser: open, signals, stdout, stderr }) {
  const server = await serve();
  let stop;
  const stopped = new Promise(resolve => { stop = resolve; });
  signals.once('SIGINT', stop);
  signals.once('SIGTERM', stop);
  try {
    stdout(`Radar disponível em ${server.url}`);
    stdout('Pressione Ctrl+C para encerrar.');
    await Promise.race([stopped, Promise.resolve().then(() => open(server.url)).catch(() => {
      stderr('Não foi possível abrir o navegador. Abra o endereço acima manualmente.');
    })]);
    await stopped;
  } finally {
    try { await server.close(); }
    finally {
      signals.removeListener('SIGINT', stop);
      signals.removeListener('SIGTERM', stop);
    }
  }
  return 0;
}

async function collectCommand({ collect: runCollect, stdout, stderr, signals, dataDir }) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signals.on('SIGINT', stop);
  signals.on('SIGTERM', stop);
  let summary;
  try { summary = await runCollect({ ...(dataDir === undefined ? {} : { dataDir }), log: stdout, signal: controller.signal }); }
  finally {
    signals.removeListener('SIGINT', stop);
    signals.removeListener('SIGTERM', stop);
  }
  for (const source of summary.sources) {
    stdout(`${source.label}: ${source.seen} vagas vistas, ${source.new} novas, ${source.errors.length} ${source.errors.length === 1 ? 'erro' : 'erros'}.`);
    for (const error of source.errors) {
      stderr(`Aviso — ${source.label} (${error.target}, ${error.step}): ${error.message}`);
    }
  }
  stdout(`Total: ${summary.totalNew} vagas novas.`);
  for (const warning of summary.warnings) stderr(`Aviso: ${warning}`);
  if (controller.signal.aborted) return 130;
  if (summary.sources.length === 0) {
    stderr('Aviso: nenhuma fonte rodou. Confira as fontes e empresas em busca.json.');
    return 1;
  }
  return 0;
}

const commands = new Map([['collect', collectCommand], ['open', openCommand]]);

/** Despacha o comando e devolve o código de saída, sem encerrar o processo. */
export async function main(args = process.argv.slice(2), {
  collect: runCollect = collect, stdout = console.log, stderr = console.error,
  startServer: serve = startServer, openBrowser: open = openBrowser, signals = process,
  ...options
} = {}) {
  const [command, ...rest] = args;
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(command))) {
    stdout(help);
    return 0;
  }
  if ((!commands.has(command) && !stateCommands.includes(command)) || (commands.has(command) && rest.length)) {
    stderr('Comando ou argumentos inválidos. Use --help.');
    return 2;
  }
  try {
    if (stateCommands.includes(command)) return await stateCommand(command, rest, { ...options, signals, stdout, stderr });
    return await commands.get(command)({ ...options, collect: runCollect, startServer: serve, openBrowser: open, signals, stdout, stderr });
  } catch (error) {
    stderr(error.exitCode === 2 ? error.message : `Não foi possível ${command === 'open' ? 'abrir o radar' : command === 'collect' ? 'coletar' : 'executar o comando'}: ${error?.message || 'falha inesperada.'}`);
    return error.exitCode ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
