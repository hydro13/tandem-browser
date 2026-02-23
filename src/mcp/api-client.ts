import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const API_BASE = 'http://localhost:8765';

function getToken(): string {
  const tokenPath = path.join(os.homedir(), '.tandem', 'api-token');
  return fs.readFileSync(tokenPath, 'utf-8').trim();
}

export async function apiCall(method: string, endpoint: string, body?: any): Promise<any> {
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
      throw new Error('Tandem Browser is niet actief. Start Tandem met \'npm start\' en probeer opnieuw.');
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

/** Log an activity message to the Copilot panel */
export async function logActivity(toolName: string, details?: string): Promise<void> {
  const text = details ? `🤖 ${toolName}: ${details}` : `🤖 ${toolName}`;
  try {
    await apiCall('POST', '/chat', { text, from: 'claude' });
  } catch {
    // Don't fail the tool call if activity logging fails
  }
}
