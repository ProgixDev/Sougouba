# 📋 Daily Report — Sougouba & La Ménagère Paris

**Date :** 02/09/2026
**Développeur :** Mohamed
**Note :** Journée à trois volets : l'après-midi, **construction du back-office admin Sougouba** (app Next.js entière, livrée en un commit à 21h09) ; en soirée, **retours client La Ménagère Paris** sur le tunnel de paiement et la facturation ; puis, de minuit à ~3h30 du matin, une **grosse session backend Sougouba** qui a fait passer six phases d'un coup. Les phases backend sont horodatées 03/09 dans `sougouba-api/PROGRESS.md` — c'est la même session, elle a simplement débordé après minuit.

---

## ✅ Travail effectué

**Faits marquants :**
- 🖥️ **Back-office administrateur Sougouba créé de zéro** — 19 écrans Next.js 15 (super-admin + portail marchand), ~5 300 lignes de code applicatif, sur une couche mock calquée sur le contrat REST prévu.
- ⚙️ **Backend Sougouba : 6 phases livrées en une nuit** (2, 3, 4, 5, 6, 8) — catalogue, commandes/paiements, fidélité/coupons, coursiers/dispatch, litiges, API admin. **83 routes, 118 tests.**
- 🚨 **Faille critique trouvée et corrigée** : n'importe quel utilisateur connecté pouvait se promouvoir **administrateur** via PostgREST. Trouvée en jouant l'attaque, pas en relisant le code.
- 🔁 **La même faille, deuxième occurrence** : un marchand pouvait auto-approuver sa propre boutique. Leçon retenue et écrite noir sur blanc : *RLS filtre les lignes, jamais les colonnes.*
- 🧾 **La Ménagère — commande créée seulement après paiement Stripe confirmé**, fin des commandes fantômes « impayées » qui polluaient le back-office.
- 📄 **La Ménagère — facture PDF générée après paiement**, avec choix **Télécharger / Recevoir par email** et un vrai écran de remerciement.

---

### 1. 🖥️ Sougouba — Back-office administrateur (`admin/`)

Nouvelle app **Next.js 15 autonome** à `admin/`, sœur du site vitrine `web/` (même schéma : pas de workspace partagé). Elle implémente le *« back-office administrateur »* du CDC, qui n'existait **nulle part** dans le dépôt jusqu'ici.

**Deux moitiés, comme le CDC les décrit :**
- **Super-admin plateforme** — tableau de bord GMV/commandes avec graphiques, files d'approbation marchands et coursiers, triage des litiges et des incidents coursiers, annuaire utilisateurs, réglages plateforme. Chaque entité a sa liste **et** sa page détail (15 écrans).
- **Portail marchand** (`/merchant`) — login et session **séparés** de l'admin, liste et détail des commandes de sa seule boutique, en lecture seule (4 écrans). L'app mobile `(business)` possède déjà nativement le workflow d'avancement de statut, inutile de le doubler ici.

**Architecture** — aucun backend réel n'existait à ce moment de la journée, donc `admin/lib/api/*` est une couche **mock sur localStorage, façonnée exactement comme le contrat REST prévu en Phase 8** (`listVendors`, `approveVendor`, `listDisputes`, `resolveDispute`, `getOverviewStats`, `getSettings`…). Brancher la vraie API sera un remplacement d'appels `fetch`, pas une réécriture. *(Et de fait — voir §2 — cette API a été construite la nuit même.)*

- `admin/lib/api/seed.ts` (379 lignes) importe les **vraies** données de seed de l'app mobile (`data/seed/{vendors,couriers,users}`, imports de types et de fonctions pures uniquement, zéro couplage React Native) puis ajoute des entrées `pending`/`suspended` synthétiques et 150 à 300 commandes, litiges et incidents générés — pour que les files aient du contenu réel plutôt que trois lignes de démo.
- **Jetons de design portés depuis `web/`**, pas réinventés : Bricolage Grotesque + Hanken Grotesk, boutons capsule, badges carrés, variables CSS de `tailwind.tokens.js`. Bascule clair/sombre incluse.

**Caveats assumés :** les deux logins sont des maquettes, pas de vraies frontières d'authentification ; les « documents » d'inscription sont des champs structurés (NEQ, numéro MAPAQ, numéro de police) et non des fichiers, faute de champ fichier dans le modèle de données ; `npm run build` ne peut pas aboutir en bac à sable réseau isolé (récupération Google Fonts) — limite d'environnement, `web/` bute sur la même, `next dev` dégrade proprement.

### 2. ⚙️ Sougouba — Backend : phases 2, 3, 4, 5, 6 et 8

Session nocturne sur `sougouba-api/` (NestJS 12 + Fastify, Drizzle sur le Postgres Supabase en direct, projet `wyjkaiquugoblvvzpjnq`). Le principe tenu à chaque phase : **booter et exercer pour de vrai**, pas seulement typechecker. À chaque fois, ça a attrapé quelque chose qu'aucun contrôle statique n'aurait vu.

**Phase 2 — Catalogue** (20 routes, migrations `0007..0012`)
- Boutiques, produits, catégories filtrés et paginés **en base**, plus sur le téléphone. Une boutique non approuvée est invisible pour tout le monde sauf son propre marchand.
- **Escalade de privilèges fermée** (`0009`) : avec les seules policies RLS, un marchand pouvait appeler PostgREST et faire `update vendors set status = 'approved'` sur sa propre boutique — défaisant la revue administrateur que le CDC place entre « quelqu'un s'est inscrit » et « la boutique est en ligne ». Corrigée par **privilèges de colonne**, puis l'attaque a été rejouée pour vérifier.
- **Passe de relecture : 7 défauts réels supplémentaires**, dont un *oracle d'inventaire inter-locataires* (les ids de rayon sont publics, la vérification de propriété passait après le comptage) et un `?q=%` qui renvoyait tout le catalogue (entrée brute injectée dans un `ILIKE`).

**Phase 3 — Panier → commande → paiement** (11 routes) — *code complet, non vérifié contre Stripe*
- Moteur de prix pur et testable : TPS 5 % + TVQ 9,975 % sur la **même** base (non composées — le Québec a déharmonisé en 2013), sur le sous-total seul, livraison ajoutée hors taxe.
- **Le panier ne transporte aucun prix** : ids et quantités uniquement. Tout est retrouvé côté serveur.
- **Stripe est interrogé, jamais cru sur parole** : statut, montant, devise **et** propriétaire de l'intent revérifiés avant écriture ; `stripe_payment_intent_id` UNIQUE rend l'opération idempotente.
- Décrément de stock dans la transaction de la commande, transitions de statut par table d'autorisations (un marchand ne peut pas passer `ready → delivered` et déclencher fidélité et paie coursier sans que personne n'ait rien porté).
- **À dire clairement : aucun PaymentIntent n'a jamais été créé** — il n'y a pas de clé Stripe de test dans cet environnement. Le chemin de paiement est typé, booté, structurellement exercé, mais l'aller-retour reste à prouver.

**Phase 4 — Fidélité, parrainage, coupons**
- Grand livre **append-only** : un solde est une somme de mouvements, jamais une colonne stockée.
- Les taux deviennent des **paramètres administrables** (le CDC parle de « modifier les règles ») ; `DOUBLE_POINTS_ACTIVE` gagne une **fenêtre de validité** — un interrupteur oublié en position haute doublerait les points indéfiniment.
- **Deux bugs trouvés en exécutant, pas en lisant** : (1) un `insert().select()` Drizzle qui aurait planté à **chaque** utilisation de coupon (accepté par `tsc`, refusé par `.toSQL()`) ; (2) une limite d'usage qui ne limitait rien — sous READ COMMITTED, deux paiements concurrents voyaient chacun de la place. Démontré contre la vraie base, remplacé par un compteur atomique, re-vérifié (3 demandes contre une limite de 2 → exactement 2).
- **Les règles de coupons sont des hypothèses** : le devis les vend, rien ne les spécifie. Elles sont construites et documentées, chacune modifiable en une ligne — à confirmer avec le client (voir §4).

**Phase 5 — Coursiers, dispatch et suivi** (14 routes)
- **La boucle de dispatch quitte le téléphone du coursier.** Elle tournait côté client, ce qui rendait chaque garantie consultative : une app en arrière-plan était invisible du répartiteur. Elle tourne maintenant serveur toutes les 5 s, classement fait **en SQL**.
- L'éligibilité devient une vraie question : approuvé **et** en service **et** vu récemment **et** pas déjà sur une course **et** à moins de 15 km. Ajout de `is_online` / `last_seen_at` (« en ligne » n'était qu'une mémoire client).
- **Le code de remise devient un secret** : il était dérivé de l'id de commande, qui circule dans les URLs et les notifications. Il est désormais tiré au hasard, stocké, comparé côté serveur.
- **La preuve de livraison est réellement conservée** — la signature dessinée n'était persistée nulle part.
- Paie **figée à la livraison**, jamais re-dérivée ; agrégats de revenus bucketés en **heure de Montréal** (une course de 20h locale est 00h UTC le lendemain).

**Phase 6 — Litiges, rôle admin, remboursements**
- Le rôle `admin` existe enfin, lu depuis `profiles.role` et non depuis une claim JWT (un jeton survit à une révocation).
- Les litiges peuvent être **tranchés** : note obligatoire, remboursement Stripe optionnel. Les incidents coursiers peuvent être clos (ils n'avaient aucun champ statut — un signalement restait là pour toujours).
- **La faille critique** : un simple utilisateur connecté pouvait exécuter `update profiles set role = 'admin' where id = auth.uid()` via PostgREST, et le rôle tenait. **C'est exactement le bug de la Phase 2, sur une table qu'on n'avait pas ré-auditée.** Bénin tant que `role` ne choisissait qu'un écran d'accueil ; critique à l'instant où la Phase 6 donne aux admins la résolution de litiges et les remboursements Stripe. Corrigé (`0022`), attaque rejouée.

**Phase 8 — API back-office admin**
- Files d'approbation, annuaire, réglages. Nouveau statut **`rejected`**, délibérément distinct de `suspended` : dire à un marchand que la boutique qu'il n'a jamais ouverte a été « suspendue » est faux pour lui comme pour un auditeur.
- Les transitions sont une table, et l'intéressant est ce qu'elle **interdit** : un dossier rejeté ne peut pas être approuvé plus tard, un dossier en attente ne peut pas être suspendu, une boutique approuvée ne peut pas être rejetée, rien ne revient à `pending`, et approuver deux fois est refusé (ça écraserait le relecteur et l'horodatage qui *sont* la piste d'audit).
- **Tout rejet et toute suspension exigent un motif écrit** — un marchand à qui l'on dit seulement « rejeté » n'a rien à corriger et rien à contester.
- Suspendre un coursier le **retire du service dans la même écriture**, sinon il reste dans le pool de dispatch.

**Vérifié en fin de session :** `tsc`, lint, build, aucune dérive de schéma ; **118 tests / 12 fichiers** ; **83 routes** mappées au boot ; toutes les routes `/admin` renvoient 401 sans jeton ; `get_advisors(security)` : **zéro WARN**. RLS prouvée en direct à chaque phase avec de vraies lignes (un client voit ses 4 mouvements et 0 de son parrain ; le coursier perdant la course voit 0 livraison ; se voler une course, fixer sa propre paie ou approuver son propre dossier sont tous **REFUSÉS**).

**Doc mise à jour :** `docs/BACKEND-BUILD-PHASES.md` (+92 / −31) — tableau des phases, la règle « RLS filtre les lignes, pas les colonnes », et les questions client rouvertes. **Pas encore commitée.**

### 3. 🧾 La Ménagère Paris — retours client sur paiement et facturation

Deux retours traités bout en bout dans la soirée.

**a) « Des commandes impayées apparaissent dans le back-office »** (`c2cdcee`, 595 insertions)
- La commande était insérée **avant** le paiement et restait « impayée » pour toujours si le client refermait la feuille de paiement Stripe — le tableau de bord se remplissait de paniers abandonnés traités comme des commandes.
- Le panier et le PaymentIntent sont maintenant mis en attente dans `order_drafts` (migration `0040`) et ne deviennent une vraie ligne `orders` payée **qu'une fois Stripe confirmé** — soit par l'appel de confirmation du client, soit par le webhook en filet de sécurité.
- Ajout d'une **confirmation d'annulation** et d'un garde-fou sur le retour arrière de l'écran de paiement.

**b) « Il faut une facture, et le client doit pouvoir choisir »** (`dbf7d99`, 1 730 insertions)
- **Facture PDF de marque générée après paiement** et stockée **en privé par commande** (migration `0041`), plutôt qu'envoyée par email d'office.
- L'écran de confirmation propose **Télécharger** ou **Recevoir par email** au lieu de supposer l'email. Le même composant est réutilisé sur le détail de commande et sur un nouvel écran d'historique **« Paiements & factures »**.
- Migration `0042` : identité d'entreprise en réglages (SIRET, TVA intracommunautaire, coordonnées) — ce qu'une facture française doit porter.
- Texte de confirmation retravaillé en véritable remerciement (« Merci pour votre confiance », puis le rappel de commande) plutôt qu'un accusé de réception.

---

## ⚠️ Points d'attention / en cours

1. **Le dépôt `sougouba-api/` n'est pas encore versionné** — tout le backend (99 fichiers TypeScript, 23 migrations) est *untracked*, zéro commit. À initialiser et pousser en priorité.
2. **`docs/BACKEND-BUILD-PHASES.md` modifié mais non commité** côté dépôt mobile.
3. **L'app mobile n'est branchée sur aucune de ces API** — tous les écrans lisent encore la couche mock `data/api/*`. La bascule est conçue pour être bon marché, mais elle n'a pas commencé, et aucune porte de revue de phase ne peut être franchie de bout en bout tant qu'elle n'a pas lieu.
4. **Audit des privilèges de colonne à faire avant la Phase 7** : toute table dont les policies précèdent la migration `0009` a potentiellement le même trou. `profiles` a été trouvée comme ça, ouverte depuis la Phase 1.
5. **Aucun journal d'audit admin** : un administrateur peut changer le taux de commission sans que rien n'enregistre qui ni quand.
6. **Anti-fraude parrainage absente** — le second garde-fou prévu est un numéro de téléphone vérifié ; sans lui, une personne avec deux emails touche les deux côtés. Chaque paiement de parrainage non vérifié est journalisé en attendant.
7. Limites assumées côté coursiers : ordonnanceur **mono-instance**, ETA à vol d'oiseau (en attente de Mapbox), tarifs coursiers encore provisoires.

## 🔑 Bloquants à débloquer côté client / infra

| Élément | Bloque |
|---|---|
| `DATABASE_URL` (Supabase, connexion poolée) | Faire tourner l'API pour de vrai |
| Clé **Stripe mode test** | La porte de revue de la Phase 3 — aucun paiement n'a jamais été joué |
| `MAPBOX_SECRET_TOKEN` (clé `sk.`, pas `pk.`) | Géocodage et vraies durées de trajet |
| Décision de cible de déploiement | Instance déployée, même de dev |
| Compte Stripe + Connect | Phase 7 (commission 12 %, abonnement 70 $/mois, paie coursiers) |

## ❓ À confirmer avec le client (Salif Eric Sogodogo)

- **Règles de coupons** — construites sur hypothèses : remise sur le **sous-total seul**, `percentage` lu en pourcent, **un coupon par commande**, cumul possible avec les points (chacun calculé sur le sous-total d'origine, somme plafonnée), `usage_limit` compté **tous clients confondus** sans limite par client.
- **Panier mono-boutique** — tranché à « une boutique par commande » et construit ainsi, conformément à l'app ; le devis dit « panier & commandes multi-commerces ». À **reconfirmer par écrit** avant lancement, la ligne budgétaire étant la sienne.
- **Qui branche le back-office `admin/` sur la vraie API ?** L'app existe et l'API Phase 8 aussi ; le devis facture le back-office dans le même contrat mais il ne fait pas partie du dépôt API.

---

**Résumé chiffré de la journée :** 1 application Next.js complète (19 écrans, ~5 300 lignes), 6 phases backend (83 routes, 118 tests, 17 migrations sur la nuit), 2 corrections issues de retours client La Ménagère (2 325 insertions), **2 escalades de privilèges réelles trouvées et fermées**.
