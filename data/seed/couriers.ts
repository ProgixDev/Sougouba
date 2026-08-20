import type { Courier, VehicleType } from '../types';
import { hashString, mulberry32 } from '../utils/random';

/**
 * The livreurs on the road.
 *
 * Eight of them, spread across the same boroughs the shops are in — a courier
 * seeded in Longueuil is what makes "le livreur le plus proche" mean anything
 * when the dispatcher ranks by distance from a Vieux-Longueuil restaurant.
 * Bases are real intersections, not the shop coordinates, so a run always has a
 * leg to the pickup rather than starting on top of it.
 *
 * Ratings and delivery counts are generated from the id rather than typed by
 * hand: eight hand-picked "4.8"s read as a spreadsheet, and a number that
 * changes between launches would fight the persisted table.
 */
interface CourierSpec {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  vehicle: VehicleType;
  plate?: string;
  city: string;
  /** Where they wait between runs. */
  base: { lat: number; lng: number };
  /** Months on the platform — drives the delivery count. */
  tenureMonths: number;
}

const specs: CourierSpec[] = [
  {
    id: 'crr_moussa',
    userId: 'usr_courier_moussa',
    fullName: 'Moussa Traoré',
    phone: '+1 514 555 0142',
    vehicle: 'car',
    plate: 'H72 KLM',
    city: 'Montréal',
    base: { lat: 45.5301, lng: -73.6198 }, // Villeray, near Jarry
    tenureMonths: 14,
  },
  {
    id: 'crr_fatou',
    userId: 'usr_courier_fatou',
    fullName: 'Fatou Camara',
    phone: '+1 514 555 0173',
    vehicle: 'scooter',
    plate: 'S41 QRT',
    city: 'Montréal',
    base: { lat: 45.4981, lng: -73.6247 }, // Côte-des-Neiges
    tenureMonths: 9,
  },
  {
    id: 'crr_youssef',
    userId: 'usr_courier_youssef',
    fullName: 'Youssef El Idrissi',
    phone: '+1 514 555 0119',
    vehicle: 'car',
    plate: 'K18 VBN',
    city: 'Montréal-Nord',
    base: { lat: 45.6041, lng: -73.6288 },
    tenureMonths: 22,
  },
  {
    id: 'crr_awa',
    userId: 'usr_courier_awa',
    fullName: 'Awa Ndiaye',
    phone: '+1 438 555 0287',
    vehicle: 'bike',
    city: 'Montréal',
    base: { lat: 45.5342, lng: -73.6183 }, // Parc-Extension
    tenureMonths: 5,
  },
  {
    id: 'crr_karim',
    userId: 'usr_courier_karim',
    fullName: 'Karim Belkacem',
    phone: '+1 450 555 0334',
    vehicle: 'car',
    plate: 'D93 XCV',
    city: 'Laval',
    base: { lat: 45.5612, lng: -73.7402 }, // Chomedey
    tenureMonths: 17,
  },
  {
    id: 'crr_ines',
    userId: 'usr_courier_ines',
    fullName: 'Inès Kaboré',
    phone: '+1 450 555 0208',
    vehicle: 'scooter',
    plate: 'P27 ZWQ',
    city: 'Longueuil',
    base: { lat: 45.5338, lng: -73.5162 }, // Vieux-Longueuil
    tenureMonths: 11,
  },
  {
    id: 'crr_daniel',
    userId: 'usr_courier_daniel',
    fullName: 'Daniel Okonkwo',
    phone: '+1 514 555 0396',
    vehicle: 'car',
    plate: 'B60 HJU',
    city: 'Montréal',
    base: { lat: 45.5133, lng: -73.6841 }, // Saint-Laurent
    tenureMonths: 7,
  },
  {
    id: 'crr_sofia',
    userId: 'usr_courier_sofia',
    fullName: 'Sofia Mansouri',
    phone: '+1 438 555 0451',
    vehicle: 'bike',
    city: 'Montréal',
    base: { lat: 45.5219, lng: -73.5798 }, // Plateau
    tenureMonths: 3,
  },
];

/** Roughly a run a day, varied per courier — enough to make an earnings screen believable. */
function generated(spec: CourierSpec): Courier {
  const rng = mulberry32(hashString(spec.id));
  const perMonth = 40 + Math.floor(rng() * 45);
  const deliveryCount = spec.tenureMonths * perMonth;
  // 4.4 – 5.0, one decimal. Nobody who is still on the platform sits at 3.
  const rating = Math.round((4.4 + rng() * 0.6) * 10) / 10;

  return {
    id: spec.id,
    userId: spec.userId,
    fullName: spec.fullName,
    phone: spec.phone,
    vehicle: spec.vehicle,
    ...(spec.plate ? { plate: spec.plate } : {}),
    city: spec.city,
    base: spec.base,
    rating,
    deliveryCount,
    status: 'approved',
    // Relative to launch, like every other seeded date — see data/utils/time.ts.
    joinedAt: new Date(Date.now() - spec.tenureMonths * 30 * 86400000).toISOString(),
  };
}

export const couriers: Courier[] = specs.map(generated);
