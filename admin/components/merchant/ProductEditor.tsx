'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { ImageField, SelectField, TextArea, Toggle } from './fields';
import {
  createProduct,
  getMyShop,
  listCategories,
  removeProduct,
  updateProduct,
  uploadProductImage,
  type Category,
  type Product,
  type ProductInput,
  type Shop,
} from '@/lib/api/merchantCatalog';
import { failureMessage, moneyText, parseCount, parseMoney } from '@/lib/merchantForm';
import { t } from '@/lib/i18n';

/**
 * The product form of the merchant portal — one for "new" and for "edit".
 *
 * The fields and the rules are the mobile app's product form's: the API
 * validates both the same way, and what the form checks here is only what it
 * can say sooner and closer to the field than a refused save would.
 */

/** What both product pages need before the form can open: the shop's shelves and the platform's categories. */
export function useProductEditorData() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getMyShop().then(setShop).catch(() => setFailed(true));
    listCategories().then(setCategories).catch(() => setFailed(true));
  }, []);

  return { shop, categories, failed };
}

interface Form {
  name: string;
  description: string;
  sectionId: string;
  categoryId: string;
  price: string;
  compareAt: string;
  stock: string;
  isAvailable: boolean;
  tags: string;
  imageUrl: string;
  hasNutrition: boolean;
  calories: string;
  proteinG: string;
  fatG: string;
  weightG: string;
}

type Errors = Partial<Record<keyof Form, string>>;

const numberText = (value: number | undefined) => (value === undefined ? '' : String(value).replace('.', ','));

function initialForm(product: Product | undefined, shop: Shop): Form {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    // A shop with a single shelf has nothing to choose between.
    sectionId: product?.sectionId ?? (shop.sections.length === 1 ? shop.sections[0].id : ''),
    categoryId: product?.categoryId ?? (shop.categoryIds.length === 1 ? shop.categoryIds[0] : ''),
    price: moneyText(product?.priceCad),
    compareAt: moneyText(product?.compareAtPriceCad),
    stock: product ? String(product.stockQty) : '',
    isAvailable: product?.isAvailable ?? true,
    tags: product?.tags.join(', ') ?? '',
    imageUrl: product?.imageUrl ?? '',
    hasNutrition: Boolean(product?.nutrition),
    calories: numberText(product?.nutrition?.calories),
    proteinG: numberText(product?.nutrition?.proteinG),
    fatG: numberText(product?.nutrition?.fatG),
    weightG: numberText(product?.nutrition?.weightG),
  };
}

/** The form as the API wants it, or what is wrong with it. `editing` decides how "no value" is said. */
function read(form: Form, editing: boolean): { input: ProductInput } | { errors: Errors } {
  const errors: Errors = {};

  const name = form.name.trim();
  if (name.length < 2) errors.name = t('portalProduct.errors.name');
  const description = form.description.trim();
  if (description.length < 10) errors.description = t('portalProduct.errors.description');
  if (!form.sectionId) errors.sectionId = t('portalProduct.errors.section');
  if (!form.categoryId) errors.categoryId = t('portalProduct.errors.category');

  const price = parseMoney(form.price);
  if (price === null || price <= 0) errors.price = t('portalProduct.errors.price');

  let compareAt: number | null = null;
  if (form.compareAt.trim()) {
    compareAt = parseMoney(form.compareAt);
    if (compareAt === null || compareAt <= 0) errors.compareAt = t('portalProduct.errors.compareAtInvalid');
    else if (price !== null && compareAt <= price) errors.compareAt = t('portalProduct.errors.compareAtTooLow');
  }

  const stock = parseCount(form.stock);
  if (stock === null) errors.stock = t('portalProduct.errors.stock');

  const tags = form.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 20) errors.tags = t('portalProduct.errors.tags');

  let nutrition: ProductInput['nutrition'];
  if (form.hasNutrition) {
    const calories = parseCount(form.calories);
    if (calories === null) errors.calories = t('portalProduct.errors.calories');
    const grams = (key: 'proteinG' | 'fatG' | 'weightG') => {
      const value = parseMoney(form[key]);
      if (value === null) errors[key] = t('portalProduct.errors.grams');
      return value ?? 0;
    };
    nutrition = { calories: calories ?? 0, proteinG: grams('proteinG'), fatG: grams('fatG'), weightG: grams('weightG') };
  } else if (editing) {
    // An edit says "no nutrition" out loud; a new product simply has none.
    nutrition = null;
  }

  if (Object.keys(errors).length > 0 || price === null || stock === null) return { errors };

  return {
    input: {
      name,
      description,
      sectionId: form.sectionId,
      categoryId: form.categoryId,
      priceCad: price,
      // Same reason as nutrition: `null` takes a product off sale, and only an edit has a sale to take off.
      ...(compareAt !== null ? { compareAtPriceCad: compareAt } : editing ? { compareAtPriceCad: null } : {}),
      stockQty: stock,
      isAvailable: form.isAvailable,
      tags,
      imageUrl: form.imageUrl,
      ...(nutrition !== undefined ? { nutrition } : {}),
    },
  };
}

/**
 * Only what the merchant actually changed.
 *
 * Sending the whole form back would re-submit fields nobody touched, and the
 * API checks every field it is sent: a product whose photo predates Storage
 * paths (an absolute URL from the seeded catalogue) would have its price edit
 * refused over a photo that was never part of it.
 */
function changesTo(product: Product, input: ProductInput): Partial<ProductInput> {
  const patch: Partial<ProductInput> = {};
  if (input.name !== product.name) patch.name = input.name;
  if (input.description !== product.description) patch.description = input.description;
  if (input.sectionId !== product.sectionId) patch.sectionId = input.sectionId;
  if (input.categoryId !== product.categoryId) patch.categoryId = input.categoryId;
  if (input.priceCad !== product.priceCad) patch.priceCad = input.priceCad;
  if ((input.compareAtPriceCad ?? null) !== (product.compareAtPriceCad ?? null)) patch.compareAtPriceCad = input.compareAtPriceCad ?? null;
  if (input.stockQty !== product.stockQty) patch.stockQty = input.stockQty;
  if (input.isAvailable !== product.isAvailable) patch.isAvailable = input.isAvailable;
  if (input.imageUrl !== product.imageUrl) patch.imageUrl = input.imageUrl;
  // Compared the way the API stores them: trimmed, lower-cased, without repeats.
  const tags = [...new Set(input.tags.map((tag) => tag.toLowerCase()))];
  if (tags.join('\n') !== product.tags.join('\n')) patch.tags = input.tags;
  const before = product.nutrition ?? null;
  const after = input.nutrition ?? null;
  const sameNutrition =
    before === null || after === null
      ? before === after
      : before.calories === after.calories && before.proteinG === after.proteinG && before.fatG === after.fatG && before.weightG === after.weightG;
  if (!sameNutrition) patch.nutrition = after;
  return patch;
}

export function ProductEditor({ product, shop, categories }: { product?: Product; shop: Shop; categories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form>(() => initialForm(product, shop));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const shelf = shop.vendorType === 'restaurant' ? t('portalProduct.shelf.restaurant') : t('portalProduct.shelf.grocery');

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = read(form, Boolean(product));
    if ('errors' in result) {
      setErrors(result.errors);
      toast('error', t('portalProduct.toast.fixFields'));
      return;
    }
    const patch = product ? changesTo(product, result.input) : null;
    if (patch && Object.keys(patch).length === 0) {
      toast('info', t('portalProduct.toast.noChanges'));
      router.push('/merchant/products');
      return;
    }
    setSaving(true);
    try {
      if (product && patch) await updateProduct(product.id, patch);
      else await createProduct(result.input);
      toast('success', product ? t('portalProduct.toast.saved') : t('portalProduct.toast.added'));
      router.push('/merchant/products');
    } catch (error) {
      toast('error', failureMessage(error, t('portalProduct.toast.saveFailed')));
      setSaving(false);
    }
  }

  async function remove() {
    if (!product) return;
    setDeleting(true);
    try {
      await removeProduct(product.id);
      toast('success', t('portalProduct.toast.removed'));
      router.push('/merchant/products');
    } catch (error) {
      toast('error', failureMessage(error, t('portalProduct.toast.removeFailed')));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (shop.sections.length === 0) {
    return (
      <Card className="p-6">
        <Text variant="subtitle">{t('portalProduct.noSections.title')}</Text>
        <Text variant="body" tone="muted" className="mt-1 max-w-xl">
          {t('portalProduct.noSections.body')}
        </Text>
        <Link
          href="/merchant/shop"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 font-sans text-[0.875rem] font-semibold text-primary-foreground shadow-cta-primary"
        >
          {t('portalProduct.noSections.link')}
        </Link>
      </Card>
    );
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6">
      {product?.hiddenByAdmin && (
        <div className="flex items-start gap-3 rounded-card border border-destructive/40 bg-destructive/5 p-4">
          <EyeOff size={18} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <Text variant="body" className="font-semibold">
              {t('portalProduct.hidden.title')}
            </Text>
            <Text variant="body" tone="muted" className="mt-0.5">
              {product.hiddenByAdmin.reason
                ? t('portalProduct.hidden.reason', { reason: product.hiddenByAdmin.reason.replace(/[.\s]+$/, '') })
                : t('portalProduct.hidden.noReason')}{' '}
              {t('portalProduct.hidden.fix')}
            </Text>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <Text variant="subtitle">{t('portalProduct.details.title')}</Text>
          <Input label={t('portalProduct.details.name')} required value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
          <TextArea
            label={t('portalProduct.details.description')}
            required
            value={form.description}
            error={errors.description}
            helper={t('portalProduct.details.descriptionHelper')}
            onChange={(value) => set('description', value)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label={shelf}
              required
              value={form.sectionId}
              error={errors.sectionId}
              placeholder={t('portalProduct.details.choose')}
              options={shop.sections.map((section) => ({ value: section.id, label: section.nameFr }))}
              onChange={(value) => set('sectionId', value)}
            />
            <SelectField
              label={t('portalProduct.details.category')}
              required
              value={form.categoryId}
              error={errors.categoryId}
              helper={t('portalProduct.details.categoryHelper')}
              placeholder={t('portalProduct.details.choose')}
              options={categories.map((category) => ({ value: category.id, label: category.nameFr }))}
              onChange={(value) => set('categoryId', value)}
            />
          </div>
          <Input
            label={t('portalProduct.details.tags')}
            value={form.tags}
            error={errors.tags}
            helper={t('portalProduct.details.tagsHelper')}
            onChange={(e) => set('tags', e.target.value)}
          />
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-5 sm:p-6">
            <ImageField label={t('portalProduct.photo')} value={form.imageUrl} upload={uploadProductImage} onChange={(path) => set('imageUrl', path)} />
          </Card>

          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <Text variant="subtitle">{t('portalProduct.pricing.title')}</Text>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('portalProduct.pricing.price')}
                required
                inputMode="decimal"
                value={form.price}
                error={errors.price}
                onChange={(e) => set('price', e.target.value)}
              />
              <Input
                label={t('portalProduct.pricing.compareAt')}
                inputMode="decimal"
                value={form.compareAt}
                error={errors.compareAt}
                helper={t('portalProduct.pricing.compareAtHelper')}
                onChange={(e) => set('compareAt', e.target.value)}
              />
            </div>
            <Input
              label={t('portalProduct.pricing.stock')}
              required
              inputMode="numeric"
              value={form.stock}
              error={errors.stock}
              onChange={(e) => set('stock', e.target.value)}
            />
            <Toggle
              label={t('portalProduct.pricing.available')}
              hint={t('portalProduct.pricing.availableHint')}
              checked={form.isAvailable}
              onChange={(checked) => set('isAvailable', checked)}
            />
          </Card>
        </div>
      </div>

      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <Toggle
          label={t('portalProduct.nutrition.title')}
          hint={t('portalProduct.nutrition.hint')}
          checked={form.hasNutrition}
          onChange={(checked) => set('hasNutrition', checked)}
        />
        {form.hasNutrition && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Input label={t('portalProduct.nutrition.calories')} inputMode="numeric" value={form.calories} error={errors.calories} onChange={(e) => set('calories', e.target.value)} />
            <Input label={t('portalProduct.nutrition.protein')} inputMode="decimal" value={form.proteinG} error={errors.proteinG} onChange={(e) => set('proteinG', e.target.value)} />
            <Input label={t('portalProduct.nutrition.fat')} inputMode="decimal" value={form.fatG} error={errors.fatG} onChange={(e) => set('fatG', e.target.value)} />
            <Input label={t('portalProduct.nutrition.weight')} inputMode="decimal" value={form.weightG} error={errors.weightG} onChange={(e) => set('weightG', e.target.value)} />
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || deleting}>
            {saving ? t('portalProduct.actions.saving') : product ? t('common.actions.save') : t('portalProduct.actions.add')}
          </Button>
          <Button variant="ghost" onClick={() => router.push('/merchant/products')} disabled={saving || deleting}>
            {t('common.actions.cancel')}
          </Button>
        </div>
        {product && (
          <Button variant="outline" className="border-destructive/50 text-destructive" onClick={() => setConfirmingDelete(true)} disabled={saving || deleting}>
            {t('portalProduct.actions.remove')}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={t('portalProduct.remove.title')}
        description={t('portalProduct.remove.body', { name: product?.name ?? '' })}
        confirmLabel={t('common.actions.delete')}
        tone="destructive"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </form>
  );
}
