'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Mail, Send, Sparkles, UserRound } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { StatusBadge } from '@/components/data/StatusBadge';
import { getSupportConversation, replySupport, resolveSupport, type SupportConversationDetail } from '@/lib/api/support';
import { orderStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

/**
 * One conversation: the whole thread — the assistant's answers included, so
 * the team sees what the customer was already told — the customer's latest
 * orders beside it, and the reply box.
 *
 * A reply lands in the customer's conversation and pushes them. "Résoudre"
 * closes it; a later message from the customer starts a new conversation.
 */
export default function SupportConversationPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [conversation, setConversation] = useState<SupportConversationDetail | null | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);

  const load = useCallback(() => {
    getSupportConversation(id)
      .then(setConversation)
      .catch(() => setConversation(null));
  }, [id]);

  useEffect(load, [load]);

  if (conversation === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    );
  }
  if (conversation === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">Conversation introuvable</Text>
      </div>
    );
  }

  const open = conversation.status === 'escalated';
  const name = conversation.customer.fullName ?? 'Client';

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      setConversation(await replySupport(id, content));
      setDraft('');
      toast('success', 'Réponse envoyée.');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Envoi impossible.');
      load();
    }
    setBusy(false);
  }

  async function resolve() {
    setBusy(true);
    try {
      setConversation(await resolveSupport(id));
      toast('success', 'Conversation résolue.');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Action impossible.');
      load();
    }
    setBusy(false);
    setConfirmResolve(false);
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Support', href: '/support' }, { label: name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Text as="h1" variant="display">
              {name}
            </Text>
            {open ? (
              conversation.awaitingTeam ? (
                <Badge tone="destructive">Réponse attendue</Badge>
              ) : (
                <Badge tone="primary">Répondue</Badge>
              )
            ) : (
              <Badge tone="neutral">Résolue</Badge>
            )}
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {conversation.escalatedAt ? `Transmise à l’équipe le ${formatDateTime(conversation.escalatedAt)}` : ''}
            {conversation.resolvedAt
              ? ` · Résolue le ${formatDateTime(conversation.resolvedAt)}${conversation.resolvedByName ? ` par ${conversation.resolvedByName}` : ''}`
              : ''}
          </Text>
        </div>
        {open && (
          <Button variant="outline" onClick={() => setConfirmResolve(true)} disabled={busy}>
            <CheckCircle2 size={16} /> Résoudre
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col p-5 lg:col-span-2">
          <Text variant="subtitle" className="mb-4">
            Conversation
          </Text>
          <ol className="flex flex-col gap-3">
            {conversation.messages.length === 0 && (
              <Text variant="body" tone="muted">
                Le client a demandé l’équipe avant d’écrire. Vous pouvez lui écrire en premier.
              </Text>
            )}
            {conversation.messages.map((m) => (
              <Message key={m.id} message={m} customerName={name} />
            ))}
          </ol>

          {open ? (
            <form onSubmit={send} className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
              <label htmlFor="reply" className="font-sans text-[0.8125rem] font-semibold">
                Répondre à {name}
              </label>
              <textarea
                id="reply"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Votre réponse — le client la reçoit dans l’application, avec une notification."
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-sans text-[0.875rem] text-foreground outline-none focus:border-forest-600"
              />
              <Button type="submit" className="self-end" disabled={busy || !draft.trim()}>
                <Send size={15} /> {busy ? 'Envoi…' : 'Envoyer'}
              </Button>
            </form>
          ) : (
            <Text variant="caption" tone="muted" className="mt-5 border-t border-border pt-4">
              Conversation résolue. Si le client écrit de nouveau, une nouvelle conversation commence.
            </Text>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              Client
            </Text>
            <div className="flex flex-col gap-2">
              <Link href={`/users/${conversation.customer.id}`} className="font-sans text-[0.875rem] font-semibold text-primary hover:underline">
                {name} →
              </Link>
              {conversation.customerEmail && (
                <a href={`mailto:${conversation.customerEmail}`} className="flex items-center gap-2 font-sans text-[0.8125rem] text-muted-foreground hover:text-foreground">
                  <Mail size={14} /> {conversation.customerEmail}
                </a>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              Commandes récentes
            </Text>
            {conversation.recentOrders.length === 0 ? (
              <Text variant="body" tone="muted">
                Aucune commande.
              </Text>
            ) : (
              <ul className="flex flex-col gap-3">
                {conversation.recentOrders.map((o) => {
                  const meta = orderStatusMeta(o.status as OrderStatus);
                  return (
                    <li key={o.id}>
                      <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 hover:opacity-80">
                        <div>
                          <Text variant="body" className="font-semibold">
                            #{o.id.slice(0, 8)} · {o.vendorName ?? '—'}
                          </Text>
                          <Text variant="caption" tone="muted">
                            {formatDateTime(o.createdAt)} · {formatCad(o.totalCad)}
                          </Text>
                        </div>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmResolve}
        title="Résoudre cette conversation ?"
        description="Elle quitte la liste « À traiter ». Si le client écrit de nouveau, une nouvelle conversation commence avec l’assistant."
        confirmLabel="Résoudre"
        busy={busy}
        onConfirm={resolve}
        onCancel={() => setConfirmResolve(false)}
      />
    </div>
  );
}

function Message({
  message,
  customerName,
}: {
  message: SupportConversationDetail['messages'][number];
  customerName: string;
}) {
  const fromCustomer = message.role === 'user';
  const author =
    message.role === 'user'
      ? customerName
      : message.role === 'assistant'
        ? 'Assistant IA'
        : message.role === 'agent'
          ? (message.authorName ?? 'Équipe Sougouba')
          : 'Système';
  const Icon = message.role === 'assistant' ? Sparkles : UserRound;
  return (
    <li className={`flex ${fromCustomer ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg p-3 ${
          fromCustomer ? 'bg-muted' : message.role === 'agent' ? 'bg-forest-600/10' : 'border border-border bg-card'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <Icon size={13} className="text-muted-foreground" />
            <Text variant="label">{author}</Text>
          </span>
          <Text variant="caption" tone="muted">
            {formatDateTime(message.createdAt)}
          </Text>
        </div>
        <Text variant="body" className="whitespace-pre-wrap">
          {message.content}
        </Text>
      </div>
    </li>
  );
}
