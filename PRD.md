# Radar de Vagas · PRD

> Atualizado em **2026-10-01**. Fontes vivas: `ROADMAP.md` (o que vem) · `STATUS.md` (onde paramos) · `decisions/` (porquês).

## 1. Visão

Um radar pessoal de vagas que roda na máquina de quem procura emprego. Um agente entrevista a pessoa, guarda o repertório dela, varre vários portais, ranqueia cada vaga contra esse repertório e aprende com os descartes.

## 2. Princípios de produto (inegociáveis)

1. **Ranquear e orientar, nunca decidir.** O radar dá estrelas, motivo e alertas. Não se candidata sozinho e não esconde vaga por conta própria.
2. **Os dados ficam com a pessoa.** Perfil, currículo, régua e histórico vivem fora do repositório, na máquina dela. Nada é enviado a serviço nosso, porque não existe serviço nosso.
3. **Descarte vira alerta, não corte.** O motivo de um descarte vira ponto de atenção nas vagas futuras. A decisão continua sendo da pessoa.
4. **Ler a vaga inteira.** O julgamento nunca é feito sobre descrição truncada. Requisito de idioma e de tecnologia costuma estar no fim do anúncio.
5. **A última ação é sempre humana.** No preenchimento assistido, o agente para antes do enviar.

## 3. Usuário-alvo

Quem está procurando emprego no Brasil e já usa Claude Code ou Codex. Sabe clonar um repositório e rodar um comando. Usa Mac ou Windows.

## 4. Job-to-be-done

> "Quando estou procurando emprego, quero ver num lugar só as vagas novas que fazem sentido para mim, já com o que pesa a favor e contra, para gastar meu tempo me candidatando e não garimpando."

## 5. Escopo

### 5.1 Implementado

Nada ainda.

### 5.2 Planejado

| Área | Funcionalidade | Fase |
|---|---|---|
| Onboarding | Entrevista: LinkedIn, currículo, casos e entregas, localidade, modelo (remoto, híbrido, presencial), idiomas, faixa salarial por regime (CLT e PJ) | F2 |
| Onboarding | Revisão do currículo e do LinkedIn, com pontos fortes e ajustes | F2 |
| Coleta | Varredura por termo e por empresa em várias fontes, com deduplicação | F1, F6 |
| Triagem | Estrelas de 1 a 5, motivo e alertas por vaga | F2 |
| Radar | Página local em tabela, com inscrevi e descartar com motivo | F1 |
| Memória | Motivos de descarte viram pontos de atenção nas próximas vagas | F3 |
| Agendamento | Rodar em intervalo definido pela pessoa, em Mac e Windows, ou só manualmente | F4 |
| Candidatura | Preenchimento assistido do formulário, parando antes do enviar | F7 |

### 5.3 Fora de escopo (não-objetivos)

- Candidatura automática.
- Serviço hospedado, conta de usuário ou banco de dados central.
- Fontes que exigem login ou que bloqueiam acesso automatizado.
- Corte automático de vaga por regra aprendida.

## 6. Métricas de sucesso

- Uma pessoa de fora instala e vê o primeiro radar em menos de dez minutos.
- A pessoa abre o radar no lugar dos portais, e não além deles.
- Alertas de memória acertam: a pessoa não precisa escrever o mesmo motivo duas vezes.

## 7. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Fonte muda ou bloqueia o acesso sem aviso | Uma fonte por arquivo, falha isolada e visível na página. LinkedIn opcional. |
| Dado pessoal acaba no repositório | Dados fora da pasta clonada, exemplos fictícios e checagem automática antes de cada commit. |
| Triagem agendada consome a assinatura da pessoa | Coleta sem agente, teto de vagas julgadas por rodada. |
| Ninguém testa no Windows | Teste em Windows é critério da F4 e da F5. |
| Código de terceiros com licença incompatível | Projetos AGPL servem só para estudo de ideias. |
