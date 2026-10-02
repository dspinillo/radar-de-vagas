# Radar de Vagas

> Um agente que conhece o seu repertório, varre os portais de vagas, ranqueia o que encontrou e aprende com cada descarte. Quem decide se aplica é você.
>
> **Tipo:** misto (plugin de agente, scripts e página local) · **Nível:** N3 · **Stack:** Node 20+ sem dependências · **Licença:** MIT

**Versão 0.1.0.** Coleta, radar local, cinco skills, triagem, acompanhamento e agendamento implementados. Validação nativa do agendamento em Mac e Windows permanece pendente.

## Visão

Procurar emprego virou trabalho de varredura: abrir cinco portais por dia, ler anúncios longos e descobrir no último parágrafo que a vaga exige algo que você não tem. O Radar de Vagas faz essa varredura por você e entrega uma tabela só, com as vagas novas ordenadas por encaixe.

Ele começa com uma entrevista: quem você é, seus casos e entregas, seu currículo, onde quer trabalhar, em que modelo, que idiomas fala e que faixa salarial aceita. A partir daí coleta vagas em vários portais, lê a descrição inteira de cada uma e devolve estrelas, o motivo e os alertas. Quando você descarta uma vaga e escreve o porquê, isso vira memória: a próxima vaga com o mesmo ponto chega avisada.

O que ele **não** é: não se candidata por você, não esconde vaga por conta própria e não manda seus dados para lugar nenhum. Perfil, currículo e histórico ficam numa pasta da sua máquina, fora deste repositório.

## Como funciona

1. Você clona o repositório e abre no Claude Code ou no Codex.
2. O agente faz a entrevista e grava seu perfil em `~/.radar-de-vagas/`.
3. A coleta roda quando você pedir ou no horário que você agendar (por exemplo, a cada seis horas).
4. A página do radar abre no navegador com as vagas novas, as estrelas e os alertas.
5. Você marca **inscrevi** ou **descartar**, com o motivo. O radar aprende.
6. Para a vaga que vale a pena, o agente monta o currículo ajustado a ela. Quando aparecer entrevista, monta uma página única de preparo. Os dois usam só o que está no seu perfil.

Sem agente instalado, a coleta e a página funcionam só com Node. Você vê as vagas, mas sem estrelas nem alertas.

## Mapa do projeto

```
radar-de-vagas/
├── README.md         # este arquivo
├── PRD.md            # o produto: princípios, escopo, riscos
├── ARCHITECTURE.md   # como as peças se encaixam
├── ROADMAP.md        # fases e tarefas
├── STATUS.md         # onde paramos
├── HANDOFF.md        # como retomar
├── CHANGELOG.md      # o que entrou de fato
├── CONTEXT.md        # vocabulário do projeto
├── LESSONS.md        # o que aprendemos na marra
├── CLAUDE.md         # instruções para agentes (AGENTS.md aponta para cá)
└── decisions/        # decisões com o porquê
```

## Como rodar

Pré-requisitos: **Node.js 20 ou superior**, com npm, e Git instalados. Não há dependências para instalar. Use o Terminal no Mac ou o PowerShell no Windows.

### Instalar e preparar a busca

Nos dois sistemas, confira a versão do Node, clone e entre na pasta:

```sh
node --version
git clone https://github.com/dspinillo/radar-de-vagas.git
cd radar-de-vagas
node --input-type=module -e "import { initializeDataDir } from './src/data-dir.mjs'; await initializeDataDir();"
```

A última linha cria `busca.json` com exemplos fictícios. Abra o arquivo para editar:

Mac:

```sh
nano "${RADAR_DATA_DIR:-$HOME/.radar-de-vagas}/busca.json"
```

No nano, salve com Ctrl+O, Enter e saia com Ctrl+X.

Windows (PowerShell):

```powershell
$dataDir = if ($env:RADAR_DATA_DIR) { $env:RADAR_DATA_DIR } else { Join-Path $HOME '.radar-de-vagas' }
notepad (Join-Path $dataDir 'busca.json')
```

Substitua `termos` pelo que procura. Ajuste `localidade`, `modelo` (`remoto`, `híbrido` ou `presencial`) e `idadeMaximaDias`; `null` deixa a preferência em aberto. Em `empresas`, troque os identificadores fictícios pelos identificadores das páginas de carreiras de cada fonte, ou use `[]` para não consultar aquele portal. Remova o campo `aviso` quando terminar. Salve como JSON, mantendo aspas duplas e sem vírgula após o último item.

Os campos opcionais `detalhesNovosPorFonte` (padrão **150**) e
`prazoFonteSegundos` (padrão **600**, dez minutos) aceitam inteiros positivos e
valem para cada fonte em cada rodada. O primeiro limita candidatos novos, somando
termos e empresas; o segundo limita a execução inteira da fonte. Exemplo:

```json
"detalhesNovosPorFonte": 150,
"prazoFonteSegundos": 600
```

A idade é aplicada na listagem antes dos detalhes; publicação desconhecida nunca
exclui a vaga. Não há corte local por título ou modelo. Até quatro detalhes são
processados em paralelo por fonte, mantendo o LinkedIn em série. Um aviso informa
quantas vagas ficaram para a próxima rodada por causa do teto; elas continuam
pendentes e serão tentadas nas próximas coletas. Um prazo excedido registra erro
e permite seguir para a próxima fonte.

LinkedIn vem desligado. Para ligar, mude `fontes.linkedin` para `true`. É raspagem de páginas públicas, sem login: pode sofrer bloqueios e mudanças no portal. O coletor espera entre chamadas e interrompe a fonte se encontrar uma barreira de acesso. Para desligar, volte para `false`.

### Primeira coleta e página

Depois de salvar a busca, rode nos dois sistemas:

```sh
npm run collect
npm run open
```

São equivalentes a `node bin/radar.mjs collect` e `node bin/radar.mjs open`. A coleta mostra início, páginas, detalhes N de M, conclusão, contagens e avisos por fonte; avisos precisam ser conferidos mesmo se o comando terminar normalmente. O estado é salvo ao concluir cada fonte. **Ctrl+C** durante a coleta preserva as fontes concluídas e aguarda a limpeza de trava e temporários. Vagas reencontradas atualizam a última observação sem buscar detalhes novamente. `open` imprime o endereço local e abre o navegador padrão. Deixe o terminal aberto enquanto usa a página; **Ctrl+C** encerra o servidor. Se o navegador não abrir, copie o endereço impresso.

Na tabela, **inscrevi** registra que você já enviou a candidatura. **Descartar** pede um motivo e salva a decisão. As marcações sobrevivem a fechar a página, reabrir e coletar novamente. O radar não envia candidaturas. Após outra coleta, use **Atualizar vagas** na página.

### Dados e testes

`busca.json` e `estado.json` ficam em `.radar-de-vagas` na pasta pessoal, fora do clone. A variável opcional `RADAR_DATA_DIR` escolhe outra pasta absoluta, também fora do repositório. Para testar sem usar seus dados, antes dos comandos acima:

Mac:

```sh
export RADAR_DATA_DIR="$(mktemp -d)"
```

Windows (PowerShell):

```powershell
$env:RADAR_DATA_DIR = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
```

Dentro da pasta clonada, rode os testes sem rede:

```sh
node --test
```

Validação: passo a passo do Mac conferido em cópia limpa com pasta de dados temporária. **Windows ainda não validado em máquina real.**

## Privacidade

Este repositório não contém dado pessoal de ninguém e não pode conter. Os exemplos são fictícios. Antes de contribuir, leia a seção de privacidade em `CLAUDE.md`.

## Skills no Claude Code e no Codex

As skills de onboarding, triagem com memória, currículo por vaga, entrevista e
acompanhamento estão em `skills/`. O julgamento do produto vive nesses arquivos.
Os exemplos em `examples/perfil.md` e `examples/regua.md` são inteiramente fictícios.
Os comandos das fases F2 a F5 precisam estar disponíveis na versão usada do clone.

### Instalar como plugin do Claude Code

Com Claude Code instalado e autenticado, execute na raiz deste clone:

```sh
claude plugin marketplace add ./
claude plugin install radar-de-vagas@radar-de-vagas-local
claude
```

Na sessão aberta, use `/radar-de-vagas:onboarding`. As demais skills têm o mesmo
prefixo: `triagem`, `curriculo-por-vaga`, `entrevista` e `acompanhamento`.
Continue trabalhando na raiz do clone para os comandos encontrarem `bin/radar.mjs`.
O catálogo local em `.claude-plugin/marketplace.json` permite essa instalação.
Veja a [documentação oficial de marketplaces do Claude Code](https://code.claude.com/docs/en/plugin-marketplaces).

Para carregar diretamente os arquivos do clone durante uma sessão, também pode usar
`claude --plugin-dir .` e os mesmos nomes de skills, conforme a
[documentação oficial de plugins](https://code.claude.com/docs/en/plugins).
**Instalação e uso no Windows não validados.**

### Usar no Codex

Abra este clone como projeto no Codex e peça: "Faça meu onboarding do Radar de Vagas
seguindo skills/onboarding/SKILL.md". O `AGENTS.md` aponta para as mesmas cinco skills.
Para as próximas tarefas, peça "Faça a triagem" ou "Monte o currículo para a vaga
de ID informado", usando o ID real exibido pelo radar. Não precisa duplicar skills.
Esse encaminhamento usa [instruções de projeto em AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
**Uso e agendamento no Windows não validados.**

### Fluxo de uso em cinco passos

1. **Onboarding.** Responda uma pergunta por vez sobre repertório e preferências.
   O agente grava perfil e busca fora do clone e revisa currículo e LinkedIn.
   Você escolhe LinkedIn, teto de triagem, agente e agenda com os riscos explicados.
2. **Coleta.** Rode `node bin/radar.mjs collect`. A coleta funciona sem agente.
   Confira os avisos das fontes e substitua empresas fictícias antes de acompanhar empresas.
3. **Triagem.** Peça a skill de triagem ao agente. Ela lê cada descrição inteira,
   grava estrelas, motivo e alertas e atualiza a régua com os motivos dos descartes.
   O teto padrão é 30 vagas por rodada; as demais ficam na fila, sem descarte automático.
   Com `agente` configurado como `claude` ou `codex` em `busca.json`, também pode usar
   `node bin/radar.mjs triage-run`. Sem esse campo, o comando só explica como ligar.
4. **Página.** Rode `node bin/radar.mjs open` para comparar vagas no navegador.
   Quem decide é você. Descartar exige seu motivo; a memória avisa em vagas parecidas.
5. **Candidatura e entrevista.** Peça o currículo pelo ID, revise o HTML e salve como
   PDF pelo navegador. Envie a candidatura por conta própria e marque **inscrevi** na página.
   Conte novidades ao agente para atualizar etapa e próximo passo. Quando tiver entrevista,
   informe o ID para registrar a conversa e receber a página única de preparo.
   Currículo e munição usam somente fatos do perfil; lacunas viram perguntas.

O onboarding pode ligar `node bin/radar.mjs schedule on --hours 6`, que agenda coleta
seguida de `triage-run`. Para conferir, use `node bin/radar.mjs schedule status`;
para voltar ao modo manual, `node bin/radar.mjs schedule off`.
Máquina desligada não executa a agenda. O agente precisa estar instalado e autenticado;
cada julgamento consome sua assinatura ou cota. **Agendamento no Windows não validado.**

`node bin/radar.mjs paths` informa os caminhos de perfil, busca, régua, currículos e
entrevistas. Esses documentos são escritos nesses caminhos, pois não há comandos de
edição de documentos no contrato. O estado das vagas é acessado apenas pelos comandos;
nenhuma skill edita `estado.json`. `track` atualiza acompanhamento, sem marcar inscrevi
ou descartar, ações que continuam na página. Campos omitidos são preservados atomicamente;
`--clear-next` limpa o próximo passo e `--clear-notes` limpa as notas. Não combine uma
opção de limpeza com o texto do mesmo campo. Valores iniciados por `--` são aceitos
como argumento literal ou com `=`, por exemplo `--reason="--home office"`.
O ID permanece visível na linha da vaga, com botão **Copiar ID**, inclusive após inscrevi.

Ao ligar a agenda, o radar valida Node e o agente configurado, guarda um PATH com
as pastas dos executáveis e preserva `RADAR_DATA_DIR` quando definida. Uma rodada
ainda ativa faz a próxima sair sem coletar nem triar, registrando o motivo no log.
Travas de processos encerrados são recuperadas; uma trava sem PID válido só é
recuperada após 30 segundos. `agendamento.log` é reduzido à parte final de cerca
de 256 KiB quando ultrapassa 1 MiB, sem criar arquivos de rotação.
