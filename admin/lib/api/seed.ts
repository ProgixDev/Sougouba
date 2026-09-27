import { vendors as approvedVendors } from '../../../data/seed/vendors';
import { couriers as approvedCouriers } from '../../../data/seed/couriers';
import { users as seedUsers } from '../../../data/seed/users';
import type {
  Vendor,
  Courier,
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusEvent,
  User,
  Address,
  DisputeReason,
  CourierIssueReason,
} from '../types';

// ── deterministic randomness, ported from data/utils/random.ts ─────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)];
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── extra pending/suspended merchants & couriers, so the approval queues
// have real content — the real seed data ships 100% pre-approved ─────────────
const PENDING_VENDORS: Vendor[] = [
  {
    id: 'vnd_pending_niayes',
    slug: 'epicerie-niayes',
    name: 'Épicerie des Niayes',
    vendorType: 'grocery',
    specialty: { fr: 'Épicerie sénégalaise' },
    logoUrl: '',
    coverUrl: '',
    categoryIds: [],
    city: 'Montréal',
    neighborhood: 'Saint-Michel',
    address: {
      id: 'addr_pending_1', label: 'Boutique', street: '7830 Rue Saint-Michel', city: 'Montréal',
      postalCode: 'H2A 2Z8', lat: 45.5605, lng: -73.6011, isDefault: true,
    },
    rating: 0, reviewCount: 0, deliveryEtaMin: 30, isHalalCertified: true,
    hours: Array.from({ length: 7 }, (_, day) => ({ day, open: '09:00', close: '21:00' })),
    sections: [{ id: 'sec_niayes_1', name: { fr: 'Fruits & légumes' } }],
    ownerId: 'usr_owner_niayes',
    status: 'pending',
    registration: {
      neq: '1345 892 013', contactName: 'Cheikh Diop', contactPhone: '+1 514 555 0921',
      submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  },
  {
    id: 'vnd_pending_zanzibar',
    slug: 'restaurant-zanzibar',
    name: 'Restaurant Zanzibar Grill',
    vendorType: 'restaurant',
    specialty: { fr: 'Cuisine est-africaine' },
    logoUrl: '',
    coverUrl: '',
    categoryIds: [],
    city: 'Laval',
    neighborhood: 'Chomedey',
    address: {
      id: 'addr_pending_2', label: 'Boutique', street: '2900 Boulevard Le Corbusier', city: 'Laval',
      postalCode: 'H7L 5R9', lat: 45.5687, lng: -73.7534, isDefault: true,
    },
    rating: 0, reviewCount: 0, deliveryEtaMin: 35, isHalalCertified: true,
    hours: Array.from({ length: 7 }, (_, day) => ({ day, open: '11:00', close: '22:00' })),
    sections: [{ id: 'sec_zanzibar_1', name: { fr: 'Plats' } }],
    ownerId: 'usr_owner_zanzibar',
    status: 'pending',
    registration: {
      neq: '1298 447 662', contactName: 'Amina Suleiman', contactPhone: '+1 450 555 0447',
      mapaqNumber: 'MAPAQ-88213', submittedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    },
  },
  {
    id: 'vnd_pending_savane',
    slug: 'boulangerie-savane',
    name: 'Boulangerie La Savane',
    vendorType: 'restaurant',
    specialty: { fr: 'Pâtisserie & café' },
    logoUrl: '',
    coverUrl: '',
    categoryIds: [],
    city: 'Montréal',
    neighborhood: 'Rosemont',
    address: {
      id: 'addr_pending_3', label: 'Boutique', street: '3560 Rue Beaubien Est', city: 'Montréal',
      postalCode: 'H1X 1G3', lat: 45.5567, lng: -73.5809, isDefault: true,
    },
    rating: 0, reviewCount: 0, deliveryEtaMin: 25, isHalalCertified: false,
    hours: Array.from({ length: 7 }, (_, day) => ({ day, open: '07:00', close: '19:00' })),
    sections: [{ id: 'sec_savane_1', name: { fr: 'Pâtisseries' } }],
    ownerId: 'usr_owner_savane',
    status: 'pending',
    registration: {
      neq: '1287 903 511', contactName: 'Grace Mbeki', contactPhone: '+1 514 555 0663',
      mapaqNumber: 'MAPAQ-77410', submittedAt: new Date(Date.now() - 20 * 3600000).toISOString(),
    },
  },
  {
    id: 'vnd_suspended_medina2',
    slug: 'depanneur-medina-express',
    name: 'Dépanneur Médina Express',
    vendorType: 'grocery',
    specialty: { fr: 'Dépanneur & épicerie' },
    logoUrl: '',
    coverUrl: '',
    categoryIds: [],
    city: 'Montréal',
    neighborhood: 'Ahuntsic',
    address: {
      id: 'addr_susp_1', label: 'Boutique', street: '1120 Rue Fleury Est', city: 'Montréal',
      postalCode: 'H2C 1P8', lat: 45.5453, lng: -73.6577, isDefault: true,
    },
    rating: 3.2, reviewCount: 41, deliveryEtaMin: 40, isHalalCertified: false,
    hours: Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '23:00' })),
    sections: [{ id: 'sec_susp_1', name: { fr: 'Épicerie' } }],
    ownerId: 'usr_owner_medina2',
    status: 'suspended',
    registration: {
      neq: '1156 220 984', contactName: 'Rachid Ouali', contactPhone: '+1 514 555 0388',
      submittedAt: new Date(Date.now() - 120 * 86400000).toISOString(),
    },
  },
];

const PENDING_COURIERS: Courier[] = [
  {
    id: 'crr_pending_hamza', userId: 'usr_courier_hamza', fullName: 'Hamza Rahimi', phone: '+1 514 555 0771',
    vehicle: 'scooter', plate: 'W82 LKQ', city: 'Montréal', postalCode: 'H2S 1P2',
    base: { lat: 45.5276, lng: -73.6104 }, rating: 0, deliveryCount: 0, status: 'pending',
    joinedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    insurance: { insurerName: 'Intact Assurance', policyNumber: 'INT-994215', expiry: '09/2027' },
  },
  {
    id: 'crr_pending_marie', userId: 'usr_courier_marie', fullName: 'Marie-Ange Fotso', phone: '+1 438 555 0512',
    vehicle: 'bike', city: 'Montréal', postalCode: 'H2J 2K5',
    base: { lat: 45.5228, lng: -73.5891 }, rating: 0, deliveryCount: 0, status: 'pending',
    joinedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 'crr_suspended_billal', userId: 'usr_courier_billal', fullName: 'Billal Nasser', phone: '+1 450 555 0299',
    vehicle: 'car', plate: 'M15 GTR', city: 'Longueuil', postalCode: 'J4K 2N1',
    base: { lat: 45.5372, lng: -73.5108 }, rating: 3.1, deliveryCount: 212, status: 'suspended',
    joinedAt: new Date(Date.now() - 200 * 86400000).toISOString(),
    insurance: { insurerName: 'Desjardins Assurances', policyNumber: 'DAG-114872', expiry: '02/2026' },
  },
];

// ── order items bank ─────────────────────────────────────────────────────
const ITEM_BANK: { name: string; price: number }[] = [
  { name: 'Mangue Kent', price: 3.49 },
  { name: 'Riz brisé parfumé (2kg)', price: 8.99 },
  { name: 'Piment antillais frais', price: 2.29 },
  { name: 'Couscous grain moyen', price: 5.49 },
  { name: 'Harissa artisanale', price: 4.99 },
  { name: 'Poulet fermier halal entier', price: 14.99 },
  { name: 'Merguez maison (500g)', price: 9.49 },
  { name: 'Thiéboudienne au poisson', price: 16.5 },
  { name: 'Mafé au boeuf', price: 15.0 },
  { name: 'Jus de bissap (1L)', price: 4.5 },
  { name: 'Accara (beignets de niébé)', price: 6.99 },
  { name: 'Assortiment de baklava', price: 12.0 },
  { name: 'Thé vert à la menthe', price: 5.99 },
  { name: 'Gigot d’agneau', price: 24.99 },
  { name: 'Fonio précuit', price: 6.49 },
];

const DISPUTE_REASONS: DisputeReason[] = ['missing_items', 'wrong_order', 'quality', 'late', 'other'];
const COURIER_ISSUE_REASONS: CourierIssueReason[] = [
  'customer_absent', 'wrong_address', 'access_problem', 'shop_not_ready', 'order_incomplete', 'other',
];

const ORDER_STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

function statusHistoryFor(finalStatus: OrderStatus, createdAt: Date): OrderStatusEvent[] {
  const flow = finalStatus === 'cancelled' ? ['pending', 'confirmed'] as OrderStatus[] : ORDER_STATUS_FLOW;
  const idx = finalStatus === 'cancelled' ? 1 : flow.indexOf(finalStatus);
  const events: OrderStatusEvent[] = [];
  for (let i = 0; i <= idx; i++) {
    events.push({ status: flow[i], at: new Date(createdAt.getTime() + i * 9 * 60000).toISOString() });
  }
  if (finalStatus === 'cancelled') events.push({ status: 'cancelled', at: new Date(createdAt.getTime() + 20 * 60000).toISOString() });
  return events;
}

/**
 * What the mock still provides, and only for the **merchant portal** — the
 * super-admin surface reads the real API now.
 *
 * The admin-only `disputes` and `courierIssues` collections are gone with it.
 * They existed to feed the back office's arbitration queues, which are served
 * by `GET /admin/disputes` and `GET /admin/courier-issues`; keeping a second,
 * differently-shaped copy here would only be something to drift. An order's own
 * `dispute`/`courierIssue` fields remain, because those belong to the mobile
 * `Order` type the portal renders.
 */
export interface Seed {
  vendors: Vendor[];
  couriers: Courier[];
  users: User[];
  orders: Order[];
}

let cached: Seed | null = null;

/** Built once per session (module scope), deterministically — same shape every fresh load. */
export function getSeed(): Seed {
  if (cached) return cached;

  const vendors = [...approvedVendors, ...PENDING_VENDORS];
  const couriers = [...approvedCouriers, ...PENDING_COURIERS];
  const users: User[] = seedUsers;
  const customers = users.filter((u) => u.role === 'customer');
  const liveVendors = approvedVendors; // orders only ever placed against approved shops
  const liveCouriers = approvedCouriers;

  const rng = mulberry32(hashString('sougouba-admin-seed-v1'));
  const orders: Order[] = [];

  let orderSeq = 0;
  const now = Date.now();
  const DAYS = 60;

  for (const vendor of liveVendors) {
    const orderCount = 14 + Math.floor(rng() * 20); // 14-33 orders per shop over 60 days
    for (let i = 0; i < orderCount; i++) {
      orderSeq += 1;
      const daysAgo = rng() * DAYS;
      const createdAt = new Date(now - daysAgo * 86400000);
      const customer = pick(rng, customers);

      // Weighted final status: mostly delivered, some cancelled, a few live in the last 2 days.
      let status: OrderStatus;
      if (daysAgo < 2 && rng() < 0.35) {
        status = pick(rng, ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']);
      } else if (rng() < 0.08) {
        status = 'cancelled';
      } else {
        status = 'delivered';
      }

      const itemCount = 1 + Math.floor(rng() * 4);
      const items: OrderItem[] = Array.from({ length: itemCount }, () => {
        const base = pick(rng, ITEM_BANK);
        const qty = 1 + Math.floor(rng() * 3);
        return { productId: `prd_mock_${hashString(base.name)}`, name: base.name, qty, unitPriceCad: base.price };
      });
      const subtotalCad = round2(items.reduce((sum, it) => sum + it.qty * it.unitPriceCad, 0));
      const gstCad = round2(subtotalCad * 0.05);
      const qstCad = round2(subtotalCad * 0.09975);
      const deliveryFeeCad = round2(4.99 + rng() * 4);
      const totalCad = round2(subtotalCad + gstCad + qstCad + deliveryFeeCad);
      const address: Address = {
        id: `addr_mock_${orderSeq}`, label: 'Domicile', street: vendor.address.street, city: vendor.city,
        postalCode: vendor.address.postalCode, lat: vendor.address.lat, lng: vendor.address.lng, isDefault: true,
      };

      const order: Order = {
        id: `ord_${orderSeq.toString(36)}`,
        customerId: customer.id,
        customerName: customer.fullName,
        vendorId: vendor.id,
        items,
        status,
        subtotalCad,
        gstCad,
        qstCad,
        deliveryFeeCad,
        totalCad,
        deliveryAddress: address,
        createdAt: createdAt.toISOString(),
        statusHistory: statusHistoryFor(status, createdAt),
      };

      if (status === 'delivered' || status === 'out_for_delivery') {
        const courier = pick(rng, liveCouriers);
        order.delivery = {
          courierId: courier.id,
          acceptedAt: new Date(createdAt.getTime() + 8 * 60000).toISOString(),
          pickedUpAt: new Date(createdAt.getTime() + 18 * 60000).toISOString(),
          ...(status === 'delivered' ? { deliveredAt: new Date(createdAt.getTime() + 40 * 60000).toISOString() } : {}),
          pickupEtaMin: 10, dropoffEtaMin: 18, distanceKm: round2(1.5 + rng() * 6),
          pin: String(1000 + Math.floor(rng() * 9000)), tipCad: round2(rng() * 5),
          earningsCad: round2(6 + rng() * 6),
        };

        // ~7% of completed deliveries get a courier issue report.
        if (status === 'delivered' && rng() < 0.07) {
          const reason = pick(rng, COURIER_ISSUE_REASONS);
          const messages: Record<CourierIssueReason, string> = {
            customer_absent: "Le client ne répondait pas à l'interphone ni au téléphone.",
            wrong_address: "L'adresse fournie ne correspondait à aucun bâtiment du secteur.",
            access_problem: "Immeuble verrouillé, aucun code d'accès fonctionnel.",
            shop_not_ready: "La commande n'était pas prête après 25 minutes d'attente au commerce.",
            order_incomplete: 'Un article du sac était manquant au moment du ramassage.',
            other: 'Incident signalé pendant la course.',
          };
          const at = new Date(createdAt.getTime() + 35 * 60000).toISOString();
          order.courierIssue = { reason, message: messages[reason], at };
        }
      }

      // ~9% of delivered/cancelled orders get a dispute.
      if ((status === 'delivered' || status === 'cancelled') && rng() < 0.09) {
        const reason = pick(rng, DISPUTE_REASONS);
        const messages: Record<DisputeReason, string> = {
          missing_items: 'Il manquait deux articles dans mon sac à la livraison.',
          wrong_order: "Ce n'est pas ce que j'ai commandé, les plats sont différents.",
          quality: 'Les produits reçus n’étaient pas frais.',
          late: 'La commande est arrivée avec plus de 45 minutes de retard.',
          other: 'Problème avec ma commande.',
        };
        const openedAt = new Date(createdAt.getTime() + 90 * 60000).toISOString();
        const roll = rng();
        const adminStatus = roll < 0.35 ? 'open' : roll < 0.55 ? 'answered' : roll < 0.85 ? 'resolved' : 'rejected';
        const merchantReply = adminStatus !== 'open' ? 'Nous avons vérifié la commande et contacté le client, toutes nos excuses pour la gêne occasionnée.' : undefined;
        order.dispute = {
          reason, message: messages[reason], openedAt,
          status: adminStatus === 'open' ? 'open' : 'answered',
          ...(merchantReply ? { merchantReply, answeredAt: new Date(createdAt.getTime() + 5 * 3600000).toISOString() } : {}),
        };
      }

      orders.push(order);
    }
  }

  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  cached = { vendors, couriers, users, orders };
  return cached;
}
