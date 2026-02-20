import fs from 'fs';
import path from 'path';
import os from 'os';

const API_BASE = process.env.TANDEM_API || 'http://localhost:8765';
const TOKEN_PATH = path.join(os.homedir(), '.tandem', 'api-token');

function getToken(): string {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
  } catch {
    return '';
  }
}

export async function api(
  method: string,
  endpoint: string,
  body?: unknown,
  session?: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
  if (session) headers['X-Session'] = session;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error(`Error: ${(err as { error: string }).error}`);
    process.exit(1);
  }

  return res.json();
}

export async function apiRaw(
  method: string,
  endpoint: string,
  session?: string
): Promise<Buffer> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
  };
  if (session) headers['X-Session'] = session;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error(`Error: ${(err as { error: string }).error}`);
    process.exit(1);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
