import type { Order, OrderStatus, ID } from '../types';
import { loadTable, delay } from './storage';
import { getSeed } from './seed';

const TABLE_KEY = 'sougouba-admin-orders';

function table(): Order[] {
  return loadTable(TABLE_KEY, getSeed().orders);
}

export interface OrderFilters {
  status?: OrderStatus;
  vendorId?: ID;
  search?: string;
}

export async function listOrders(filters: OrderFilters = {}): Promise<Order[]> {
  await delay();
  let rows = table();
  if (filters.status) rows = rows.filter((o) => o.status === filters.status);
  if (filters.vendorId) rows = rows.filter((o) => o.vendorId === filters.vendorId);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((o) => o.id.toLowerCase().includes(q) || (o.customerName ?? '').toLowerCase().includes(q));
  }
  return rows;
}

export async function getOrder(id: ID): Promise<Order | undefined> {
  await delay(150, 300);
  return table().find((o) => o.id === id);
}
