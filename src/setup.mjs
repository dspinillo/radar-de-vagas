import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeDataDir, loadSearch } from './data-dir.mjs';
import { resolveExecutable } from './schedule.mjs';

export const onboardingRequest = 'Faça meu onboarding do Radar de Vagas seguindo skills/onboarding/SKILL.md';
const scheduling = { darwin: 'disponível', win32: 'disponível', linux: 'disponível com systemd de usuário' };

/** Confere a máquina, cria a pasta de dados e diz o próximo passo. Pode rodar quantas vezes quiser. */
export async function setup({ stdout = console.log, platform = process.platform, env = process.env,
  nodeVersion = process.versions.node, path = env.PATH ?? '', dataDir } = {}) {
  if (Number(nodeVersion.split('.')[0]) < 20) {
    throw new Error(`o Radar precisa do Node.js 20 ou superior e esta máquina tem o ${nodeVersion}. Atualize em https://nodejs.org e rode de novo.`);
  }
  const directory = await initializeDataDir(dataDir === undefined ? {} : { dataDir });
  const searchPath = join(directory, 'busca.json');
  let search = 'pronta', example = false;
  try { example = 'aviso' in await loadSearch({ dataDir: directory }); }
  catch (error) { search = `com problema. ${error.message}`; }
  if (example) search = 'ainda com o exemplo fictício';
  const profile = await stat(join(directory, 'perfil.md')).then(() => true, () => false);
  const agents = [];
  for (const agent of ['claude', 'codex']) {
    try { await resolveExecutable(agent, path, platform); agents.push(agent); }
    catch { /* Agente ausente não impede o uso. */ }
  }
  const lines = [
    `Node.js ${nodeVersion}: ok`,
    `Pasta de dados: ${directory}`,
    `Busca: ${search}`,
    `Perfil: ${profile ? 'encontrado' : 'ainda não criado'}`,
    `Agentes encontrados: ${agents.length ? agents.join(' e ') : 'nenhum (Claude Code ou Codex)'}`,
    `Agendamento: ${scheduling[platform] ?? 'indisponível neste sistema, use o modo manual'}`,
    '',
    'Próximo passo:',
  ];
  if (agents.length && (!profile || example)) {
    lines.push(`  1. Nesta pasta, abra o agente: ${agents.join(' ou ')}`,
      `  2. Peça: ${onboardingRequest}`,
      '  A entrevista grava seu perfil e sua busca. Depois dela: npm run collect, peça a triagem ao agente e npm run open.');
  } else if (agents.length) {
    lines.push('  1. npm run collect', '  2. No agente, peça: Faça a triagem', '  3. npm run open');
  } else {
    lines.push(...(example ? [`  1. Edite ${searchPath}: troque os termos e as empresas de exemplo e apague o campo "aviso".`] : []),
      `  ${example ? 2 : 1}. npm run collect`, `  ${example ? 3 : 2}. npm run open`,
      '  Sem agente o radar coleta e mostra as vagas, sem estrelas nem alertas.',
      '  Para ter a triagem, instale o Claude Code ou o Codex e rode npm run setup de novo.');
  }
  for (const line of lines) stdout(line);
  return 0;
}
