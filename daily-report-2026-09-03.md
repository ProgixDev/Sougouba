# 📋 Daily Report — Sougouba & La Ménagère Paris

**Date :** 03/09/2026
**Développeur :** Mohamed
**Note :** Journée presque entièrement Sougouba, et essentiellement consacrée à **fermer la liste des points d'attention d'hier**. Le dépôt backend est enfin versionné, la Phase 7 (argent) est écrite, quatre bloquants sont tombés — dont Stripe et Mapbox — les pages légales du site existent, et en fin de soirée **le back-office admin a été débranché de ses mocks pour lire la vraie API**. Deux petites suites côté La Ménagère Paris.

---

## ✅ Travail effectué

**Faits marquants :**
- 📦 **`sougouba-api` mis sous git** — 160 fichiers, 57 854 lignes. Le risque n°1 du rapport d'hier (tout le backend en *untracked*) est levé. **16 commits dans la journée.**
- 💳 **Phase 7 « Argent » écrite** — analytics marchand, commission 12 % via Stripe Connect, onboarding marchands/coursiers, virements coursiers hebdomadaires.
- ✅ **La porte de revue Stripe de la Phase 3 est franchie** — `npm run verify:stripe`, **12/12** contre le vrai Stripe : un PaymentIntent créé, un paiement, un remboursement, et **7 refus démontrés**.
- 🗺️ **Mapbox débloqué sans rien demander au client** — le token secret était déjà dans le dépôt mobile. Premier endpoint vérifié de bout en bout contre un vrai service externe.
- 📒 **Journal d'audit administrateur** — append-only, imposé par un trigger, dans la transaction de chaque décision. C'était le point 5 des « en cours » d'hier.
- 🛡️ **Limitation de débit** avec budgets par route et un vrai 429, plus **une 4ᵉ escalade de privilèges** trouvée et fermée (planter un produit dans le rayon d'un concurrent).
- ⚖️ **Pages légales du site** (CGU + confidentialité, cadre Loi 25 québécois) et **les durées de conservation deviennent du code**, pas une promesse.
- 🔌 **Le back-office admin lit la vraie API** — authentification Supabase réelle, plus une seule lecture de `localStorage` côté super-admin.

---

### 1. 📦 Sougouba — Le backend entre dans git, et la Phase 7 est écrite

**Le dépôt est versionné** (`8d34cb7`, 14h01) : 160 fichiers, 57 854 insertions, tout l'historique des phases 0 à 8 dans un premier commit. Puis 15 commits dans la journée. Le point le plus urgent du rapport d'hier est fermé.

**Audit des privilèges de colonne** (migration `0024`) — lancé parce que la faille de la Phase 6 sur `profiles` était une **classe** de bug, pas un accident. Une requête sur `information_schema.role_column_grants` recense toutes les tables où un droit d'écriture couvre toutes les colonnes ; elle est conservée dans la migration pour que le prochain audit soit un copier-coller. **Deux trouvailles :**
- **`addresses.lat`/`lng` étaient modifiables par leur propriétaire, et ça coûte de l'argent.** Démontré comme exploit réel : le client déplace ses propres coordonnées à 0,03 km d'une boutique, la livraison passe de **8,99 $ à 2,99 $**, pendant que rue, ville et code postal — là où le coursier est réellement envoyé — indiquent toujours une adresse **à 16 km**. C'est le coursier qui paie : `distance_km` et donc `earnings_cad` sortent des mêmes coordonnées. Il roule 16 km, il est payé pour 0,03. Droit révoqué.
- **Le correctif Phase 2 sur `products.vendor_id` n'avait rien fait.** `0009` exécutait un `revoke update (vendor_id)`, et **Postgres ignore une révocation de colonne tant qu'un droit au niveau table subsiste**. La ligne voisine pour `vendors` était juste ; celle-ci non, et la colonne est restée modifiable pendant onze migrations. Rien n'était exploitable au travers (le `WITH CHECK` de la policy tenait), mais *un correctif qui a l'air appliqué et ne l'est pas est pire que pas de correctif* : il empêche qu'on regarde à nouveau.

**Phase 7 — Argent** (migrations `0025`, `0026`) :
- **Analytics marchand** (`GET /vendors/me/analytics`), vérifiée sur données réelles. **Le chiffre d'affaires, c'est le sous-total produits, pas le total commande** : sur les fixtures elle affiche **150,00 $** là où `total_cad` dirait **180,45 $** — 20 % de surévaluation. La livraison paie le coursier, la TPS/TVQ est collectée pour l'État ; un tableau de bord qui appelle ça « Recettes » ment au marchand. Les commandes annulées sortent du CA mais restent comptées dans les statuts (une boutique a besoin de son taux d'annulation).
- **La commission de 12 %** voyage sur le PaymentIntent en `application_fee_amount` + `transfer_data.destination` (destination charge : Stripe reverse lui-même la part du marchand). Prise **sur le sous-total**, pour la même raison. Elle n'est attachée **que si le marchand a un compte Connect** — prélever vers un compte incapable de recevoir ferait échouer tout le paiement, donc une boutique approuvée mais sans banque ne pourrait plus vendre.
- **Onboarding Connect** en comptes Express (Stripe héberge la vérification d'identité et le bancaire), **reprenable** : l'id de compte est stocké dès la première tentative, pour que le client qui abandonne à mi-chemin continue au lieu d'en créer un second.
- **Virements coursiers** — ce dont le prototype n'avait aucun équivalent : `pendingPayoutCad` n'était qu'un affichage, aucun centime n'avait jamais bougé. L'argent part maintenant en **Transfer Stripe**, vendredi 3h00 heure de Montréal. Trois choix : « dû » se lit `paid_out_at is null` **sur la course** et non sur une plage de dates (une course ratée par un lot en échec repasse au suivant au lieu de disparaître) ; **virer d'abord, marquer payé ensuite** ; **clé d'idempotence par coursier**, pour qu'un lot rejoué ne paie pas deux fois. Un coursier sans onboarding est journalisé et sauté, jamais bloquant pour les autres.
- RLS sur les deux tables d'argent : chaque partie lit la sienne, **personne n'écrit**. Un coursier qui pourrait passer son `courier_payouts.status` à `paid` serait un coursier qui solde sa propre facture.

### 2. 🛡️ Sougouba — Durcissement : audit, débit, et une 4ᵉ escalade

**Journal d'audit administrateur** (`0028`) — le manque signalé hier. Un administrateur pouvait changer le taux de commission ou clore une journée double-points sans que rien n'enregistre qui ni quand ; une boutique suspendue puis réhabilitée ne laissait aucune trace de sa suspension. `admin_audit_log` enregistre acteur, action, sujet, motif écrit et un diff `{champ: {avant, après}}`, câblé sur **les dix routes admin mutantes**, chacune **dans la transaction du changement qu'elle décrit**. Trois décisions :
- **Append-only par trigger, pas par droit** : l'API se connecte en propriétaire de la table, une révocation contre soi-même est ignorée. Un trigger `before update or delete` refuse les deux pour tous les rôles, propriétaire compris. *Un journal que l'application auditée peut réécrire ne prouve rien.*
- **Les noms sont figés, pas joints** : un admin peut être renommé, une boutique supprimée ; le journal doit dire ce qui était vrai à ce moment-là, une jointure dit ce qui est vrai aujourd'hui.
- **Un garde-fou structurel plutôt que de la discipline** : `audit.spec.ts` lit les métadonnées de routes de Nest et exige une action auditée par route mutante. Une future route admin sans audit **casse le build** au lieu de partir en production muette.

**Limitation de débit** — budgets en un seul tableau lisible d'un coup : `/geo` 20/min (facturé par Mapbox), `/courier/offers` 20/min (écriture disputée), `/support` 15/min (appel modèle payant), `/orders` 40/min (finit chez Stripe), `/admin` 120/min, tout le reste 300/min. `@fastify/rate-limit` retenu plutôt que `@nestjs/throttler`, dont la version courante ne s'installe sur Nest 12 qu'en `--legacy-peer-deps`. **Un bug que le typecheck ne pouvait pas voir : le 429 sortait en 500** — le plugin lève une `Error` nue que le filtre d'exceptions du projet traite comme une erreur interne. Le budget était appliqué et le statut mentait, ce qui est pire que pas de limite : un client ne peut pas se calmer face à un 500. `/health` et le webhook Stripe sont exemptés, nécessairement.

**La 4ᵉ escalade, trouvée par attaque** (`0027`) : un marchand avec une session Supabase ordinaire pouvait insérer un produit dans **sa propre** boutique en pointant `section_id` vers le **rayon d'un concurrent**. Les ids de rayon sont publics (la vitrine les liste aux visiteurs anonymes) et le filtre produits restreint sur `section_id` indépendamment de `vendor_id` — la ligne plantée s'affiche donc dans le rayon de l'autre boutique, sous un nom et un prix que son propriétaire n'a pas fixés et ne peut pas supprimer. `assertOwnedRefs` refusait déjà ça côté API, *et c'est exactement le problème* : la garde protégeait la route et ne disait rien du chemin PostgREST pour lequel l'app mobile détient une session. Corrigé par une **clé étrangère composite `(section_id, vendor_id)`** plutôt qu'une révocation : la ligne incohérente devient irreprésentable pour tout écrivain, et les marchands gardent le droit de ré-étiqueter leurs rayons.

### 3. 🔓 Sougouba — Trois bloquants tombés

**Mapbox** — sur la liste des « à obtenir du client » depuis la Phase 1. Il n'y avait rien à obtenir : le `.env` du dépôt mobile portait déjà un token `sk.` sous le nom `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, et il géocode. Vérifié contre l'API Mapbox puis contre la nôtre : H2A 1A1 Montréal → 200 avec les bonnes coordonnées, H7N 1A1 Laval → 200, M5V 2T6 Toronto → 400 « ne dessert pas encore cette ville ». **Premier endpoint de cette API vérifié de bout en bout contre un vrai service externe.** ⚠️ Un secret fait désormais deux métiers : ce token est nominalement celui des *téléchargements* du SDK natif ; le tourner pour le build mobile couperait silencieusement le géocodage serveur. Un token serveur dédié avant le lancement, noté dans `.env.example`.

**`DATABASE_URL`** — le fichier `.env` pointait sur `127.0.0.1`, donc l'API n'avait jamais atteint de base. En travaillant la vraie chaîne de connexion, deux choses à garder :
- **L'hôte direct est en IPv6 uniquement** : `db.<projet>.supabase.co` publie un AAAA et **aucun A**, et cette machine n'a pas de route IPv6. La chaîne « connexion directe » que le tableau de bord propose en premier **ne peut pas marcher ici, quel que soit le mot de passe** — et elle échoue avec une erreur qui ressemble trait pour trait à un mauvais identifiant. Une demi-journée de débogage épargnée à qui branchera ça.
- **L'hôte du pooler a été confirmé, pas deviné** : un même mot de passe manifestement faux envoyé à chaque région, en lisant la différence entre « Tenant or user not found » (mauvaise région) et « password authentication failed » (bonne région). Un seul a répondu de la seconde façon : `aws-1-eu-west-1`, utilisateur `postgres.<ref-projet>` — la forme du nom compte, un `postgres` nu donne la même erreur que la mauvaise région.
- Il ne manque plus que **le mot de passe**, qui n'est pas récupérable par la connexion MCP et n'a rien à faire ailleurs que dans un `.env` ignoré par git.

**Stripe — la porte de revue de la Phase 3 est franchie** (18h30). Le document de plan disait depuis sa rédaction : *« aucun PaymentIntent n'a jamais été créé »*. C'est fait, avec un paiement, un remboursement et sept refus. `npm run verify:stripe` — **12/12** :

| Cas | Résultat |
|---|---|
| Création d'intent | `pi_…` créé pour les 2 599 ¢ calculés par le serveur |
| Intent impayé | **REFUSÉ** « paiement non abouti » |
| Intent payé et conforme | **ACCEPTÉ** |
| Panier plus gros que l'intent | **REFUSÉ** « le montant ne correspond pas » |
| Intent d'un autre client | **REFUSÉ** |
| Id d'intent inconnu | **REFUSÉ** |
| Remboursement | `re_…` réussi |
| Remboursement rejoué | **REFUSÉ** par Stripe |
| Webhook, signature correcte / falsifiée / corps altéré / sans en-tête | **ACCEPTÉ / REFUSÉ / REFUSÉ / REFUSÉ** |

Les trois refus de montant, de propriétaire et d'id sont les preuves qui comptent : chacun est une façon différente d'avoir un panier de courses à moins que son prix, et chacun est maintenant démontré fermé **contre le vrai Stripe** plutôt qu'argumenté depuis le code. Le cas « corps altéré, même signature » est ce qui justifie `rawBody: true`. **Écrit comme script** (`scripts/verify-stripe.mjs`) et non fait à la main une fois : il pilote le vrai `PaymentsService` depuis `dist/`, refuse de tourner sur autre chose qu'une clé `sk_test_`, et la porte de revue devient donc une commande rejouable après chaque changement du chemin de paiement. Aucun secret n'est commité (les deux arbres ont été scannés avant commit).

Deux choses que ça a levées : **Connect n'est pas activé sur le compte Stripe** (`accounts.create` refuse — étape d'inscription au tableau de bord, pas un défaut ; la Phase 7 reste donc non exercée), et un bug du script lui-même — `??` n'attrape pas une chaîne vide, si bien que les trois contrôles de signature se déclaraient « non configurés » et que le cas « signature falsifiée » passait **pour une mauvaise raison**. Attrapé uniquement parce que le cas d'acceptation échouait à côté : c'est l'argument pour tester qu'un contrôle *accepte*, et pas seulement qu'il refuse.

### 4. ⚖️ Sougouba — Pages légales du site et durées de conservation

**Les deux pages légales existent** (`web/`), c'était un bloquant de lancement déclaré du site vitrine. Elles sont **écrites depuis ce que l'app et l'API font réellement** — TPS/TVQ sur la même base, frais de livraison par bande de distance fixés par la plateforme et non par la boutique, panier mono-boutique, 12 % + 70 $/mois, Stripe qui ne nous remet jamais un numéro de carte, le cycle de vie du GPS coursier, la RLS comme frontière d'accès. Rien n'est repris d'un modèle générique. Cadrage québécois : responsable de la protection des renseignements nommé, droits Loi 25 (accès, rectification, portabilité, déindexation), la CAI comme recours, l'évaluation hors Québec, le registre d'incidents.

Deux garde-fous délibérés : **neuf faits que seul le client détient** (entité légale, adresse, NEQ, responsable vie privée, région d'hébergement, durées de conservation, politiques d'annulation) sont **marqués en surbrillance ambre plutôt qu'inventés**, et `REVIEWED = false` tant qu'un juriste n'est pas passé — les deux pages portent alors un bandeau « brouillon », sont servies en `noindex` et restent hors du sitemap. Espacement typographique fr-CA appliqué au rendu (fine insécable avant : ; ! ? % $).

**Les durées de conservation deviennent du code** (migration `0029`). Deux valeurs étaient marquées « à décider » dans la politique alors que ce n'était pas vraiment au client de décider : **rien ne purgeait** `courier_locations` ni `delivery_proofs`, donc toute durée publiée aurait été une affirmation que le code ne tenait pas.
- `courier_location_retention_days` = **30**. Les trois usages de la trace GPS sont tous éphémères (un point qui bouge, le classement du coursier le plus proche, la distance qui fixe la paie — déjà figée sur la livraison). Ce qui reste est un relevé minute par minute des déplacements d'une personne nommée : le plus sensible du système, et celui qui a le moins de raisons de persister.
- `delivery_proof_retention_days` = **365**, plus long exprès : c'est la preuve qui répond à « ça n'est jamais arrivé », elle doit survivre au délai pour le dire.
- Les deux vivent dans `platform_settings`, donc **le chiffre publié et le chiffre appliqué sont la même ligne** et ne peuvent pas diverger — et les modifier est un réglage admin ordinaire, donc déjà audité par `0028`. Attention notée : supprimer la ligne de preuve sans supprimer l'objet dans le bucket détruit l'index vers la photo d'une porte d'entrée en laissant la photo.

La région d'hébergement est renseignée (Irlande) et les durées sont désormais de vrais nombres dans la politique.

### 5. 🔌 Sougouba — Le back-office admin passe sur la vraie API (23h51 → 00h11)

Côté API, six commits pour donner au tableau de bord ce qu'il lui fallait : **CORS** (absent, c'était la seule chose entre le back-office et l'API — enregistré **avant** le limiteur de débit, sinon un 429 partirait sans en-tête `Access-Control-Allow-Origin` et le navigateur signalerait une erreur CORS opaque au lieu d'une limite de débit) ; une **vue en lecture seule de `auth.users`** pour l'email des comptes ; le **détail de commande** (vue d'arbitrage : articles, fil de statuts, livraison, coursier, preuve, litige, incident) ; les **détails marchand / coursier / utilisateur** et la recherche globale ; le **détail litige et incident**, avec enfin le **nom du coursier** dans la file des incidents (un écran sur un coursier qui n'arrive pas à livrer ne savait pas nommer le coursier) ; et un **seed de développement** — le projet Supabase était migré mais vide, donc un câblage correct aurait été indiscernable d'un câblage cassé. 15 boutiques, 11 coursiers, ~240 commandes sur 60 jours. Sa sécurité tient sur une seule chose : chaque ligne créée porte un id en `5eed…` et la purge ne supprime que ça — le script est **structurellement incapable** de supprimer une ligne qu'il n'a pas écrite.

⚠️ **`GET /admin/orders` a été cassé volontairement** : il renvoyait un tableau nu là où toutes les autres listes renvoient une enveloppe paginée, et les montants en chaîne `numeric` — ce qui triait « 9,00 $ » au-dessus de « 85,00 $ », un vrai bug et pas un choix de style. Cassable sans coût : le seul consommateur est le tableau de bord non publié, qui ne l'avait jamais appelé.

Côté dashboard, trois commits :
- **Authentification Supabase réelle.** Le login était une comparaison de chaîne en dur écrivant un objet de session dans `localStorage` — un *écran* de login, pas un login : n'importe qui pouvait poser la clé à la main, et ça ne produisait aucun identifiant. `signIn` obtient maintenant un vrai jeton, vérifié par l'API contre le JWKS du projet, puis `profiles.role = 'admin'` **relu en base à chaque requête** — révoquer quelqu'un prend effet immédiatement, pas à l'expiration du jeton. **L'autorité est du côté de l'API** : cacher la barre latérale est une politesse, un non-admin qui force une route reçoit un 403 sur chaque appel.
- **Commandes et statistiques.** Les filtres passent côté serveur (le mock les ignorait et re-filtrait le tableau complet en mémoire — inoffensif tant que tout tenait dans le navigateur, faux dès qu'une page est paginée). Les pastilles de la barre latérale : **une requête au lieu de quatre listes complètes lues pour leur `.length`**. Et tous les appels ont gagné un chemin d'échec — le mock ne pouvait pas échouer, donc aucun `.then()` n'en avait, et un échec HTTP laissait le squelette tourner indéfiniment.
- **Tout le reste** (marchands, coursiers, utilisateurs, litiges, incidents, réglages, recherche). Le super-admin ne lit plus `localStorage` du tout. Quatre choses que la vraie API a mises au jour, que le mock avait discrètement fausses : **rejeter et suspendre étaient le même appel** (le bouton « Suspendre » appelait la fonction de rejet, et une candidature refusée était ensuite indiscernable d'une boutique retirée) ; **clore un incident n'exigeait aucun motif** ; **les litiges n'ont pas d'id propre** (la clé est la commande, le mock inventait `dp_<commande>`) ; **les motifs de rejet sont une colonne**, pas deux dictionnaires `localStorage` parallèles.

**Le portail marchand reste sur les mocks, délibérément** : les endpoints admin sont derrière `AdminGuard`, une session marchand n'a aucun jeton qui les atteigne, chaque écran ferait 403. Le brancher demande des endpoints scopés marchand qui n'existent pas encore.

### 6. 🧾 La Ménagère Paris — suites de la veille

Deux petits commits en soirée, dans le prolongement de la facturation livrée hier : un **logo encodé en base64 optimisé pour l'email** (net sur écran retina, nettement plus léger que la version print, destiné à être inséré en pièce CID inline dans l'envoi de facture), et la **suppression du `.env` obsolète**, la configuration étant désormais gérée dans le tableau de bord Supabase.

---

## ✅ Fermé aujourd'hui (liste d'hier)

| Point d'hier | État |
|---|---|
| Dépôt `sougouba-api` non versionné | **Fermé** — 16 commits |
| `docs/BACKEND-BUILD-PHASES.md` non commité | **Fermé** |
| Audit des privilèges de colonne avant Phase 7 | **Fait** — 2 trouvailles, puis une 3ᵉ par attaque |
| Aucun journal d'audit admin | **Fermé** — `0028` |
| Bloquant Mapbox | **Fermé** — le token existait déjà |
| Bloquant clé Stripe de test | **Fermé** — porte de revue Phase 3 franchie, 12/12 |
| Admin non branché sur l'API | **Fermé côté super-admin** |

## ⚠️ Points d'attention / en cours

1. **`sougouba-api/PROGRESS.md` est en retard sur la réalité** : il a été commité à 16h51 et affirme encore qu'« aucun appel Stripe n'a jamais été fait », alors que la porte a été franchie à 18h30 et que le document de plan côté dépôt mobile, lui, a été mis à jour. À réaligner — c'est le fichier qu'on lit en début de session.
2. **Connect n'est pas activé sur le compte Stripe** : toute la Phase 7 (commission, onboarding, virements coursiers) reste **écrite et jamais exécutée**. C'est aujourd'hui la plus grande surface non testée du projet. Activation à faire au tableau de bord Stripe.
3. **Il manque toujours le mot de passe de la base** pour que l'API atteigne Postgres. Tout le reste de la chaîne de connexion est établi et documenté.
4. **L'app mobile n'est branchée sur aucune de ces API** — inchangé depuis hier ; tous les écrans lisent encore `data/api/*`.
5. **Le portail marchand du back-office est encore sur mocks**, faute d'endpoints scopés marchand.
6. **Le token Mapbox fait deux métiers** (téléchargement du SDK natif *et* géocodage serveur) : le tourner casserait le second sans prévenir. Token serveur dédié à prévoir.
7. Reportés assumés vers la Phase 10 : **ordonnanceurs mono-instance** (dispatch et virements supposent une seule réplique) et **vérification du téléphone pour le parrainage**, seul garde-fou anti-fraude que le cahier des charges demande et que rien n'applique.
8. Détail à connaître : **31 migrations appliquées pour 30 fichiers** — une migration Supabase sans fichier (renommage de contraintes) ; ce n'est **pas** de la dérive de schéma et c'est documenté, mais les deux historiques ne sont pas comparables ligne à ligne. Le contrôle de dérive de la CI ne voit pas cette classe de différence.

## 🔑 Bloquants restants

| Élément | Bloque |
|---|---|
| Mot de passe de la base (pooler `aws-1-eu-west-1`) | Faire tourner l'API contre la vraie base |
| **Activer Stripe Connect** au tableau de bord | Toute la Phase 7 : commission 12 %, onboarding, virements coursiers |
| Décision de cible de déploiement | Instance déployée, même de dev |
| Relecture juridique des deux pages légales + les 9 faits surlignés | Publication du site (pages en `noindex` d'ici là) |

## ❓ À confirmer avec le client (Salif Eric Sogodogo)

Inchangé depuis hier, rien n'est arrivé sur ces points : **règles de coupons** (construites sur hypothèses), **panier mono-boutique** (à reconfirmer par écrit), et **qui branche le portail marchand** du back-office. S'y ajoutent les **neuf faits surlignés** des pages légales (entité, adresse, NEQ, responsable vie privée, politiques d'annulation) — ils sont délibérément laissés vides plutôt qu'inventés.

---

**Résumé chiffré de la journée :** 16 commits backend (dont le commit initial, 160 fichiers / 57 854 lignes) + 10 commits côté dépôt mobile/web + 2 côté La Ménagère · 6 nouvelles migrations (`0024`→`0029`) · Phase 7 écrite · **7 nouveaux fichiers de tests** (12 → 19) · 90 routes puis 8 endpoints admin de plus · **12/12 au harnais de vérification Stripe** · **1 nouvelle escalade de privilèges** trouvée et fermée, plus **2 trouvailles d'audit** dont un correctif qui n'avait jamais rien corrigé.
