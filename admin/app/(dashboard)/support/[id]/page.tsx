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
import { t, useLocale } from '@/lib/i18n';
import type { OrderStatus } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';

/**
 * One conversation: the whole thread — the assistant's answers included, so
 * the team sees what the customer was already told — the customer's latest
 * orders beside it, and the reply box.
 *
 * A reply lands in the customer's conversation and pushes them. "Résoudre"
 * closes it; a later message from the customer starts a new conversation.
 */
export default function SupportConversationPage() {
  useLocale();
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
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
        <Text variant="title">{t('support.detail.notFound')}</Text>
      </div>
    );
  }

  const open = conversation.status === 'escalated';
  const name = conversation.customer.fullName ?? t('support.customerFallback');

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      setConversation(await replySupport(id, content));
      setDraft('');
      toast('success', t('support.detail.toasts.replySent'));
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('support.detail.toasts.replyFailed'));
      load();
    }
    setBusy(false);
  }

  async function resolve() {
    setBusy(true);
    try {
      setConversation(await resolveSupport(id));
      toast('success', t('support.detail.toasts.resolved'));
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('support.detail.toasts.resolveFailed'));
      load();
    }
    setBusy(false);
    setConfirmResolve(false);
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: t('support.title'), href: '/support' }, { label: name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Text as="h1" variant="display">
              {name}
            </Text>
            {open ? (
              conversation.awaitingTeam ? (
                <Badge tone="destructive">{t('support.status.awaitingTeam')}</Badge>
              ) : (
                <Badge tone="primary">{t('support.status.answered')}</Badge>
              )
            ) : (
              <Badge tone="neutral">{t('support.status.resolved')}</Badge>
            )}
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {conversation.escalatedAt ? t('support.detail.escalatedOn', { date: formatDateTime(conversation.escalatedAt) }) : ''}
            {conversation.resolvedAt
              ? ` · ${
                  conversation.resolvedByName
                    ? t('support.detail.resolvedOnBy', { date: formatDateTime(conversation.resolvedAt), name: conversation.resolvedByName })
                    : t('support.detail.resolvedOn', { date: formatDateTime(conversation.resolvedAt) })
                }`
              : ''}
          </Text>
        </div>
        {open && can('support.reply') && (
          <Button variant="outline" onClick={() => setConfirmResolve(true)} disabled={busy}>
            <CheckCircle2 size={16} /> {t('support.detail.resolve')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col p-5 lg:col-span-2">
          <Text variant="subtitle" className="mb-4">
            {t('support.detail.thread')}
          </Text>
          <ol className="flex flex-col gap-3">
            {conversation.messages.length === 0 && (
              <Text variant="body" tone="muted">
                {t('support.detail.noMessages')}
              </Text>
            )}
            {conversation.messages.map((m) => (
              <Message key={m.id} message={m} customerName={name} />
            ))}
          </ol>

          {open && can('support.reply') ? (
            <form onSubmit={send} className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
              <label htmlFor="reply" className="font-sans text-[0.8125rem] font-semibold">
                {t('support.detail.replyTo', { name })}
              </label>
              <textarea
                id="reply"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t('support.detail.replyPlaceholder')}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-sans text-[0.875rem] text-foreground outline-none focus:border-forest-600"
              />
              <Button type="submit" className="self-end" disabled={busy || !draft.trim()}>
                <Send size={15} /> {busy ? t('support.detail.sending') : t('common.actions.send')}
              </Button>
            </form>
          ) : (
            <Text variant="caption" tone="muted" className="mt-5 border-t border-border pt-4">
              {open
                ? t('support.detail.readOnly')
                : t('support.detail.closedNote')}
            </Text>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              {t('support.detail.customer')}
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
              {t('support.detail.recentOrders')}
            </Text>
            {conversation.recentOrders.length === 0 ? (
              <Text variant="body" tone="muted">
                {t('support.detail.noOrders')}
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
        title={t('support.detail.confirm.title')}
        description={t('support.detail.confirm.description')}
        confirmLabel={t('support.detail.resolve')}
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
  useLocale();
  const fromCustomer = message.role === 'user';
  const author =
    message.role === 'user'
      ? customerName
      : message.role === 'assistant'
        ? t('support.detail.authors.assistant')
        : message.role === 'agent'
          ? (message.authorName ?? t('support.detail.authors.team'))
          : t('support.detail.authors.system');
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
