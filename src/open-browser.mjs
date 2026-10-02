import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** Usa o abridor do sistema, sem shell; execução injetável nos testes. */
export async function openBrowser(url, { platform = process.platform, run = promisify(execFile) } = {}) {
  const commands = {
    darwin: ['open', [url]],
    win32: ['rundll32.exe', ['url.dll,FileProtocolHandler', url]],
    linux: ['xdg-open', [url]],
  };
  const command = commands[platform];
  if (!command) throw new Error('Sistema sem abridor de navegador configurado.');
  await run(...command);
}
