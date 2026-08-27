'use client';
import { useState } from 'react';
import { Store, Truck, MapPin, ShoppingBasket } from 'lucide-react';
import { Badge, Button, Card, Input, Reveal, Text, ThemeToggle, WovenBand } from '@/components/ui';

/**
 * The Phase 1 review gate.
 *
 * Open this beside the app's own /_dev/styleguide in a simulator. They must read
 * as the same design system — everything downstream inherits these primitives, so
 * a hero built on unfinished ones has to be rebuilt.
 */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-12">
      <Text variant="label" tone="muted" as="h2" className="mb-1">{title}</Text>
      {note && <p className="mb-6 max-w-[62ch] font-sans text-[0.9375rem] text-muted-foreground">{note}</p>}
      <div className={note ? '' : 'mt-6'}>{children}</div>
    </section>
  );
}

const BADGE_TONES = ['neutral', 'primary', 'success', 'warning', 'secondary', 'destructive'] as const;

export default function Styleguide() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | undefined>();

  return (
    <main id="contenu" className="mx-auto max-w-content px-5 pb-24 pt-10 md:px-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <Text variant="display" as="h1">Système de design</Text>
          <p className="mt-2 font-sans text-muted-foreground">
            Phase&nbsp;1 · les primitives, avant toute page.
          </p>
        </div>
        <ThemeToggle />
      </header>

      {/* The single most important proof on this page. */}
      <Section
        title="Axes variables — Bricolage Grotesque"
        note="Même taille rendue, opsz différent. Si les deux lignes sont identiques, la police variable n'est pas chargée et tout l'argument typographique s'effondre."
      >
        <div className="space-y-4">
          <div className="rounded-card bg-card p-6 shadow-card">
            <Text variant="label" tone="muted" className="mb-2">opsz 12 — dessiné pour du corps de texte, rendu à 96px</Text>
            <div className="-mx-6 overflow-x-auto px-6">
              <p className="font-display text-[96px] font-extrabold leading-none opsz-12 whitespace-nowrap">Sougouba</p>
            </div>
          </div>
          <div className="rounded-card bg-card p-6 shadow-card">
            <Text variant="label" tone="muted" className="mb-2">opsz 96 — dessiné pour l&apos;affichage</Text>
            <div className="-mx-6 overflow-x-auto px-6">
              <p className="font-display text-[96px] font-extrabold leading-none opsz-96 whitespace-nowrap">Sougouba</p>
            </div>
          </div>
          <div className="rounded-card bg-card p-6 shadow-card">
            <Text variant="label" tone="muted" className="mb-2">wdth 88 — le titre long tient sa ligne au lieu de rétrécir</Text>
            <div className="-mx-6 space-y-3 overflow-x-auto px-6">
              <p className="font-display text-[56px] font-extrabold leading-[0.98] display-hero whitespace-nowrap">Les épiceries d&apos;ici</p>
              <p className="font-display text-[56px] font-extrabold leading-[0.98] opsz-96 whitespace-nowrap">Les épiceries d&apos;ici</p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Échelle typographique">
        <div className="space-y-5">
          <Text variant="hero">Le grand marché</Text>
          <Text variant="display" as="p">Trois applications, une plateforme</Text>
          <Text variant="title" as="p">Ce qu&apos;on ne trouve pas ailleurs</Text>
          <Text variant="subtitle" as="p">Commandez, suivez, recevez</Text>
          <Text variant="body" className="max-w-[68ch]">
            Sougouba relie les épiceries, boucheries et cuisines africaines et maghrébines de
            Montréal, Montréal-Nord, Laval et Longueuil aux gens qui cherchent leurs produits.
          </Text>
          <Text variant="caption" tone="muted">Ras el hanout, attiéké, bissap, agneau halal, fonio.</Text>
          <Text variant="label" tone="muted">Côte-des-Neiges · Villeray · Parc-Extension</Text>
          <div className="overflow-x-auto">
            <p className="tabular whitespace-nowrap font-display text-[28px] font-bold opsz-32">34,48&nbsp;$ · 1,72&nbsp;$ · 3,44&nbsp;$ · 43,63&nbsp;$</p>
          </div>
        </div>
      </Section>

      <Section
        title="Boutons"
        note="Capsule, remplissage plat, une ombre teintée à la couleur du bouton lui-même. Jamais de dégradé, jamais de brillance : un seul indice de profondeur."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="cta" size="lg">Être prévenu du lancement</Button>
          <Button variant="primary">Inscrire ma boutique</Button>
          <Button variant="outline">En savoir plus</Button>
          <Button variant="ghost">Passer</Button>
          <Button variant="mustard">Devenir livreur</Button>
          <Button variant="primary" size="sm">Petit</Button>
          <Button variant="primary" disabled>Désactivé</Button>
        </div>
      </Section>

      <Section title="Badges" note="Une étiquette, pas du corps de texte — rayon 8px, 11px gras majuscule interlettré. Délibérément pas une pilule.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {BADGE_TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {BADGE_TONES.map((t) => <Badge key={t} tone={t} variant="solid">{t}</Badge>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary" size="sm">halal</Badge>
            <Badge tone="secondary" size="sm">-20 %</Badge>
            <Badge tone="warning" size="sm">stock faible</Badge>
          </div>
        </div>
      </Section>

      <Section title="Cartes et surfaces">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { icon: ShoppingBasket, t: 'Épicerie', d: 'Marché Bamako, Épicerie Teranga, Souk El Medina.' },
            { icon: Store, t: 'Restaurant', d: 'Saveurs de Dakar, Café Tanit, Chez Mama Adjoa.' },
            { icon: Truck, t: 'Livraison', d: 'Fixée par Sougouba selon la distance. Dès 2,99 $.' },
          ].map(({ icon: Icon, t, d }, i) => (
            <Reveal key={t} index={i}>
              <Card className="h-full p-6">
                <Icon size={22} strokeWidth={2} className="mb-3 text-primary" />
                <Text variant="subtitle" as="h3">{t}</Text>
                <Text variant="caption" tone="muted" className="mt-2">{d}</Text>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section title="Champs" note="Étiquette flottante, 58px, anneau de focus qui interpole border → primary. Validation au blur, jamais à la frappe.">
        <div className="grid max-w-xl gap-5">
          <Input
            label="Adresse courriel"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setErr(email && !email.includes('@') ? 'Cette adresse est incomplète — il manque le @.' : undefined)}
            error={err}
            helper="Nous vous écrivons une seule fois, à l'ouverture."
          />
          <Input label="Code postal" helper="Format : H2S 3K9" />
          <Input label="Champ en erreur" error="Sougouba ne dessert pas encore cette ville." />
        </div>
      </Section>

      <Section title="Bande tissée" note="Le seul séparateur de la page. Chaque triangle est un nœud distinct : la bande se tisse de gauche à droite, 24 ms d'écart, plafonné à 400 ms.">
        <div className="space-y-6">
          <WovenBand height={24} />
          <WovenBand height={40} />
          <div className="rounded-card bg-forest-800 p-8">
            <WovenBand variant="dark" height={24} />
            <p className="mt-5 font-sans text-forest-200">
              Variante sombre — sur l&apos;ardoise forêt, les triangles clairs de la version claire
              disparaissent dans le fond.
            </p>
          </div>
          <div className="rounded-card bg-neutral-900 p-8">
            <WovenBand variant="dark" height={24} />
            <p className="mt-5 font-sans text-neutral-300">Sur graphite — la surface livreur.</p>
          </div>
        </div>
      </Section>

      <Section title="Ardoises de rôle" note="Client = plein jour. Commerçant = l'autre côté du comptoir. Livreur = graphite et moutarde. Trois rôles, trois surfaces, reconnaissables avant d'avoir lu un mot.">
        <div className="grid gap-5 md:grid-cols-3">
          <div className="rounded-card bg-gradient-to-br from-forest-100 to-mustard-50 p-6">
            <MapPin size={20} className="mb-3 text-forest-700" />
            <p className="font-display text-[1.25rem] font-semibold opsz-20 text-neutral-900">Pour vous</p>
            <p className="mt-2 font-sans text-[0.9375rem] text-neutral-700">Ivoire, dégradé menthe, photographie.</p>
          </div>
          <div className="rounded-card bg-gradient-to-br from-forest-800 to-forest-950 p-6">
            <Store size={20} className="mb-3 text-forest-200" />
            <p className="font-display text-[1.25rem] font-semibold opsz-20 text-[#F3EFE6]">Pour votre commerce</p>
            <p className="mt-2 font-sans text-[0.9375rem] text-forest-200">Le comptoir. Ivoire et menthe sur forêt.</p>
          </div>
          <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-neutral-900 to-neutral-950 p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(228,178,51,0.18),transparent_55%)]" />
            <Truck size={20} className="relative mb-3 text-mustard-300" />
            <p className="relative font-display text-[1.25rem] font-semibold opsz-20 text-[#F6F2E9]">Pour les livreurs</p>
            <p className="relative mt-2 font-sans text-[0.9375rem] text-neutral-300">Graphite, lueur moutarde en coin.</p>
          </div>
        </div>
      </Section>
    </main>
  );
}
