/** The shop specialties list: what a merchant picks at registration as the line under the shop's name. */
export const specialties = {
  title: 'Spécialités',
  description:
    'La liste proposée aux commerçants à l’inscription. Une spécialité retirée n’est plus proposée, mais les boutiques qui l’ont choisie la gardent.',
  actionFailed: 'Action impossible.',
  lists: {
    groceryTitle: 'Épiceries',
    groceryHint: 'Le type de commerce : épicerie africaine, boucherie halal…',
    restaurantTitle: 'Restaurants',
    restaurantHint: 'La cuisine servie : sénégalaise, éthiopienne…',
  },
  kpi: {
    groceryActive: 'Épiceries · actives',
    groceryActiveHint: 'Proposées aux épiceries',
    restaurantActive: 'Restaurants · actives',
    restaurantActiveHint: 'Proposées aux restaurants',
    shopsClassified: 'Boutiques classées',
    shopsClassifiedHint: 'Ayant choisi une spécialité de la liste',
    retired: 'Retirées',
    retiredHint: 'Gardées par les boutiques qui les ont choisies',
  },
  list: {
    empty: 'Aucune spécialité.',
    nameFr: 'Nom en français',
    nameEn: 'Nom en anglais',
    renameReach: {
      one: 'Le nouveau nom s’affichera sur {count} boutique.',
      other: 'Le nouveau nom s’affichera sur {count} boutiques.',
    },
    retiredBadge: 'Retirée',
    shopCount: { one: '{count} boutique', other: '{count} boutiques' },
    moveUp: 'Monter',
    moveDown: 'Descendre',
    rename: 'Renommer',
    retire: 'Retirer',
    reactivate: 'Réactiver',
  },
  toast: {
    added: '« {name} » ajoutée.',
    renamed: 'Spécialité renommée.',
    retired: '« {name} » retirée.',
    reactivated: '« {name} » réactivée.',
  },
};
