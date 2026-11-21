'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { useToast } from '@/components/Toast';
import { createSpecialty, listSpecialties, updateSpecialty, type AdminSpecialty } from '@/lib/api/specialties';

const LISTS: { type: AdminSpecialty['vendorType']; title: string; hint: string }[] = [
  { type: 'grocery', title: 'Épiceries', hint: 'Le type de commerce : épicerie africaine, boucherie halal…' },
  { type: 'restaurant', title: 'Restaurants', hint: 'La cuisine servie : sénégalaise, éthiopienne…' },
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
        toast('error', error instanceof Error ? error.message : 'Chargement impossible.');
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
      <div>
        <Text as="h1" variant="display">
          Spécialités
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          La liste proposée aux commerçants à l’inscription — la ligne sous le nom de leur boutique. Une spécialité retirée
          n’est plus proposée, mais les boutiques qui l’ont choisie la gardent.
        </Text>
      </div>

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
      toast('error', error instanceof Error ? error.message : 'Action impossible.');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run('new', () => createSpecialty({ vendorType: type, nameFr: nameFr.trim(), nameEn: nameEn.trim() }), `« ${nameFr.trim()} » ajoutée.`);
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
    const ok = await run(row.id, () => updateSpecialty(row.id, patch), 'Spécialité renommée.');
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
              Aucune spécialité.
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
                  aria-label="Nom en français"
                  onChange={(e) => setEditing({ ...editing, nameFr: e.target.value })}
                />
                <input
                  className={INPUT}
                  value={editing.nameEn}
                  maxLength={40}
                  aria-label="Nom en anglais"
                  onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })}
                />
                {row.vendorCount > 0 && editing.nameFr.trim() !== row.nameFr && (
                  <Text variant="caption" tone="accent">
                    Le nouveau nom s’affichera sur {row.vendorCount} boutique{row.vendorCount > 1 ? 's' : ''}.
                  </Text>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(row)} disabled={busyId === row.id}>
                    Enregistrer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Text variant="body" className={`font-semibold ${row.isActive ? '' : 'text-muted-foreground line-through'}`}>
                      {row.nameFr}
                    </Text>
                    {!row.isActive && <Badge tone="neutral">Retirée</Badge>}
                  </div>
                  <Text variant="caption" tone="muted">
                    {row.nameEn} · {row.vendorCount} boutique{row.vendorCount > 1 ? 's' : ''}
                  </Text>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton label="Monter" disabled={index === 0 || busyId !== null} onClick={() => move(index, -1)}>
                    <ArrowUp size={15} />
                  </IconButton>
                  <IconButton label="Descendre" disabled={index === rows.length - 1 || busyId !== null} onClick={() => move(index, 1)}>
                    <ArrowDown size={15} />
                  </IconButton>
                  <IconButton label="Renommer" disabled={busyId !== null} onClick={() => setEditing({ id: row.id, nameFr: row.nameFr, nameEn: row.nameEn })}>
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
                        row.isActive ? `« ${row.nameFr} » retirée.` : `« ${row.nameFr} » réactivée.`
                      )
                    }
                  >
                    {row.isActive ? 'Retirer' : 'Réactiver'}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-auto flex flex-col gap-2 border-t border-border bg-muted/40 p-5">
        <Text variant="label">Ajouter</Text>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className={INPUT} required minLength={2} maxLength={40} placeholder="Nom en français" value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
          <input className={INPUT} required minLength={2} maxLength={40} placeholder="Nom en anglais" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </div>
        <Button type="submit" size="sm" className="self-start" disabled={busyId !== null}>
          <Plus size={15} /> Ajouter
        </Button>
      </form>
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
