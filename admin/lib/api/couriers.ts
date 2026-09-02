import type { Courier, CourierStatus, ID } from '../types';
import { loadTable, saveTable, loadValue, saveValue, delay } from './storage';
import { getSeed } from './seed';

const TABLE_KEY = 'sougouba-admin-couriers';
const NOTES_KEY = 'sougouba-admin-courier-notes';

function table(): Courier[] {
  return loadTable(TABLE_KEY, getSeed().couriers);
}
function notes(): Record<ID, string> {
  return loadValue(NOTES_KEY, {} as Record<ID, string>);
}

export async function listCouriers(status?: CourierStatus): Promise<Courier[]> {
  await delay();
  const rows = table();
  return status ? rows.filter((c) => c.status === status) : rows;
}

export async function getCourier(id: ID): Promise<Courier | undefined> {
  await delay(150, 300);
  return table().find((c) => c.id === id);
}

export async function getCourierNote(id: ID): Promise<string | undefined> {
  return notes()[id];
}

export async function approveCourier(id: ID): Promise<Courier | undefined> {
  await delay(300, 550);
  const rows = table();
  const courier = rows.find((c) => c.id === id);
  if (!courier) return undefined;
  courier.status = 'approved';
  saveTable(TABLE_KEY, rows);
  return courier;
}

export async function rejectCourier(id: ID, reason: string): Promise<Courier | undefined> {
  await delay(300, 550);
  const rows = table();
  const courier = rows.find((c) => c.id === id);
  if (!courier) return undefined;
  courier.status = 'suspended';
  saveTable(TABLE_KEY, rows);
  const n = notes();
  n[id] = reason;
  saveValue(NOTES_KEY, n);
  return courier;
}

export async function suspendCourier(id: ID, reason: string): Promise<Courier | undefined> {
  return rejectCourier(id, reason);
}
