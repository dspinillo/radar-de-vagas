# Radar de Vagas · Contexto (linguagem ubíqua)

> O vocabulário do projeto: os termos que o código, os documentos e as conversas usam. Um termo por linha; a palavra exata do código em `monospace`.

## Termos do domínio

| Termo | Significa | No código |
|---|---|---|
| Vaga | Um anúncio de emprego no formato único do radar | `job` |
| Fonte | Um portal ou sistema de recrutamento de onde vêm vagas | `source` |
| Fonte por termo | Fonte em que se busca por palavras (Gupy, LinkedIn) | `kind: "search"` |
| Fonte por empresa | Fonte em que se lista as vagas de uma empresa (Greenhouse, InHire) | `kind: "company"` |
| Coleta | Rodar as fontes e gravar as vagas novas. Não usa agente | `collect` |
| Triagem | O agente ler a vaga inteira e dar encaixe, motivo e alertas | `triage` |
| Encaixe | Nota de 1 a 5 estrelas da vaga contra o perfil | `fit` |
| Motivo | Texto curto que explica o encaixe | `reason` |
| Alerta | Aviso destacado na vaga (idioma, tecnologia, modelo, faixa) | `alerts` |
| Ponto de atenção | Item da régua nascido de um descarte, que gera alertas futuros | `watchpoint` |
| Perfil | Quem a pessoa é: casos, entregas, currículo | `perfil.md` |
| Busca | O que a pessoa procura: termos, nível, local, modelo, idiomas, faixa | `busca.json` |
| Régua | A lista de pontos de atenção | `regua.md` |
| Estado | Vagas, triagens, marcações e acompanhamento | `estado.json` |
| Pasta de dados | Diretório externo ao repositório com os arquivos da pessoa; pode ser sobreposto nos testes | `dataDir`, `RADAR_DATA_DIR` |
| Identidade alternativa | Identificador de outra fonte que aponta para a chave estável de uma vaga fundida | `aliases` |
| Outros anúncios | Identidades e links observados na fusão de uma vaga, preservando o anúncio original | `seen.alsoAt` |
| Marcação | Decisão da pessoa sobre uma vaga: inscrevi ou descartar | `status` |
| Inscrevi | Marcação de que a pessoa enviou a candidatura | `status: "applied"` |
| Descartar | Marcação acompanhada de motivo escrito pela pessoa | `status: "discarded"` |
| Motivo do descarte | O que a pessoa escreveu ao descartar | `cutReason` |
| Possível duplicata | Vagas de fontes diferentes com empresa e título parecidos. É só um aviso; fusão exige o mesmo link de inscrição | `dedupKey` |
| Radar | A página local com a tabela de vagas | `src/page/` |
| Acompanhamento | A parte do radar com as vagas em que a pessoa se inscreveu e o andamento de cada processo | `tracking` |
| Etapa | Fase atual de um processo seletivo | `tracking.stage` |
| Notas | Histórico registrado no acompanhamento | `tracking.notes` |
| Identificador | Chave estável exibida e copiável na linha da vaga | `id` |
| Agenda | Coleta seguida de triagem no horário configurado | `schedule`, `scheduledRun` |
| Trava da agenda | PID que impede rodadas agendadas simultâneas | `agendamento.lock` |
| Próximo passo | O que a pessoa precisa fazer numa candidatura | `next` |
| Entrega | Um resultado concreto do histórico da pessoa, com contexto e número quando houver. É a matéria-prima do currículo e da munição | `perfil.md` |
| Currículo base | O currículo que a pessoa trouxe no onboarding | `perfil.md` |
| Currículo por vaga | Versão do currículo base ajustada a uma vaga, só com entregas do perfil | `curriculos/` |
| Munição de entrevista | Página única de preparo para uma entrevista específica | `entrevistas/` |

## Não confundir

- **Coleta ≠ triagem.** A coleta traz, a triagem julga. A coleta roda sem agente.
- **Alerta ≠ corte.** Um alerta avisa. O radar nunca remove uma vaga por regra aprendida.
- **Motivo ≠ motivo do descarte.** O primeiro é do agente, o segundo é da pessoa.

## Fora do vocabulário (evite)

- "Filtro" para o que a régua faz. A régua alerta, não filtra.
- "Candidatura automática". O radar não envia nada.
- "Gerar currículo". O currículo por vaga é montado a partir do perfil, não gerado do nada.
