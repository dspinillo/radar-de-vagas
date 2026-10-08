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
const unitName = 'radar-de-vagas';
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

// Aspas, barra, especificador (%) e variável ($) seguem as regras de ExecStart do systemd.
const quoteSystemd = value => `"${String(value).replace(/[\\"]/g, '\\$&').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`;

export function buildSystemdUnits({ nodePath, repoDir, dataDir, hours, path = '', dataEnv }) {
  // Como no Windows, o executor recebe PATH e pasta de dados por argumento.
  const args = [nodePath, join(repoDir, 'src', 'scheduled-run.mjs'), dataDir, '--path', path,
    ...(dataEnv === undefined ? [] : ['--data-env', dataEnv])].map(quoteSystemd).join(' ');
  return {
    service: `[Unit]\nDescription=Radar de Vagas: coleta e triagem\n\n[Service]\nType=oneshot\nWorkingDirectory=${String(repoDir).replace(/%/g, '%%')}\nExecStart=${args}\n`,
    timer: `[Unit]\nDescription=Radar de Vagas a cada ${hours} h\n\n[Timer]\nOnActiveSec=1min\nOnBootSec=5min\nOnUnitActiveSec=${hours}h\n\n[Install]\nWantedBy=timers.target\n`,
  };
}

export async function resolveExecutable(command, path, platform) {
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
  if (!['darwin', 'win32', 'linux'].includes(platform)) {
    throw new Error('Agendamento disponível no Mac, no Windows e no Linux com systemd. Neste sistema, use o modo manual.');
  }
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
  const unitDir = join(env.XDG_CONFIG_HOME || join(homeDir, '.config'), 'systemd', 'user');
  const units = ['service', 'timer'].map(kind => join(unitDir, `${unitName}.${kind}`));
  const systemctl = args => run('systemctl', ['--user', ...args]);
  const query = platform !== 'linux' ? null : async () => {
    try {
      await systemctl(['is-enabled', `${unitName}.timer`]);
      return { exists: true, enabled: true };
    } catch (error) {
      // is-enabled sai com erro e escreve o estado; unidade ausente varia conforme a versão do systemd.
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
      if (error.code !== 'ENOENT' && /not-found|no such file|does not exist/i.test(output)) return { exists: false, enabled: false };
      if (error.code !== 'ENOENT' && /^\s*(disabled|masked|static|indirect|linked)/im.test(output)) return { exists: true, enabled: false };
      throw new Error('Não foi possível consultar o systemd de usuário. Em WSL ou contêiner sem systemd, use o modo manual.', { cause: error });
    }
  };
  const queryNative = async () => {
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
  let state = await (query ?? queryNative)();
  if (action === 'off' || action === 'on') {
    if (state.exists) {
      if (platform === 'linux') await systemctl(['disable', '--now', `${unitName}.timer`]);
      else if (platform === 'darwin') await run('launchctl', ['bootout', target]);
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
    if (platform === 'linux') {
      for (const unit of units) await rm(unit, { force: true });
      if (state.exists) await systemctl(['daemon-reload']);
    }
    state = { exists: false, enabled: false };
  }
  if (action === 'on') {
    if (platform === 'linux') {
      const content = buildSystemdUnits(config);
      await mkdir(unitDir, { recursive: true });
      await writeFile(units[0], content.service, { mode: 0o600 });
      await writeFile(units[1], content.timer, { mode: 0o600 });
      try {
        await systemctl(['daemon-reload']);
        await systemctl(['enable', '--now', `${unitName}.timer`]);
      } catch (error) {
        for (const unit of units) await rm(unit, { force: true });
        throw new Error('Não foi possível ligar o agendamento no systemd de usuário. Em WSL ou contêiner sem systemd, use o modo manual.', { cause: error });
      }
    } else if (platform === 'darwin') {
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
