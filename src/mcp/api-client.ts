import * as fs from 'fs';
import { tandemDir } from '../utils/paths';
import { API_PORT } from '../utils/constants';

const API_BASE = `http://localhost:${API_PORT}`;

function getToken(): string {
  const tokenPath = tandemDir('api-token');
  return fs.readFileSync(tokenPath, 'utf-8').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP relays many heterogeneous Tandem API responses
export async function apiCall(method: string, endpoint: string, body?: any, headers?: Record<string, string>): Promise<any> {
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    const errObj = err as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
    if (errObj.code === 'ECONNREFUSED' || errObj.cause?.code === 'ECONNREFUSED') {
      throw new Error('Tandem Browser is not running. Start Tandem with \'npm start\' and try again.', { cause: err });
    }
    throw err;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Tandem API error: ${response.status} ${response.statusText} — ${text}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('image/')) {
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  return response.json();
}

/** Log an activity message to the Wingman panel */
export async function logActivity(toolName: string, details?: string): Promise<void> {
  const text = details ? `🤖 ${toolName}: ${details}` : `🤖 ${toolName}`;
  try {
    await apiCall('POST', '/chat', { text, from: 'claude' });
  } catch {
    // Don't fail the tool call if activity logging fails
  }
}
