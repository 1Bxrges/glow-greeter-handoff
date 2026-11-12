# Secretária de IA — primeiro contato no WhatsApp

## Objetivo
Quando um lead chega pelo WhatsApp (vindo do tráfego), a IA responde em segundos, faz algumas perguntas de qualificação e depois **para e avisa você** para assumir a conversa. A IA não vende nem agenda.

## Como funciona a conversa
1. Lead manda mensagem (ex.: "Vi o anúncio do preenchimento labial").
2. A IA identifica o procedimento de interesse e cumprimenta.
3. Faz de 2 a 4 perguntas de qualificação, uma por vez, por exemplo:
   - "Você está interessada no preenchimento labial?"
   - "É a primeira vez ou você já fez antes?"
   - "Que resultado você está buscando?"
   - "Tem preferência de dia ou horário para uma avaliação?"
4. Quando já tem as respostas, ou se o lead perguntar preço, pedir para falar com uma pessoa, ou trouxer uma dúvida médica, a IA manda uma mensagem curta ("Perfeito! Já vou te passar para nossa especialista") e **desliga para aquela conversa**.
5. Você recebe o aviso no painel: "Agora é com você".

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
