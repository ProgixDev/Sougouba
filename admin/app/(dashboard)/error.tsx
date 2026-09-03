'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';

/**
 * The last line of defence for the back office.
 *
 * Individual pages catch their own fetch failures and fall back to their empty
 * or not-found states — this exists for what those cannot catch: an error
 * thrown during render, or one raised outside a handled promise.
 *
 * It matters more than it did. While every screen read from localStorage
 * nothing here could realistically throw, so the app shipped with no boundary
 * at all and a failure would have unmounted the whole dashboard to a blank
 * page. Now that the data arrives over HTTP, an unreachable API is an ordinary
 * Tuesday.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Nothing is wired to a reporter yet; the console is at least somewhere a
    // developer will look, and the digest is what correlates a production
    // stack trace with this render.
    console.error('[admin] unhandled error', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Card className="flex flex-col items-start gap-4 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle size={19} />
        </div>
        <div>
          <Text as="h1" variant="title">
            Cette page n&apos;a pas pu être chargée
          </Text>
          <Text variant="body" tone="muted" className="mt-1">
            Vérifiez que l&apos;API est démarrée, puis réessayez. Si le problème persiste, la console du navigateur
            contient le détail de l&apos;erreur.
          </Text>
        </div>
        {/* `reset` re-renders the segment rather than reloading the page, so a
            transient failure recovers without losing the session. */}
        <Button variant="primary" onClick={reset}>
          Réessayer
        </Button>
      </Card>
    </div>
  );
}
