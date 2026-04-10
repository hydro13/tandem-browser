import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerClipboardTools(server: McpServer): void {

  server.tool(
    'tandem_clipboard_read',
    'Read what is on the clipboard. Returns text and/or image. Use this to see what the user has copied — if there is an image you will receive it visually.',
    {},
    {
      readOnlyHint: true,
      openWorldHint: false,
    },
    async () => {
      const data = await apiCall('GET', '/clipboard');
      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

      if (data.text) {
        content.push({ type: 'text' as const, text: data.text });
      }

      if (data.image && data.image.base64) {
        // Strip data URI prefix for MCP image transport
        const raw = (data.image.base64 as string).replace(/^data:image\/\w+;base64,/, '');
        content.push({ type: 'image' as const, data: raw, mimeType: 'image/png' });
      }

      if (data.html && !data.text) {
        content.push({ type: 'text' as const, text: data.html });
      }

      if (content.length === 0) {
        content.push({ type: 'text' as const, text: `Clipboard is empty. Formats: ${JSON.stringify(data.formats)}` });
      }

      await logActivity('clipboard_read', data.hasImage ? 'image' : data.text ? data.text.slice(0, 60) : 'empty');
      return { content };
    }
  );

  server.tool(
    'tandem_clipboard_write',
    'Write text or an image to the clipboard so the user can paste it somewhere. For images, provide base64-encoded image data.',
    {
      text: z.string().optional().describe('Text to place on the clipboard'),
      image_base64: z.string().optional().describe('Base64-encoded image data (with or without data URI prefix)'),
    },
    async ({ text, image_base64 }) => {
      if (!text && !image_base64) {
        return { content: [{ type: 'text', text: 'Error: provide text or image_base64 (or both)' }] };
      }

      const results: string[] = [];

      if (text) {
        await apiCall('POST', '/clipboard/text', { text });
        results.push('text');
      }
      if (image_base64) {
        await apiCall('POST', '/clipboard/image', { base64: image_base64 });
        results.push('image');
      }

      const summary = `Copied ${results.join(' and ')} to clipboard`;
      await logActivity('clipboard_write', summary);
      return { content: [{ type: 'text', text: summary }] };
    }
  );

  server.tool(
    'tandem_clipboard_save',
    'Save the current clipboard content as a file. Choose a descriptive filename that reflects the content. Use jpg for photos/screenshots, png for graphics with transparency, txt for text.',
    {
      filename: z.string().describe('Descriptive filename, e.g. "vercel-503-error.png" or "meeting-notes.txt"'),
      format: z.enum(['png', 'jpg', 'txt']).optional().describe('File format — auto-detected from filename extension if omitted'),
      quality: z.number().min(1).max(100).optional().describe('JPEG quality (1-100, default 90). Only applies to jpg format'),
      directory: z.string().optional().describe('Save directory (default: ~/Pictures/Tandem/clipboard/)'),
    },
    async ({ filename, format, quality, directory }) => {
      const data = await apiCall('POST', '/clipboard/save', { filename, format, quality, directory });
      const summary = `Saved to ${data.path} (${formatBytes(data.size)})`;
      await logActivity('clipboard_save', summary);
      return { content: [{ type: 'text', text: summary }] };
    }
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
