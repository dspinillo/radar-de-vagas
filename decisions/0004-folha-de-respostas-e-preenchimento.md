# 0004 - Folha de respostas e preenchimento assistido

Data: 2026-10-21

## Contexto

O Radar parava no currículo por vaga. Na prática, o trabalho que sobra para a pessoa é o formulário: personalização da Gupy, habilidades sugeridas, perguntas abertas e um cadastro que repete os mesmos dados a cada empresa. O mantenedor quer o fluxo completo para passar o Radar a quem não é técnico.

## Decisão

- **Duas skills, sem código novo além de caminhos.** `candidatura` gera a folha de respostas em markdown e funciona em qualquer agente, sem navegador. `preencher-formulario` é experimental, opcional e depende do Claude in Chrome.
- **Dados de candidatura em arquivo próprio** (`candidatura.md` na pasta de dados), separado do perfil. O perfil alimenta documentos que vão para o recrutador; os dados de candidatura (pretensão, último pacote, declarações, endereço, nomes dos pais) só vão para o formulário. `paths` devolve `application` e `answerSheets`.
- **Nunca CPF, RG, número de documento nem senha**, nem no arquivo, nem digitado pelo agente. Login e criação de conta são da pessoa.
- **O agente não responde pela pessoa** o que ela não respondeu: autoavaliação, motivação e declarações viram pergunta. Pergunta em aberto bloqueia o envio.
- **O preenchimento para antes do enviar**, salvo ordem expressa da pessoa para aquela vaga na conversa. O princípio de produto passa a dizer isso: quem decide é sempre a pessoa; quem envia é ela, ou o agente por ordem expressa dela para aquela vaga.
- **Receitas por portal são conhecimento de portal**, escritas de forma genérica. Nada de dado pessoal nem de empresa onde alguém se candidatou.

## Consequências

- A folha de respostas é o plano B permanente: quando o portal mudar e o preenchimento quebrar, a pessoa cola os textos.
- O preenchimento é a parte mais cara em tokens e a mais frágil; o README avisa.
- Validar o preenchimento exige formulário real com a pessoa ao lado; teste automático não cobre.
