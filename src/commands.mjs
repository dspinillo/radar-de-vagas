import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeDataDir, loadSearch } from './data-dir.mjs';
import { loadState, setTriage, setTracking } from './state.mjs';
import { runTriage } from './triage-run.mjs';
import { schedule } from './schedule.mjs';

export const stateCommands = ['paths', 'pending', 'show', 'triage', 'discards', 'track', 'triage-run', 'schedule'];
const usage = message => { throw Object.assign(new Error(message), { exitCode: 2 }); };

function flags(args, allowed, switches = []) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const separator = args[i].indexOf('=');
    const key = separator < 0 ? args[i] : args[i].slice(0, separator);
    if (switches.includes(key) && separator >= 0) usage('Esta opção não recebe valor.');
    const value = switches.includes(key) ? true : separator < 0 ? args[++i] : args[i].slice(separator + 1);
    if (![...allowed, ...switches].includes(key) || value === undefined ||
        (key !== '--alert' && Object.hasOwn(values, key))) usage('Opções inválidas ou sem valor.');
    if (key === '--alert') (values[key] ??= []).push(value);
    else values[key] = value;
  }
  return values;
}

function positive(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    usage(`${label} precisa ser um inteiro positivo.`);
  }
  return Number(value);
}

export async function stateCommand(command, args, options) {
  const { stdout, stderr } = options;
  const json = value => stdout(JSON.stringify(value));
  if (['paths', 'discards', 'triage-run'].includes(command) && args.length) usage('Este comando não recebe argumentos.');
  if (command === 'paths') {
    const dataDir = await initializeDataDir(options);
    const resumes = join(dataDir, 'curriculos'), interviews = join(dataDir, 'entrevistas');
    await mkdir(resumes, { recursive: true });
    await mkdir(interviews, { recursive: true });
    json({ dataDir, profile: join(dataDir, 'perfil.md'), search: join(dataDir, 'busca.json'),
      ruler: join(dataDir, 'regua.md'), resumes, interviews });
  } else if (command === 'pending') {
    const value = flags(args, ['--limit']);
    const explicit = value['--limit'] === undefined ? null : positive(value['--limit'], 'O limite');
    const search = await loadSearch(options);
    const limit = explicit ?? search.tetoTriagemPorRodada ?? 30;
    const state = await loadState(options);
    const pending = Object.entries(state.jobs).filter(([, entry]) => !entry.triage && !entry.mark)
      .map(([id, { job, seen }]) => ({ id, job, seen }))
      .sort((a, b) => b.seen.firstSeenAt.localeCompare(a.seen.firstSeenAt) || a.id.localeCompare(b.id));
    json(pending.slice(0, limit));
    stderr(`${Math.max(0, pending.length - limit)} vagas ficaram para a próxima rodada.`);
  } else if (command === 'discards') {
    const state = await loadState(options);
    json(Object.entries(state.jobs).filter(([, entry]) => entry.mark?.status === 'discarded')
      .map(([id, { job, mark }]) => ({ id, title: job.title, company: job.company,
        cutReason: mark.cutReason, markedAt: mark.markedAt })));
  } else if (command === 'triage-run') {
    return runTriage(options);
  } else if (command === 'schedule') {
    const [action, ...rest] = args;
    if (!['on', 'off', 'status'].includes(action)) usage('Use schedule on, off ou status.');
    const value = flags(rest, action === 'on' ? ['--hours'] : []);
    const hours = positive(value['--hours'] ?? 6, 'O intervalo');
    if (hours > 744) usage('O intervalo máximo é 744 horas (31 dias).');
    const result = await schedule(action, { ...options, hours });
    stdout(`Agendamento ${result.enabled ? 'ligado' : 'desligado'}.${result.enabled ? ` Próxima execução: ${result.nextRun ?? 'não informada pelo sistema'}.` : ''}`);
    stderr('Com a máquina desligada, o radar não roda. A retomada depende de ligar e entrar na conta do usuário.');
  } else {
    const [id, ...rest] = args;
    if (!id || id.startsWith('--')) usage('Informe o identificador da vaga.');
    const value = flags(rest, command === 'triage' ? ['--fit', '--reason', '--alert']
      : command === 'track' ? ['--stage', '--next', '--notes'] : [],
    command === 'track' ? ['--clear-next', '--clear-notes'] : []);
    let block;
    if (command === 'triage') {
      const fit = positive(value['--fit'], 'A nota');
      if (fit > 5 || !value['--reason']?.trim() || value['--alert']?.some(alert => !alert.trim())) {
        usage('Use nota de 1 a 5, motivo e alertas não vazios.');
      }
      block = { fit, reason: value['--reason'], alerts: value['--alert'] ?? [] };
    } else if (command === 'track') {
      if (!value['--stage']?.trim()) usage('Informe a etapa com --stage.');
      block = { stage: value['--stage'] };
      for (const field of ['next', 'notes']) {
        if (value[`--clear-${field}`] && Object.hasOwn(value, `--${field}`)) {
          usage(`Use --${field} ou --clear-${field}, sem combinar as duas opções.`);
        }
        if (Object.hasOwn(value, `--${field}`)) block[field] = value[`--${field}`];
        if (value[`--clear-${field}`]) block[field] = field === 'next' ? null : '';
      }
    }
    const state = await loadState(options);
    const canonical = Object.hasOwn(state.jobs, id) ? id : Object.hasOwn(state.aliases, id) ? state.aliases[id] : null;
    if (!canonical) usage('Vaga não encontrada.');
    if (command === 'show') json(state.jobs[canonical]);
    else {
      await (command === 'triage' ? setTriage : setTracking)(id, block, options);
      stdout(command === 'triage' ? 'Triagem salva.' : 'Acompanhamento salvo.');
    }
  }
  return 0;
}
