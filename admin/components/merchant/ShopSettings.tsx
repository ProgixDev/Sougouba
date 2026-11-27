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
import { intlLocale, t, useLocale } from '@/lib/i18n';

/**
 * The three things a shop owner sets about the shop itself: what customers
 * read about it, when it is open, and the shelves its products are sorted on.
 * Each card saves on its own, so changing the hours never waits on a name.
 */

// ── what customers read ─────────────────────────────────────────────────────

export function ShopInfoCard({ shop, onSaved }: { shop: Shop; onSaved: (shop: Shop) => void }) {
  useLocale();
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
    if (name.trim().length < 2) next.name = t('portalShop.info.errors.name');
    if (specialty.trim().length < 3 || specialty.trim().length > 40) next.specialty = t('portalShop.info.errors.specialty');
    if (minutes === null || minutes < 10 || minutes > 180) next.eta = t('portalShop.info.errors.eta');
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
      toast('info', t('portalShop.info.nothingToSave'));
      return;
    }

    setSaving(true);
    try {
      onSaved(await updateMyShop(patch));
      toast('success', t('portalShop.info.saved'));
    } catch (error) {
      toast('error', failureMessage(error, t('portalShop.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card as="section" className="p-5 sm:p-6">
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        <div>
          <Text variant="subtitle">{t('portalShop.info.title')}</Text>
          <Text variant="body" tone="muted" className="mt-0.5">
            {t('portalShop.info.subtitle')}
          </Text>
        </div>
        <ImageField
          label={t('portalShop.info.cover')}
          value={cover}
          upload={uploadShopImage}
          onChange={setCover}
          aspect="aspect-[16/9]"
          helper={t('portalShop.info.coverHelper')}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label={t('portalShop.info.name')} required value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
          <Input
            label={t('portalShop.info.specialty')}
            required
            maxLength={40}
            value={specialty}
            error={errors.specialty}
            helper={t('portalShop.info.specialtyHelper')}
            onChange={(e) => setSpecialty(e.target.value)}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label={t('portalShop.info.eta')}
            required
            inputMode="numeric"
            value={eta}
            error={errors.eta}
            helper={t('portalShop.info.etaHelper')}
            onChange={(e) => setEta(e.target.value)}
          />
          <div className="self-center">
            <Toggle label={t('portalShop.info.halal')} hint={t('portalShop.info.halalHint')} checked={halal} onChange={setHalal} />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={saving}>
            {saving ? t('portalShop.saving') : t('common.actions.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── opening hours ───────────────────────────────────────────────────────────

/** « Lundi », "Monday": the day's name in the reader's language, with the capital a row's heading takes. */
function dayName(day: number): string {
  // Built at each call, in the language in force — a formatter kept from load time would not follow a switch.
  const weekday = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', timeZone: 'UTC' });
  // 7 January 2024 was a Sunday, so that week's dates fall on `Date.getDay()`'s numbers.
  const name = weekday.format(new Date(Date.UTC(2024, 0, 7 + day)));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Monday first, the way a week is read here; `day` stays `Date.getDay()`'s, where Sunday is 0. */
const WEEK: { day: number; name: string }[] = [
  { day: 1, name: dayName(1) },
  { day: 2, name: dayName(2) },
  { day: 3, name: dayName(3) },
  { day: 4, name: dayName(4) },
  { day: 5, name: dayName(5) },
  { day: 6, name: dayName(6) },
  { day: 0, name: dayName(0) },
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
  useLocale();
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
      toast('error', t('portalShop.hours.wrongOrder'));
      return;
    }
    setSaving(true);
    try {
      onSaved(await setMyHours(cleaned));
      toast('success', t('portalShop.hours.saved'));
    } catch (error) {
      toast('error', failureMessage(error, t('portalShop.saveFailed')));
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
          <Text variant="subtitle">{t('portalShop.hours.title')}</Text>
          <Text variant="body" tone="muted" className="mt-0.5">
            {t('portalShop.hours.subtitle')}
          </Text>
        </div>
        <Button variant="outline" size="sm" onClick={copyMonday}>
          {t('portalShop.hours.copyMonday')}
        </Button>
      </div>
      <ul className="flex flex-col">
        {WEEK.map(({ day, name }) => {
          const row = week.find((r) => r.day === day)!;
          const bad = badDays.includes(day);
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-0">
              <span className="w-24 font-sans text-[0.875rem] font-medium text-foreground">{name}</span>
              <Switch checked={!row.closed} onChange={(open) => setDay(day, { closed: !open })} label={t('portalShop.hours.openSwitch', { day: name })} />
              {row.closed ? (
                <span className="font-sans text-[0.875rem] text-muted-foreground">{t('portalShop.hours.closed')}</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={t('portalShop.hours.opening', { day: name })}
                    value={row.open}
                    onChange={(e) => setDay(day, { open: e.target.value })}
                    className={timeInput}
                  />
                  <span className="font-sans text-[0.875rem] text-muted-foreground">{t('portalShop.hours.to')}</span>
                  <input
                    type="time"
                    aria-label={t('portalShop.hours.closing', { day: name })}
                    value={row.close}
                    onChange={(e) => setDay(day, { close: e.target.value })}
                    className={`${timeInput} ${bad ? 'border-destructive' : ''}`}
                  />
                  {bad && (
                    <span role="alert" className="font-sans text-[0.75rem] text-destructive">
                      {t('portalShop.hours.invalid')}
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
          {saving ? t('portalShop.saving') : t('portalShop.hours.save')}
        </Button>
      </div>
    </Card>
  );
}

// ── shelves ─────────────────────────────────────────────────────────────────

export function ShopSectionsCard({ shop, onChanged }: { shop: Shop; onChanged: (sections: ShopSection[]) => void }) {
  useLocale();
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
      toast('error', failureMessage(error, t('portalShop.sections.addFailed')));
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
      toast('error', failureMessage(error, t('portalShop.sections.renameFailed')));
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
          ? t('portalShop.sections.notEmpty')
          : failureMessage(error, t('portalShop.sections.removeFailed'))
      );
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  return (
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <Text variant="subtitle">{restaurant ? t('portalShop.sections.menu.title') : t('portalShop.sections.shelves.title')}</Text>
        <Text variant="body" tone="muted" className="mt-0.5">
          {restaurant
            ? t('portalShop.sections.menu.intro')
            : t('portalShop.sections.shelves.intro')}
        </Text>
      </div>

      {sections.length === 0 ? (
        <Text variant="body" tone="muted">
          {restaurant
            ? t('portalShop.sections.menu.empty')
            : t('portalShop.sections.shelves.empty')}
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
                    aria-label={restaurant ? t('portalShop.sections.menu.nameLabel') : t('portalShop.sections.shelves.nameLabel')}
                    onChange={(e) => setEditing({ id: section.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void rename();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-primary bg-card px-3 font-sans text-[0.875rem] text-foreground outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <IconButton label={t('portalShop.sections.saveName')} onClick={() => void rename()} disabled={busy || !validName(editing.name)}>
                      <Check size={16} />
                    </IconButton>
                    <IconButton label={t('common.actions.cancel')} onClick={() => setEditing(null)} disabled={busy}>
                      <X size={16} />
                    </IconButton>
                  </div>
                </>
              ) : (
                <>
                  <span className="min-w-0 truncate font-sans text-[0.875rem] font-medium text-foreground">{section.nameFr}</span>
                  <div className="flex items-center gap-1">
                    <IconButton label={t('portalShop.sections.rename', { name: section.nameFr })} onClick={() => setEditing({ id: section.id, name: section.nameFr })} disabled={busy}>
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton label={t('portalShop.sections.remove', { name: section.nameFr })} onClick={() => setRemoving(section)} disabled={busy}>
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
          label={restaurant ? t('portalShop.sections.menu.newLabel') : t('portalShop.sections.shelves.newLabel')}
          maxLength={40}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
        <Button type="submit" variant="outline" className="h-[52px]" disabled={busy || !validName(adding)}>
          {t('common.actions.add')}
        </Button>
      </form>

      <ConfirmDialog
        open={removing !== null}
        title={t('portalShop.sections.removeTitle', { name: removing?.nameFr ?? '' })}
        description={
          restaurant
            ? t('portalShop.sections.menu.removeBody')
            : t('portalShop.sections.shelves.removeBody')
        }
        confirmLabel={t('common.actions.delete')}
        tone="destructive"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

function IconButton({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  useLocale();
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
