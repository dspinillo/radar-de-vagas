# Referência de uso

O [README](../README.md) cobre a instalação e o primeiro uso. Aqui ficam os detalhes para consulta.

## Comandos

Rode na raiz do clone. `npm run setup`, `npm run collect` e `npm run open` são atalhos para os três primeiros.

| Comando | O que faz |
|---|---|
| `node bin/radar.mjs setup` | Confere a máquina, cria a pasta de dados e diz o próximo passo |
| `node bin/radar.mjs collect` | Coleta vagas das fontes ligadas na busca |
| `node bin/radar.mjs open` | Abre a página do radar no navegador |
| `node bin/radar.mjs paths` | Mostra os caminhos de perfil, busca, régua, currículos e entrevistas |
| `node bin/radar.mjs triage-run` | Roda a triagem no agente configurado em `busca.json` |
| `node bin/radar.mjs descobrir "Nome da Empresa" [--id identificador]...` | Acha o identificador da empresa em Greenhouse, Lever, Ashby e InHire e diz se há vaga no Brasil |
| `node bin/radar.mjs schedule on --hours 6` | Liga o agendamento |
| `node bin/radar.mjs schedule status` | Mostra se está ligado |
| `node bin/radar.mjs schedule off` | Volta ao modo manual |
| `node bin/radar.mjs --help` | Lista todos, inclusive os usados pelas skills |

## Pasta de dados

`busca.json`, `estado.json`, `perfil.md`, `regua.md`, currículos e entrevistas ficam em `.radar-de-vagas` na sua pasta pessoal, fora do clone. A variável opcional `RADAR_DATA_DIR` escolhe outra pasta absoluta, também fora do repositório.

Para experimentar sem tocar nos seus dados, aponte para uma pasta temporária antes dos comandos.

Mac e Linux:

```sh
export RADAR_DATA_DIR="$(mktemp -d)"
```

Windows (PowerShell):

```powershell
$env:RADAR_DATA_DIR = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
```

O estado das vagas é acessado apenas pelos comandos; nenhuma skill edita `estado.json`.

## Campos do `busca.json`

O onboarding preenche este arquivo por você. Para editar na mão, salve como JSON válido: aspas duplas e sem vírgula depois do último item.

| Campo | Valor |
|---|---|
| `termos` | Lista não vazia do que procurar na Gupy e no LinkedIn |
| `localidade` | Texto, ou `null` para deixar em aberto |
| `modelo` | `remoto`, `híbrido`, `presencial` ou `null` |
| `idadeMaximaDias` | Inteiro positivo ou `null`. Publicação desconhecida nunca exclui a vaga |
| `fontes` | `gupy` e `linkedin`, cada um `true` ou `false` |
| `empresas` | Identificadores das páginas de carreiras em `greenhouse`, `lever`, `ashby` e `inhire`. Use `[]` para não consultar um portal |
| `detalhesNovosPorFonte` | Opcional, padrão 150. Teto de vagas novas detalhadas por fonte em cada rodada |
| `prazoFonteSegundos` | Opcional, padrão 600. Prazo da execução inteira de cada fonte |
| `tetoTriagemPorRodada` | Opcional, padrão 30. Vagas julgadas pelo agente por rodada |
| `agente` | Opcional, `claude` ou `codex`. Liga o `triage-run` e a triagem agendada |
| `aviso` | Marca o arquivo de exemplo. Apague depois de trocar os exemplos |

O arquivo nasce com termos e empresas fictícios. Enquanto as empresas inventadas estiverem lá, só a Gupy traz vaga real.

**LinkedIn** vem desligado. Para ligar, mude `fontes.linkedin` para `true`. É raspagem de páginas públicas, sem login: pode sofrer bloqueios e mudanças no portal. O coletor espera um segundo entre chamadas e para de paginar quando o teto de detalhes enche. Se o LinkedIn responder 429 (limite de volume), espera e tenta de novo até três vezes; se a barreira persistir, ou se aparecer login ou captcha, interrompe só essa fonte e as outras seguem. Para reduzir o risco, use poucos termos e um `detalhesNovosPorFonte` menor.

## Descobrir identificador de empresa

`descobrir "Nome da Empresa"` sonda Greenhouse, Lever, Ashby e InHire só pela listagem (nunca abre detalhe de vaga) e diz se cada identificador candidato existe, quantas vagas tem e quantas parecem ser no Brasil. Os candidatos vêm do nome (tudo junto, com hífen, primeira palavra) e de `--id identificador` (repetível), que você usa quando já sabe o identificador exato, visto no endereço da página de carreiras. O comando não edita `busca.json`; o resultado em JSON e o resumo em português dizem o que incluir em `empresas.<fonte>` à mão.

## Coleta

A coleta mostra início, páginas, detalhes N de M, conclusão, contagens e avisos por fonte. Avisos precisam ser conferidos mesmo se o comando terminar normalmente.

- A idade é aplicada na listagem, antes dos detalhes. Não há corte local por título ou modelo.
- Até quatro detalhes são processados em paralelo por fonte; o LinkedIn segue em série.
- Vagas que passaram do teto ficam pendentes e são tentadas nas próximas coletas. Um aviso informa quantas.
- Prazo excedido registra erro e a coleta segue para a próxima fonte.
- O estado é salvo ao concluir cada fonte. **Ctrl+C** preserva as fontes concluídas e aguarda a limpeza de trava e temporários.
- Vagas reencontradas atualizam a última observação sem buscar detalhes de novo.

## Página

`open` imprime o endereço local e abre o navegador padrão. **Inscrevi** registra que você enviou a candidatura. **Descartar** pede um motivo. As marcações sobrevivem a fechar a página, reabrir e coletar de novo. O radar não envia candidaturas. Depois de outra coleta, use **Atualizar vagas**.

## Triagem

O teto padrão é 30 vagas por rodada; as demais ficam na fila, sem descarte automático. Com `agente` em `busca.json`, `node bin/radar.mjs triage-run` roda a mesma skill sem abrir o agente. Sem esse campo, o comando só explica como ligar. Cada julgamento consome sua assinatura ou cota do agente.

## Agendamento

`schedule on --hours 6` agenda coleta seguida de `triage-run`. Máquina desligada não executa a agenda.

| Sistema | Mecanismo | Validado em máquina real |
|---|---|---|
| Mac | launchd | Sim |
| Windows | Agendador de Tarefas | Não |
| Linux | timer do systemd de usuário (`radar-de-vagas.timer`) | Não |

No Linux o timer roda enquanto você tem sessão aberta. Para rodar também sem login, ative uma vez `loginctl enable-linger`. Em WSL ou contêiner sem systemd o comando explica que só o modo manual está disponível.

Ao ligar a agenda, o radar valida Node e o agente configurado, guarda um PATH com as pastas dos executáveis e preserva `RADAR_DATA_DIR` quando definida. Uma rodada ainda ativa faz a próxima sair sem coletar nem triar, registrando o motivo no log. Travas de processos encerrados são recuperadas; uma trava sem PID válido só é recuperada após 30 segundos. `agendamento.log`, na pasta de dados, é reduzido à parte final de cerca de 256 KiB quando passa de 1 MiB.

## Acompanhamento, currículo e entrevista

Peça o currículo pelo ID, revise o HTML e salve como PDF pelo navegador. Envie a candidatura por conta própria e marque **inscrevi** na página. Conte novidades ao agente para atualizar etapa e próximo passo. Quando tiver entrevista, informe o ID para receber a página única de preparo. Currículo e preparo usam somente fatos do perfil; lacunas viram perguntas.

`track` atualiza o acompanhamento, sem marcar inscrevi nem descartar, que continuam na página. Campos omitidos são preservados; `--clear-next` limpa o próximo passo e `--clear-notes` limpa as notas. Não combine uma opção de limpeza com o texto do mesmo campo. Valores iniciados por `--` são aceitos com `=`, por exemplo `--reason="--home office"`.

## Carregar o plugin sem instalar

`claude --plugin-dir .` carrega as skills direto do clone durante a sessão, com os mesmos nomes. Veja a [documentação de plugins do Claude Code](https://code.claude.com/docs/en/plugins) e a de [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces). No Codex, o `AGENTS.md` aponta para as mesmas skills.

## Testes

```sh
node --test
```

Rodam sem rede e sem tocar nos seus dados.
