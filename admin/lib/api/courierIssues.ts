import type { AdminCourierIssue, CourierIssueStatus, ID } from '../types';
import { loadTable, saveTable, delay } from './storage';
import { getSeed } from './seed';

const TABLE_KEY = 'sougouba-admin-courier-issues';

function table(): AdminCourierIssue[] {
  return loadTable(TABLE_KEY, getSeed().courierIssues);
}

export async function listCourierIssues(status?: CourierIssueStatus): Promise<AdminCourierIssue[]> {
  await delay();
  const rows = table();
  return status ? rows.filter((i) => i.status === status) : rows;
}

export async function getCourierIssue(id: ID): Promise<AdminCourierIssue | undefined> {
  await delay(150, 300);
  return table().find((i) => i.id === id);
}

export async function resolveCourierIssue(id: ID): Promise<AdminCourierIssue | undefined> {
  await delay(300, 550);
  const rows = table();
  const issue = rows.find((i) => i.id === id);
  if (!issue) return undefined;
  issue.status = 'resolved';
  issue.resolvedAt = new Date().toISOString();
  saveTable(TABLE_KEY, rows);
  return issue;
}
