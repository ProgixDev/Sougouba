import type { AdminDispute, AdminDisputeStatus, ID } from '../types';
import { loadTable, saveTable, delay } from './storage';
import { getSeed } from './seed';

const TABLE_KEY = 'sougouba-admin-disputes';

function table(): AdminDispute[] {
  return loadTable(TABLE_KEY, getSeed().disputes);
}

export async function listDisputes(status?: AdminDisputeStatus): Promise<AdminDispute[]> {
  await delay();
  const rows = table();
  return status ? rows.filter((d) => d.status === status) : rows;
}

export async function getDispute(id: ID): Promise<AdminDispute | undefined> {
  await delay(150, 300);
  return table().find((d) => d.id === id);
}

export async function resolveDispute(id: ID, resolutionNote: string, outcome: 'resolved' | 'rejected'): Promise<AdminDispute | undefined> {
  await delay(300, 550);
  const rows = table();
  const dispute = rows.find((d) => d.id === id);
  if (!dispute) return undefined;
  dispute.status = outcome;
  dispute.resolutionNote = resolutionNote;
  dispute.resolvedAt = new Date().toISOString();
  saveTable(TABLE_KEY, rows);
  return dispute;
}
