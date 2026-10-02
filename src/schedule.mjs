import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, stat, mkdir, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { ensureDataDir, resolveDataDir, loadSearch } from './data-dir.mjs';
import { repositoryDir } from './triage-run.mjs';

const label = 'com.radar-de-vagas.collect';
const taskName = 'Radar de Vagas';
const xml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);
// Argumentos Windows seguem as regras de CommandLineToArgvW; não passam por cmd.exe.
const quoteWindows = value => `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;

export function buildPlist({ nodePath, repoDir, dataDir, hours, path, dataEnv }) {
  const args = [nodePath, join(repoDir, 'src', 'scheduled-run.mjs'), dataDir];
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(repoDir)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string>${dataEnv === undefined ? '' : `<key>RADAR_DATA_DIR</key><string>${xml(dataEnv)}</string>`}</dict>
<key>StartInterval</key><integer>${hours * 3600}</integer><key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>${xml(join(dataDir, 'agendamento.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(dataDir, 'agendamento.log'))}</string>
</dict></plist>\n`;
}

export function buildTaskXml({ nodePath, repoDir, dataDir, hours, startAt, path = '', dataEnv }) {
  // O esquema do Agendador não oferece EnvironmentVariables: o executor recebe os valores.
  const args = [join(repoDir, 'src', 'scheduled-run.mjs'), dataDir, '--path', path,
    ...(dataEnv === undefined ? [] : ['--data-env', dataEnv])].map(quoteWindows).join(' ');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><TimeTrigger><StartBoundary>${xml(startAt)}</StartBoundary><Repetition><Interval>PT${hours}H</Interval></Repetition></TimeTrigger></Triggers>
<Principals><Principal id="user"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled></Settings>
<Actions Context="user"><Exec><Command>${xml(nodePath)}</Command><Arguments>${xml(args)}</Arguments><WorkingDirectory>${xml(repoDir)}</WorkingDirectory></Exec></Actions>
</Task>\n`;
}

async function resolveExecutable(command, path, platform) {
  const candidates = isAbsolute(command) ? [command] : path.split(platform === 'win32' ? ';' : ':')
    .filter(Boolean).flatMap(directory => (platform === 'win32' ? ['', '.exe', '.com'] : [''])
      .map(extension => resolve(directory, command + extension)));
  for (const candidate of candidates) {
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, constants.X_OK);
      return resolve(candidate);
    } catch { /* Tenta o próximo caminho. */ }
  }
  throw new Error(`Não foi possível encontrar o executável ${command}. Confira a instalação e o PATH antes de ligar o agendamento.`);
}

export async function schedule(action, { platform = process.platform, homeDir = homedir(), env = process.env,
  dataDir = resolveDataDir(env), repoDir = repositoryDir, nodePath = process.execPath,
  path = env.PATH ?? '', hours = 6, now = new Date(), uid = process.getuid?.(),
  run = promisify(execFile) } = {}) {
  if (!['darwin', 'win32'].includes(platform)) throw new Error('Agendamento disponível somente no Mac e no Windows.');
  const directory = await ensureDataDir(dataDir);
  let config;
  if (action === 'on') {
    const { agente: agent } = await loadSearch({ dataDir: directory });
    nodePath = await resolveExecutable(nodePath, path, platform);
    const agentPath = agent ? await resolveExecutable(agent, path, platform) : null;
    const separator = platform === 'win32' ? ';' : ':';
    path = [...new Set([...(agentPath ? [dirname(agentPath)] : []), dirname(nodePath),
      ...path.split(separator).filter(Boolean).map(part => resolve(part))])].join(separator);
    config = { nodePath, repoDir, dataDir: directory, hours, path,
      dataEnv: env.RADAR_DATA_DIR === undefined ? undefined : directory, startAt: now.toISOString() };
  }
  const plist = join(homeDir, 'Library', 'LaunchAgents', `${label}.plist`);
  const task = join(directory, 'agendamento.xml');
  const target = `gui/${uid}/${label}`;
  const query = async () => {
    try {
      const { stdout = '' } = platform === 'darwin'
        ? await run('launchctl', ['print', target])
        : await run('schtasks', ['/Query', '/TN', taskName, '/XML']);
      const settings = stdout.match(/<Settings\b[^>]*>([\s\S]*?)<\/Settings>/i)?.[1] ?? '';
      return { exists: true, enabled: platform === 'darwin' || !/<Enabled>false<\/Enabled>/i.test(settings) };
    } catch (error) {
      // launchctl distingue serviço ausente; schtasks informa a ausência no stderr localizado.
      if ((platform === 'darwin' && error.code === 113) || (platform === 'win32' && error.code === 1 &&
          /cannot find|não pode encontrar|não foi possível encontrar|não é possível encontrar/i.test(error.stderr ?? ''))) {
        return { exists: false, enabled: false };
      }
      throw new Error('Não foi possível consultar o agendador. Confira as permissões.', { cause: error });
    }
  };
  let state = await query();
  if (action === 'off' || action === 'on') {
    if (state.exists) {
      if (platform === 'darwin') await run('launchctl', ['bootout', target]);
      else {
        try { await run('schtasks', ['/End', '/TN', taskName]); }
        catch (error) {
          if (!/not running|não está em execução/i.test(error.stderr ?? '')) throw error;
        }
        await run('schtasks', ['/Delete', '/TN', taskName, '/F']);
      }
    }
    if (platform === 'darwin') await rm(plist, { force: true });
    await rm(task, { force: true });
    state = { exists: false, enabled: false };
  }
  if (action === 'on') {
    if (platform === 'darwin') {
      await mkdir(join(homeDir, 'Library', 'LaunchAgents'), { recursive: true });
      await writeFile(plist, buildPlist(config), { mode: 0o600 });
      try { await run('launchctl', ['bootstrap', `gui/${uid}`, plist]); }
      catch (error) { await rm(plist, { force: true }); throw error; }
    } else {
      await writeFile(task, '\uFEFF' + buildTaskXml(config), { encoding: 'utf16le', mode: 0o600 });
      try { await run('schtasks', ['/Create', '/TN', taskName, '/XML', task, '/F']); }
      catch (error) { await rm(task, { force: true }); throw error; }
    }
    state = { exists: true, enabled: true };
  }
  let nextRun = null;
  if (platform === 'win32' && state.enabled) {
    const { stdout = '' } = await run('schtasks', ['/Query', '/TN', taskName, '/FO', 'CSV', '/NH']);
    // Sem /V: nome, próxima execução e situação; posição independe do idioma do Windows.
    nextRun = stdout.trim().match(/^"(?:[^"]|"")*","((?:[^"]|"")*)"/)?.[1].replace(/""/g, '"') || null;
  }
  return { enabled: state.enabled, nextRun };
}
