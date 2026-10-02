# Radar de Vagas · Lições

> Conhecimento que viaja com o repositório: erros que custaram caro, padrões que funcionaram, armadilhas do ambiente. Formato: **o que aconteceu → por quê → como evitar**. As lições abaixo vêm de um mês de uso da versão pessoal que deu origem a este projeto.

## Armadilhas (o que quebrou)

- **Descrição truncada escondeu requisito de idioma.** Um corte em 4.000 caracteres deixou de fora o "inglês avançado ou fluente" de três vagas, porque requisitos costumam vir no fim do anúncio → guardar e julgar a descrição inteira.
- **Filtro de título escondeu vagas boas.** Excluir qualquer título com "comercial" derrubou vagas de planejamento e inteligência comercial → excluir por título só o que é inequívoco e preferir alerta a exclusão.
- **Republicar o radar apagou marcações.** Gerar a página de novo sem ler o estado atual sobrescreveu o que a pessoa tinha marcado → a coleta só adiciona vagas com identificador inexistente e nunca altera marcação.
- **Alerta por e-mail dos portais rende pouco.** Cerca de uma vaga por dia, com encaixe fraco → a busca ativa é a fonte principal.

- **Limpeza de HTML que apagava a descrição.** Duas versões seguidas de `stripHtml` passavam em todos os testes do autor e perdiam texto em HTML malformado: uma aspa ou um `<script>` sem fechamento engolia o resto do anúncio → a regra é "na dúvida, preserva o texto", com teste de propriedade em entradas malformadas e comparação com um parser de navegador.
- **Guarda de privacidade que lia o disco.** A checagem olhava o arquivo do disco e não o que estava preparado para commit, e pulava em silêncio arquivos com acento no nome → ler sempre do índice do git, inclusive as exceções, e tratar leitura que falha como erro.
- **Limite de tempo justo em teste.** Um teto de 200 ms falhava à toa com a máquina ocupada → teste de desempenho usa limite folgado, que só pega a diferença entre linear e quadrático.

## Padrões que funcionaram

- **Tester independente do autor.** Nas duas primeiras tarefas, os testes de quem escreveu passavam e o ataque de outro agente achou as falhas que importavam.

- **Alerta em vez de corte.** A mesma exigência que elimina uma vaga mediana é aceitável numa vaga excepcional. Quem pesa isso é a pessoa.
- **Motivo de descarte escrito pela pessoa.** Calibra melhor do que qualquer inferência a partir dos cliques.
- **Página de fonte por empresa ganha de agregador.** Traz a descrição completa e o link direto de inscrição, então tem prioridade na deduplicação.
- **Vaga fresca converte mais.** Ordenar por data de publicação e mostrar a idade da vaga.
- **Olhar a pergunta de pretensão salarial antes de investir tempo.** Faixa incompatível só aparece no formulário.

## Referências estudadas

- **Moonlighter (AGPL-3.0).** Projeto parecido, em Python, que varre páginas de vagas por empresa, pontua contra o perfil e monta uma folha de respostas. Ele preenchia formulários no navegador e abandonou isso: dependia de marcação de formulário, captcha e regras de plataforma fora do controle dele. Lição para a F7: a folha de respostas vem antes do preenchimento, e o preenchimento só entra se sobreviver a esses três problemas. Licença AGPL: estudar as ideias, não copiar código.

## Ambiente / ferramentas

- **LinkedIn sem login.** Responde, mas limita por volume: manter cerca de um segundo entre chamadas.
- **Teste sem rede não mostra custo de volume.** A coleta passava em todos os testes e levava minutos em silêncio com a busca de exemplo, porque um termo comum devolve centenas de vagas e cada uma pede uma busca de detalhe. Rodar a coleta real antes de fechar a tarefa.
- **Quadro de vagas vazio responde 200.** Greenhouse e Lever devolvem lista vazia para empresa sem vaga aberta. Zero vagas não prova que a fonte quebrou nem que o identificador da empresa está errado.
- **Julgamento vai em skill, não em código.** Onboarding, triagem, currículo e entrevista são instruções em markdown; o código só lê e grava o estado por comandos. As fases F2 a F5 custaram cerca de 400 linhas de código e 240 de skill.
- **Agente em modo não interativo precisa de permissão explícita.** Sem liberar os comandos do radar e a pasta de dados, a triagem agendada roda e não grava nada, sem erro visível.
- **Esforço máximo do agente não compensa na triagem.** Quatro vagas em 8 minutos no máximo contra 3 vagas em 71 segundos no médio. Vaga fraca não merece seis alertas.
- **Tester independente em sessão nova paga o custo.** Na F1 ele achou dez falhas que os testes de quem escreveu não pegavam, três delas graves nas fontes (paginação, falso bloqueio, descrição truncada).
- **Indeed, Glassdoor e Jooble.** Bloqueiam acesso automatizado (403). Ficam fora.
