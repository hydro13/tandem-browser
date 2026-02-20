export interface MockRule {
  id: string;             // uuid via crypto.randomUUID()
  pattern: string;        // glob or exact URL
  abort?: boolean;        // true = block request
  status?: number;        // HTTP status code (default: 200)
  body?: unknown;         // response body (JSON auto-serialized)
  headers?: Record<string, string>;
  delay?: number;         // ms delay before mock response
  createdAt: number;
}
