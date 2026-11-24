'use client';
import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { ImageField, Switch, Toggle } from './fields';
import {
  addSection,
  removeSection,
  renameSection,
  setMyHours,
  updateMyShop,
  uploadShopImage,
  type Shop,
  type ShopHours,
  type ShopPatch,
  type ShopSection,
} from '@/lib/api/merchantCatalog';
import { ApiError } from '@/lib/api/client';
import { failureMessage, parseCount } from '@/lib/merchantForm';

/**
 * The three things a shop owner sets about the shop itself: what customers
 * read about it, when it is open, and the shelves its products are sorted on.
 * Each card saves on its own, so changing the hours never waits on a name.
 */

// ── what customers read ─────────────────────────────────────────────────────

export function ShopInfoCard({ shop, onSaved }: { shop: Shop; onSaved: (shop: Shop) => void }) {
  const toast = useToast();
  const [name, setName] = useState(shop.name);
  const [specialty, setSpecialty] = useState(shop.specialtyFr);
  const [eta, setEta] = useState(String(shop.deliveryEtaMin));
  const [halal, setHalal] = useState(shop.isHalalCertified);
  const [cover, setCover] = useState(shop.coverUrl);
  const [errors, setErrors] = useState<{ name?: string; specialty?: string; eta?: string }>({});
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const minutes = parseCount(eta);
    if (name.trim().length < 2) next.name = 'Nom de la boutique requis';
    if (specialty.trim().length < 3 || specialty.trim().length > 40) next.specialty = 'Entre 3 et 40 caractères';
    if (minutes === null || minutes < 10 || minutes > 180) next.eta = 'Entre 10 et 180 minutes';
    setErrors(next);
    if (Object.keys(next).length > 0 || minutes === null) return;

    // Only what changed: the API refuses an empty patch, and an untouched field has no business being rewritten.
    const patch: ShopPatch = {};
    if (name.trim() !== shop.name) patch.name = name.trim();
    if (specialty.trim() !== shop.specialtyFr) patch.specialtyFr = specialty.trim();
    if (minutes !== shop.deliveryEtaMin) patch.deliveryEtaMin = minutes;
    if (halal !== shop.isHalalCertified) patch.isHalalCertified = halal;
    if (cover !== shop.coverUrl) patch.coverUrl = cover;
    if (Object.keys(patch).length === 0) {
      toast('info', 'Rien à enregistrer');
      return;
    }

    setSaving(true);
    try {
      onSaved(await updateMyShop(patch));
      toast('success', 'Boutique enregistrée');
    } catch (error) {
      toast('error', failureMessage(error, 'Enregistrement impossible. Veuillez réessayer.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card as="section" className="p-5 sm:p-6">
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        <div>
          <Text variant="subtitle">Votre boutique</Text>
          <Text variant="body" tone="muted" className="mt-0.5">
            Ce que les clients voient en ouvrant votre page.
          </Text>
        </div>
        <ImageField
          label="Photo de couverture"
          value={cover}
          upload={uploadShopImage}
          onChange={setCover}
          aspect="aspect-[16/9]"
          helper="Une photo large de votre boutique ou de vos produits. JPEG, PNG ou WebP, 8 Mo au maximum."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Nom de la boutique" required value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Spécialité"
            required
            maxLength={40}
            value={specialty}
            error={errors.specialty}
            helper="En quelques mots : « Épicerie sénégalaise », « Pâtisserie orientale »…"
            onChange={(e) => setSpecialty(e.target.value)}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label="Délai de préparation et livraison (min)"
            required
            inputMode="numeric"
            value={eta}
            error={errors.eta}
            helper="Le délai annoncé aux clients, de 10 à 180 minutes."
            onChange={(e) => setEta(e.target.value)}
          />
          <div className="self-center">
            <Toggle label="Certifié halal" hint="Affiche le badge halal sur votre boutique." checked={halal} onChange={setHalal} />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── opening hours ───────────────────────────────────────────────────────────

/** Monday first, the way a week is read here; `day` stays `Date.getDay()`'s, where Sunday is 0. */
const WEEK: { day: number; name: string }[] = [
  { day: 1, name: 'Lundi' },
  { day: 2, name: 'Mardi' },
  { day: 3, name: 'Mercredi' },
  { day: 4, name: 'Jeudi' },
  { day: 5, name: 'Vendredi' },
  { day: 6, name: 'Samedi' },
  { day: 0, name: 'Dimanche' },
];
const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '18:00';
const isClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** All seven days: a day the shop never listed is closed, with times ready for when it opens. */
function fullWeek(hours: ShopHours[]): ShopHours[] {
  return WEEK.map(({ day }) => {
    const listed = hours.find((h) => h.day === day);
    return listed
      ? { day, open: listed.open.slice(0, 5), close: listed.close.slice(0, 5), closed: Boolean(listed.closed) }
      : { day, open: DEFAULT_OPEN, close: DEFAULT_CLOSE, closed: true };
  });
}

export function ShopHoursCard({ shop, onSaved }: { shop: Shop; onSaved: (shop: Shop) => void }) {
  const toast = useToast();
  const [week, setWeek] = useState<ShopHours[]>(() => fullWeek(shop.hours));
  const [badDays, setBadDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const setDay = (day: number, patch: Partial<ShopHours>) => {
    setWeek((current) => current.map((row) => (row.day === day ? { ...row, ...patch } : row)));
    setBadDays((current) => current.filter((d) => d !== day));
  };

  function copyMonday() {
    const monday = week.find((row) => row.day === 1);
    if (!monday) return;
    setWeek((current) => current.map((row) => ({ ...row, open: monday.open, close: monday.close, closed: monday.closed })));
    setBadDays([]);
  }

  async function save() {
    // A closed day's times are not shown, so a half-typed one is reset rather than refused.
    const cleaned = week.map((row) =>
      row.closed && !(isClock(row.open) && isClock(row.close)) ? { ...row, open: DEFAULT_OPEN, close: DEFAULT_CLOSE } : row
    );
    const bad = cleaned.filter((row) => !row.closed && !(isClock(row.open) && isClock(row.close) && row.open < row.close)).map((row) => row.day);
    setBadDays(bad);
    if (bad.length > 0) {
      toast('error', 'L’heure de fermeture doit suivre l’heure d’ouverture.');
      return;
    }
    setSaving(true);
    try {
      onSaved(await setMyHours(cleaned));
      toast('success', 'Horaires enregistrés');
    } catch (error) {
      toast('error', failureMessage(error, 'Enregistrement impossible. Veuillez réessayer.'));
    } finally {
      setSaving(false);
    }
  }

  const timeInput =
    'h-10 rounded-lg border-[1.5px] border-border-strong bg-card px-2.5 font-sans text-[0.875rem] tabular text-foreground outline-none focus:border-primary';

  return (
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text variant="subtitle">Horaires d’ouverture</Text>
          <Text variant="body" tone="muted" className="mt-0.5">
            En dehors de ces heures, votre boutique s’affiche fermée et ne reçoit pas de commandes.
          </Text>
        </div>
        <Button variant="outline" size="sm" onClick={copyMonday}>
          Copier le lundi sur toute la semaine
        </Button>
      </div>
      <ul className="flex flex-col">
        {WEEK.map(({ day, name }) => {
          const row = week.find((r) => r.day === day)!;
          const bad = badDays.includes(day);
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-0">
              <span className="w-24 font-sans text-[0.875rem] font-medium text-foreground">{name}</span>
              <Switch checked={!row.closed} onChange={(open) => setDay(day, { closed: !open })} label={`${name} : ouvert`} />
              {row.closed ? (
                <span className="font-sans text-[0.875rem] text-muted-foreground">Fermé</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${name}, ouverture`}
                    value={row.open}
                    onChange={(e) => setDay(day, { open: e.target.value })}
                    className={timeInput}
                  />
                  <span className="font-sans text-[0.875rem] text-muted-foreground">à</span>
                  <input
                    type="time"
                    aria-label={`${name}, fermeture`}
                    value={row.close}
                    onChange={(e) => setDay(day, { close: e.target.value })}
                    className={`${timeInput} ${bad ? 'border-destructive' : ''}`}
                  />
                  {bad && (
                    <span role="alert" className="font-sans text-[0.75rem] text-destructive">
                      Heures invalides
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer les horaires'}
        </Button>
      </div>
    </Card>
  );
}

// ── shelves ─────────────────────────────────────────────────────────────────

export function ShopSectionsCard({ shop, onChanged }: { shop: Shop; onChanged: (sections: ShopSection[]) => void }) {
  const toast = useToast();
  const restaurant = shop.vendorType === 'restaurant';
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<ShopSection | null>(null);

  const sections = [...shop.sections].sort((a, b) => a.position - b.position);
  const validName = (name: string) => name.trim().length >= 1 && name.trim().length <= 40;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!validName(adding)) return;
    setBusy(true);
    try {
      const created = await addSection(adding.trim());
      onChanged([...shop.sections, created]);
      setAdding('');
    } catch (error) {
      toast('error', failureMessage(error, 'Ajout impossible. Veuillez réessayer.'));
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!editing || !validName(editing.name)) return;
    setBusy(true);
    try {
      const updated = await renameSection(editing.id, editing.name.trim());
      onChanged(shop.sections.map((section) => (section.id === updated.id ? updated : section)));
      setEditing(null);
    } catch (error) {
      toast('error', failureMessage(error, 'Modification impossible. Veuillez réessayer.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeSection(removing.id);
      onChanged(shop.sections.filter((section) => section.id !== removing.id));
    } catch (error) {
      // The API refuses to delete a shelf that still holds products.
      toast(
        'error',
        error instanceof ApiError && error.status === 403
          ? 'Il contient encore des produits. Déplacez-les ou supprimez-les d’abord.'
          : failureMessage(error, 'Suppression impossible. Veuillez réessayer.')
      );
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  return (
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <Text variant="subtitle">{restaurant ? 'Sections du menu' : 'Rayons'}</Text>
        <Text variant="body" tone="muted" className="mt-0.5">
          {restaurant
            ? 'Les parties de votre menu : « Entrées », « Plats », « Boissons »… Chaque plat est rangé dans une section.'
            : 'Les rayons de votre boutique : « Épices », « Boissons », « Surgelés »… Chaque produit est rangé dans un rayon.'}
        </Text>
      </div>

      {sections.length === 0 ? (
        <Text variant="body" tone="muted">
          {restaurant
            ? 'Aucune section pour l’instant. Ajoutez-en une pour pouvoir créer des plats.'
            : 'Aucun rayon pour l’instant. Ajoutez-en un pour pouvoir créer des produits.'}
        </Text>
      ) : (
        <ul className="flex flex-col">
          {sections.map((section) => (
            <li key={section.id} className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
              {editing?.id === section.id ? (
                <>
                  <input
                    autoFocus
                    value={editing.name}
                    maxLength={40}
                    aria-label={restaurant ? 'Nom de la section' : 'Nom du rayon'}
                    onChange={(e) => setEditing({ id: section.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void rename();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-primary bg-card px-3 font-sans text-[0.875rem] text-foreground outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <IconButton label="Enregistrer le nom" onClick={() => void rename()} disabled={busy || !validName(editing.name)}>
                      <Check size={16} />
                    </IconButton>
                    <IconButton label="Annuler" onClick={() => setEditing(null)} disabled={busy}>
                      <X size={16} />
                    </IconButton>
                  </div>
                </>
              ) : (
                <>
                  <span className="min-w-0 truncate font-sans text-[0.875rem] font-medium text-foreground">{section.nameFr}</span>
                  <div className="flex items-center gap-1">
                    <IconButton label={`Renommer ${section.nameFr}`} onClick={() => setEditing({ id: section.id, name: section.nameFr })} disabled={busy}>
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton label={`Supprimer ${section.nameFr}`} onClick={() => setRemoving(section)} disabled={busy}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap items-start gap-3">
        <Input
          label={restaurant ? 'Nouvelle section' : 'Nouveau rayon'}
          maxLength={40}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
        <Button type="submit" variant="outline" className="h-[52px]" disabled={busy || !validName(adding)}>
          Ajouter
        </Button>
      </form>

      <ConfirmDialog
        open={removing !== null}
        title={`Supprimer « ${removing?.nameFr ?? ''} » ?`}
        description={
          restaurant
            ? 'Seule une section vide peut être supprimée. Les plats ne sont jamais supprimés avec elle.'
            : 'Seul un rayon vide peut être supprimé. Les produits ne sont jamais supprimés avec lui.'
        }
        confirmLabel="Supprimer"
        tone="destructive"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function IconButton({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}
