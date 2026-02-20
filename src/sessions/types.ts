export interface Session {
  name: string;
  partition: string;       // "persist:session-{name}" or "persist:tandem" for default
  createdAt: number;
  isDefault: boolean;      // true only for "default" (Robin's session)
}
