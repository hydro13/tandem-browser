import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerMediaTools(server: McpServer): void {
  // ── Voice ──

  server.tool(
    'tandem_voice_start',
    'Start speech recognition (voice-to-text). Tandem will begin listening for voice input.',
    async () => {
      const data = await apiCall('POST', '/voice/start');
      await logActivity('voice_start');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_voice_stop',
    'Stop speech recognition.',
    async () => {
      const data = await apiCall('POST', '/voice/stop');
      await logActivity('voice_stop');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_voice_status',
    'Get current voice recognition status (listening, language, etc.).',
    async () => {
      const data = await apiCall('GET', '/voice/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Audio Recording ──

  server.tool(
    'tandem_audio_start',
    'Start audio/screen recording of the application.',
    async () => {
      const data = await apiCall('POST', '/audio/start');
      await logActivity('audio_start');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_audio_stop',
    'Stop audio/screen recording.',
    async () => {
      const data = await apiCall('POST', '/audio/stop');
      await logActivity('audio_stop');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_audio_status',
    'Get current audio recording status.',
    async () => {
      const data = await apiCall('GET', '/audio/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_audio_recordings',
    'List saved audio recordings.',
    async () => {
      const data = await apiCall('GET', '/audio/recordings');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Screenshots (Annotated) ──

  server.tool(
    'tandem_screenshot_annotated',
    'Get the last annotated screenshot (with draw-mode annotations) as a PNG image.',
    async () => {
      const base64 = await apiCall('GET', '/screenshot/annotated');
      await logActivity('screenshot_annotated');
      return {
        content: [{
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        }],
      };
    }
  );

  server.tool(
    'tandem_screenshot_capture_annotated',
    'Capture a new annotated screenshot of the active tab and return it as a PNG image.',
    async () => {
      const data = await apiCall('POST', '/screenshot/annotated');
      await logActivity('screenshot_capture_annotated');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_screenshot_capture_application',
    'Capture a fresh screenshot of the full Tandem application window and return the saved file path.',
    async () => {
      const data = await apiCall('POST', '/screenshot/application');
      await logActivity('screenshot_capture_application');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_screenshot_capture_region',
    'Capture a fresh screenshot of a specific application region and return the saved file path.',
    coerceShape({
      x: z.number().describe('Region left coordinate in application-window pixels.'),
      y: z.number().describe('Region top coordinate in application-window pixels.'),
      width: z.number().describe('Region width in pixels.'),
      height: z.number().describe('Region height in pixels.'),
    }),
    async ({ x, y, width, height }) => {
      const data = await apiCall('POST', '/screenshot/region', { x, y, width, height });
      await logActivity('screenshot_capture_region');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_screenshots_list',
    'List saved screenshots.',
    coerceShape({
      limit: z.number().optional().describe('Maximum number of screenshots to return (default: 10)'),
    }),
    async ({ limit }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const endpoint = qs ? `/screenshots?${qs}` : '/screenshots';
      const data = await apiCall('GET', endpoint);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Draw Mode ──

  server.tool(
    'tandem_draw_toggle',
    'Toggle draw mode on/off. When enabled, users can annotate the screen.',
    coerceShape({
      enabled: z.boolean().optional().describe('Set draw mode on (true) or off (false). Omit to toggle.'),
    }),
    async ({ enabled }) => {
      const body: Record<string, unknown> = {};
      if (enabled !== undefined) body.enabled = enabled;
      const data = await apiCall('POST', '/draw/toggle', body);
      await logActivity('draw_toggle', `drawMode: ${data.drawMode}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Panel ──

  server.tool(
    'tandem_panel_toggle',
    'Toggle the Wingman side panel open/closed.',
    coerceShape({
      open: z.boolean().optional().describe('Set panel open (true) or closed (false). Omit to toggle.'),
    }),
    async ({ open }) => {
      const body: Record<string, unknown> = {};
      if (open !== undefined) body.open = open;
      const data = await apiCall('POST', '/panel/toggle', body);
      await logActivity('panel_toggle', `open: ${data.open}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Wingman Stream ──

  server.tool(
    'tandem_wingman_stream_toggle',
    'Toggle Wingman activity streaming to OpenClaw on/off.',
    coerceShape({
      enabled: z.boolean().describe('Enable (true) or disable (false) the wingman stream'),
    }),
    async ({ enabled }) => {
      const data = await apiCall('POST', '/wingman-stream/toggle', { enabled });
      await logActivity('wingman_stream_toggle', `enabled: ${data.enabled}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_wingman_stream_status',
    'Get current Wingman stream status (enabled/disabled).',
    async () => {
      const data = await apiCall('GET', '/wingman-stream/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
