/** The support inbox (`/support`) and one conversation (`/support/[id]`). */
export const support = {
  title: 'Support',
  // Shown in place of the customer's name when the account has none.
  customerFallback: 'Client',
  status: {
    resolved: 'Résolue',
    awaitingTeam: 'Réponse attendue',
    answered: 'Répondue',
  },

  // ── /support: the inbox ───────────────────────────────────────────────────
  list: {
    description: 'Conversations transmises de l’assistant à l’équipe. Votre réponse arrive dans l’application du client.',
    tabs: {
      escalated: 'À traiter',
      closed: 'Résolues',
      all: 'Toutes',
    },
    // Who wrote the last message, before its preview: « Client : Bonjour… ».
    roles: {
      user: 'Client',
      assistant: 'Assistant',
      agent: 'Équipe',
    },
    preview: '{role} : {preview}',
    columns: {
      customer: 'Client',
      lastMessage: 'Dernier message',
      activity: 'Activité',
      status: 'Statut',
    },
    noMessage: 'Aucun message pour l’instant',
    kpi: {
      waiting: 'En attente de l’équipe',
      waitingHint: 'Conversations à traiter',
      resolved: 'Résolues · 30 j',
      resolvedHint: '{count} transmises à l’équipe sur la période',
      resolutionTime: 'Délai moyen de résolution',
      resolutionTimeHint: 'De la demande d’un humain à la résolution',
      assistant: 'Réglées par l’assistant · 30 j',
      assistantHint: '{conversations} conversations, {messages} messages de clients',
    },
    empty: {
      escalatedTitle: 'Aucune conversation en attente',
      escalatedBody: 'Quand un client demande à parler à l’équipe, sa conversation apparaît ici.',
      title: 'Aucune conversation',
      body: 'Aucune conversation ne correspond à ce filtre.',
    },
  },

  // ── /support/[id]: one conversation ───────────────────────────────────────
  detail: {
    notFound: 'Conversation introuvable',
    escalatedOn: 'Transmise à l’équipe le {date}',
    resolvedOn: 'Résolue le {date}',
    resolvedOnBy: 'Résolue le {date} par {name}',
    resolve: 'Résoudre',
    thread: 'Conversation',
    noMessages: 'Le client a demandé l’équipe avant d’écrire. Vous pouvez lui écrire en premier.',
    replyTo: 'Répondre à {name}',
    replyPlaceholder: 'Votre réponse — le client la reçoit dans l’application, avec une notification.',
    sending: 'Envoi…',
    readOnly: 'Lecture seule — votre rôle ne permet pas de répondre au support.',
    closedNote: 'Conversation résolue. Si le client écrit de nouveau, une nouvelle conversation commence.',
    customer: 'Client',
    recentOrders: 'Commandes récentes',
    noOrders: 'Aucune commande.',
    authors: {
      assistant: 'Assistant IA',
      team: 'Équipe Sougouba',
      system: 'Système',
    },
    toasts: {
      replySent: 'Réponse envoyée.',
      replyFailed: 'Envoi impossible.',
      resolved: 'Conversation résolue.',
      resolveFailed: 'Action impossible.',
    },
    confirm: {
      title: 'Résoudre cette conversation ?',
      description:
        'Elle quitte la liste « À traiter ». Si le client écrit de nouveau, une nouvelle conversation commence avec l’assistant.',
    },
  },
};
