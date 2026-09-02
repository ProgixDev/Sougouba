import type { Vendor, VendorStatus, ID } from '../types';
import { loadTable, saveTable, loadValue, saveValue, delay } from './storage';
import { getSeed } from './seed';

const TABLE_KEY = 'sougouba-admin-vendors';
const NOTES_KEY = 'sougouba-admin-vendor-notes';

function table(): Vendor[] {
  return loadTable(TABLE_KEY, getSeed().vendors);
}
function notes(): Record<ID, string> {
  return loadValue(NOTES_KEY, {} as Record<ID, string>);
}

export async function listVendors(status?: VendorStatus): Promise<Vendor[]> {
  await delay();
  const rows = table();
  return status ? rows.filter((v) => v.status === status) : rows;
}

export async function getVendor(id: ID): Promise<Vendor | undefined> {
  await delay(150, 300);
  return table().find((v) => v.id === id);
}

export async function getVendorNote(id: ID): Promise<string | undefined> {
  return notes()[id];
}

export async function approveVendor(id: ID): Promise<Vendor | undefined> {
  await delay(300, 550);
  const rows = table();
  const vendor = rows.find((v) => v.id === id);
  if (!vendor) return undefined;
  vendor.status = 'approved';
  saveTable(TABLE_KEY, rows);
  return vendor;
}

export async function rejectVendor(id: ID, reason: string): Promise<Vendor | undefined> {
  await delay(300, 550);
  const rows = table();
  const vendor = rows.find((v) => v.id === id);
  if (!vendor) return undefined;
  vendor.status = 'suspended';
  saveTable(TABLE_KEY, rows);
  const n = notes();
  n[id] = reason;
  saveValue(NOTES_KEY, n);
  return vendor;
}

export async function suspendVendor(id: ID, reason: string): Promise<Vendor | undefined> {
  return rejectVendor(id, reason);
}
