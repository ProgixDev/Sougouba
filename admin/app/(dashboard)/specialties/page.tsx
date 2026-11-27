'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Archive, ChefHat, Pencil, Plus, ShoppingBasket, Store, Tags } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { useToast } from '@/components/Toast';
import { createSpecialty, listSpecialties, updateSpecialty, type AdminSpecialty } from '@/lib/api/specialties';
import { locale, pick, t } from '@/lib/i18n';
import { useAdmin } from '@/lib/permissions';
import { KpiCard, KpiGrid, PageHeader } from '@/components/insights/Insights';

const LISTS: { type: AdminSpecialty['vendorType']; title: string; hint: string }[] = [
  { type: 'grocery', title: t('specialties.lists.groceryTitle'), hint: t('specialties.lists.groceryHint') },
  { type: 'restaurant', title: t('specialties.lists.restaurantTitle'), hint: t('specialties.lists.restaurantHint') },
];

const INPUT =
  'w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-[0.875rem] text-foreground outline-none focus:border-forest-600';

/**
 * The shop specialties list (`specialties`, migration `0033`): what a merchant
 * picks at registration as the line under their shop's name.
 *
 * Entries are retired, never deleted — a shop that chose one keeps it. A French
 * rename reaches every shop using the entry, which is why each row says how
 * many that is before anyone edits it. Every change lands in the audit log.
 */
export default function SpecialtiesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminSpecialty[] | null>(null);

  useEffect(() => {
    listSpecialties()
      .then(setRows)
      .catch((error: unknown) => {
        setRows([]);
        toast('error', error instanceof Error ? error.message : t('common.errors.loadFailed'));
      });
  }, [toast]);

  /** Swap in the API's answer — it carries the recomputed shop count. */
  function replace(updated: AdminSpecialty) {
    setRows((current) => {
      const list = current ?? [];
      return list.some((r) => r.id === updated.id) ? list.map((r) => (r.id === updated.id ? updated : r)) : [...list, updated];
    });
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Tags}
        title={t('specialties.title')}
        description={t('specialties.description')}
      />

      <KpiGrid>
        <KpiCard
          loading={rows === null}
          icon={ShoppingBasket}
          label={t('specialties.kpi.groceryActive')}
          value={String(rows?.filter((r) => r.vendorType === 'grocery' && r.isActive).length ?? 0)}
          hint={t('specialties.kpi.groceryActiveHint')}
        />
        <KpiCard
          loading={rows === null}
          icon={ChefHat}
          tone="mustard"
          label={t('specialties.kpi.restaurantActive')}
          value={String(rows?.filter((r) => r.vendorType === 'restaurant' && r.isActive).length ?? 0)}
          hint={t('specialties.kpi.restaurantActiveHint')}
        />
        <KpiCard
          loading={rows === null}
          icon={Store}
          tone="forest"
          label={t('specialties.kpi.shopsClassified')}
          value={String(rows?.reduce((s, r) => s + r.vendorCount, 0) ?? 0)}
          hint={t('specialties.kpi.shopsClassifiedHint')}
        />
        <KpiCard
          loading={rows === null}
          icon={Archive}
          tone="neutral"
          label={t('specialties.kpi.retired')}
          value={String(rows?.filter((r) => !r.isActive).length ?? 0)}
          hint={t('specialties.kpi.retiredHint')}
        />
      </KpiGrid>

      {rows === null ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-96 rounded-card" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {LISTS.map((list) => (
            <SpecialtyList
              key={list.type}
              title={list.title}
              hint={list.hint}
              type={list.type}
              rows={rows.filter((r) => r.vendorType === list.type).sort((a, b) => a.position - b.position)}
              onChanged={replace}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SpecialtyList({
  title,
  hint,
  type,
  rows,
  onChanged,
}: {
  title: string;
  hint: string;
  type: AdminSpecialty['vendorType'];
  rows: AdminSpecialty[];
  onChanged: (row: AdminSpecialty) => void;
}) {
  const toast = useToast();
  const { can } = useAdmin();
  const manage = can('specialties.manage');
  const [nameFr, setNameFr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; nameFr: string; nameEn: string } | null>(null);

  async function run(id: string, action: () => Promise<AdminSpecialty>, done?: string) {
    setBusyId(id);
    try {
      onChanged(await action());
      if (done) toast('success', done);
      return true;
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('specialties.actionFailed'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run('new', () => createSpecialty({ vendorType: type, nameFr: nameFr.trim(), nameEn: nameEn.trim() }), t('specialties.toast.added', { name: pick(nameFr.trim(), nameEn.trim()) }));
    if (ok) {
      setNameFr('');
      setNameEn('');
    }
  }

  async function saveEdit(row: AdminSpecialty) {
    if (!editing) return;
    const patch: Parameters<typeof updateSpecialty>[1] = {};
    if (editing.nameFr.trim() !== row.nameFr) patch.nameFr = editing.nameFr.trim();
    if (editing.nameEn.trim() !== row.nameEn) patch.nameEn = editing.nameEn.trim();
    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }
    const ok = await run(row.id, () => updateSpecialty(row.id, patch), t('specialties.toast.renamed'));
    if (ok) setEditing(null);
  }

  /** Swaps positions with the neighbour — two saves, each audited. */
  async function move(index: number, direction: -1 | 1) {
    const a = rows[index];
    const b = rows[index + direction];
    if (!a || !b) return;
    const [aPos, bPos] = a.position === b.position ? [b.position + direction, a.position] : [b.position, a.position];
    if (await run(a.id, () => updateSpecialty(a.id, { position: aPos }))) {
      await run(b.id, () => updateSpecialty(b.id, { position: bPos }));
    }
  }

  return (
    <Card elevated className="flex flex-col">
      <div className="border-b border-border p-5">
        <Text variant="subtitle">{title}</Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </div>

      <ul className="flex flex-col">
        {rows.length === 0 && (
          <li className="p-5">
            <Text variant="body" tone="muted">
              {t('specialties.list.empty')}
            </Text>
          </li>
        )}
        {rows.map((row, index) => (
          <li key={row.id} className="flex flex-col gap-2 border-b border-border px-5 py-3 last:border-0">
            {editing?.id === row.id ? (
              <div className="flex flex-col gap-2">
                <input
                  className={INPUT}
                  value={editing.nameFr}
                  maxLength={40}
                  aria-label={t('specialties.list.nameFr')}
                  onChange={(e) => setEditing({ ...editing, nameFr: e.target.value })}
                />
                <input
                  className={INPUT}
                  value={editing.nameEn}
                  maxLength={40}
                  aria-label={t('specialties.list.nameEn')}
                  onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })}
                />
                {row.vendorCount > 0 && editing.nameFr.trim() !== row.nameFr && (
                  <Text variant="caption" tone="accent">
                    {t('specialties.list.renameReach', { count: row.vendorCount })}
                  </Text>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(row)} disabled={busyId === row.id}>
                    {t('common.actions.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {t('common.actions.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Text variant="body" className={`font-semibold ${row.isActive ? '' : 'text-muted-foreground line-through'}`}>
                      {pick(row.nameFr, row.nameEn)}
                    </Text>
                    {!row.isActive && <Badge tone="neutral">{t('specialties.list.retiredBadge')}</Badge>}
                  </div>
                  <Text variant="caption" tone="muted">
                    {locale === 'en' ? row.nameFr : row.nameEn} · {t('specialties.list.shopCount', { count: row.vendorCount })}
                  </Text>
                </div>
                {manage && (
                <div className="flex items-center gap-1">
                  <IconButton label={t('specialties.list.moveUp')} disabled={index === 0 || busyId !== null} onClick={() => move(index, -1)}>
                    <ArrowUp size={15} />
                  </IconButton>
                  <IconButton label={t('specialties.list.moveDown')} disabled={index === rows.length - 1 || busyId !== null} onClick={() => move(index, 1)}>
                    <ArrowDown size={15} />
                  </IconButton>
                  <IconButton label={t('specialties.list.rename')} disabled={busyId !== null} onClick={() => setEditing({ id: row.id, nameFr: row.nameFr, nameEn: row.nameEn })}>
                    <Pencil size={15} />
                  </IconButton>
                  <Button
                    size="sm"
                    variant={row.isActive ? 'ghost' : 'outline'}
                    disabled={busyId !== null}
                    onClick={() =>
                      run(
                        row.id,
                        () => updateSpecialty(row.id, { isActive: !row.isActive }),
                        row.isActive
                          ? t('specialties.toast.retired', { name: pick(row.nameFr, row.nameEn) })
                          : t('specialties.toast.reactivated', { name: pick(row.nameFr, row.nameEn) })
                      )
                    }
                  >
                    {row.isActive ? t('specialties.list.retire') : t('specialties.list.reactivate')}
                  </Button>
                </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {manage && (
      <form onSubmit={add} className="mt-auto flex flex-col gap-2 border-t border-border bg-muted/40 p-5">
        <Text variant="label">{t('common.actions.add')}</Text>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className={INPUT} required minLength={2} maxLength={40} placeholder={t('specialties.list.nameFr')} value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
          <input className={INPUT} required minLength={2} maxLength={40} placeholder={t('specialties.list.nameEn')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </div>
        <Button type="submit" size="sm" className="self-start" disabled={busyId !== null}>
          <Plus size={15} /> {t('common.actions.add')}
        </Button>
      </form>
      )}
    </Card>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
