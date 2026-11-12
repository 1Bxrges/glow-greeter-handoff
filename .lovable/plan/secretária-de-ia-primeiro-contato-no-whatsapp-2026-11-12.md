# Secretária de IA — primeiro contato no WhatsApp

## Objetivo
Quando um lead chega pelo WhatsApp (vindo do tráfego), a IA responde em segundos, faz algumas perguntas de qualificação e depois **para e avisa você** para assumir a conversa. A IA não vende nem agenda.

## Como funciona a conversa (curta, só para aquecer o lead)
1. O lead manda a primeira mensagem (ex.: "Vi o anúncio do labial").
2. **1ª resposta da IA**, em segundos: cumprimenta e faz uma pergunta. Ex.: "Oi! Você está buscando o preenchimento labial? É a primeira vez ou você já fez antes?"
3. O lead responde.
4. **2ª resposta da IA**: comenta com simpatia e faz mais uma pergunta. Ex.: "Que bacana! E o que você está buscando: mais volume, contorno ou hidratação?"
5. Quando o lead responde de novo, a IA **para** e a conversa vai para você com o aviso "Agora é com você". A IA pode mandar uma frase de passagem ("Perfeito, já te passo para nossa especialista"), e você escolhe se quer isso nas configurações.
6. Se o lead pedir preço, quiser falar com uma pessoa ou trouxer uma dúvida médica antes disso, a IA passa para você na hora.

## Painel (a interface)
- **Lista de conversas** com status em cores: "IA atendendo", "Aguardando você", "Você atendendo", "Encerrada".
- **Aviso em destaque** com som e contador quando uma conversa pede você.
- **Tela da conversa** igual ao WhatsApp: mostra as mensagens do lead, da IA (marcadas como IA) e as suas.
- **Resumo do lead** ao lado: procedimento de interesse, se já fez, o que busca, e outras respostas.
- **Botões**: "Assumir conversa" (a IA para), "Devolver para a IA" e campo para você responder pelo próprio painel. Você também pode responder pelo celular.
- **Configurações**: lista de procedimentos, perguntas de qualificação, tom de voz e mensagem de passagem, tudo editável sem código.
- Login para que só a equipe da clínica veja o painel.

## O que você vai precisar
- Um número no WhatsApp Business, conectado pelo assistente do Lovable (a aprovação da Meta pode levar alguns minutos).
- Responder no máximo 24h depois da última mensagem do lead fica livre. Depois desse prazo, o WhatsApp exige mensagens-modelo aprovadas.

## Detalhes técnicos
- Lovable Cloud: login, banco de dados (conversas, mensagens, leads, configurações) e atualização em tempo real do painel.
- Conector do WhatsApp: rota `/api/public/whatsapp/webhook` com verificação de assinatura, caixa de entrada durável `whatsapp_webhook_events`, processamento idempotente e status de entrega.
- IA pelo Lovable AI Gateway, com o histórico completo da conversa. Ela devolve uma resposta estruturada: texto, campos de qualificação extraídos e um sinal de "passar para humano" com o motivo.
- O modo da conversa (`ia`, `aguardando_humano`, `humano`) decide se a IA responde. Mensagens enviadas pelo celular (echoes) também colocam a conversa em modo humano.
- Rotas: `/login`, `/` (lista e conversa) e `/configuracoes`.
