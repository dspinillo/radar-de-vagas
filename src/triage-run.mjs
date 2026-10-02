import { spawn as spawnProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSearch, resolveDataDir } from './data-dir.mjs';

export const repositoryDir = fileURLToPath(new URL('../', import.meta.url));

// Sem pessoa para aprovar: o agente só recebe o que a triagem usa (comandos do radar e a pasta de dados).
export function buildAgentCommand(agent, repoDir, dataDir) {
  if (!['claude', 'codex'].includes(agent)) throw new Error('Agente inválido: use claude ou codex.');
  const prompt = 'Leia skills/triagem/SKILL.md e execute a skill de triagem do Radar de Vagas em modo não interativo.\n' +
    `Caminho do repositório: ${repoDir}`;
  const args = agent === 'claude'
    ? ['-p', prompt, '--add-dir', dataDir, '--allowedTools', 'Read', 'Edit', 'Write', 'Bash(node bin/radar.mjs:*)']
    : ['exec', '-s', 'workspace-write', '-c', 'model_reasoning_effort=medium', '--add-dir', dataDir, prompt];
  return { command: agent, args };
}

export async function runTriage({ dataDir = resolveDataDir(), repoDir = repositoryDir,
  spawn = spawnProcess, stdout = console.log, signals = process } = {}) {
  const { agente: agent } = await loadSearch({ dataDir });
  if (!agent) {
    stdout('Triagem automática desligada. Para ligar, adicione "agente": "claude" ou "agente": "codex" ao busca.json.');
    return 0;
  }
  const { command, args } = buildAgentCommand(agent, repoDir, dataDir);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoDir, env: { ...process.env, RADAR_DATA_DIR: dataDir },
      stdio: ['ignore', 'inherit', 'inherit'], shell: false });
    let stopped = false;
    const stop = () => { stopped = true; child.kill('SIGTERM'); };
    const cleanup = () => { signals.removeListener('SIGINT', stop); signals.removeListener('SIGTERM', stop); };
    signals.once('SIGINT', stop);
    signals.once('SIGTERM', stop);
    child.once('error', () => {
      cleanup();
      reject(new Error(`Não foi possível iniciar ${agent}. Confira a instalação e o login do agente.`));
    });
    child.once('close', code => { cleanup(); resolve(stopped ? 130 : code ?? 1); });
  });
}
