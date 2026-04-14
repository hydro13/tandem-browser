import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerMediaTools } from '../tools/media.js';
import { createMockServer, getHandler, expectImageContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP media tools', () => {
  const { server, tools } = createMockServer();
  registerMediaTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('tandem_voice_start', () => {
    it('starts voice recognition', async () => {
      mockApiCall.mockResolvedValueOnce({ listening: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'tandem_voice_start')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/voice/start');
    });
  });

  describe('tandem_voice_stop', () => {
    it('stops voice recognition', async () => {
      mockApiCall.mockResolvedValueOnce({ listening: false });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'tandem_voice_stop')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/voice/stop');
    });
  });

  describe('tandem_voice_status', () => {
    it('returns voice status', async () => {
      mockApiCall.mockResolvedValueOnce({ active: false });
      await getHandler(tools, 'tandem_voice_status')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/voice/status');
    });
  });

  describe('tandem_audio_start', () => {
    it('starts audio recording', async () => {
      mockApiCall.mockResolvedValueOnce({ recording: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'tandem_audio_start')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/audio/start');
    });
  });

  describe('tandem_audio_stop', () => {
    it('stops audio recording', async () => {
      mockApiCall.mockResolvedValueOnce({ recording: false });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'tandem_audio_stop')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/audio/stop');
    });
  });

  describe('tandem_audio_recordings', () => {
    it('lists recordings', async () => {
      mockApiCall.mockResolvedValueOnce({ recordings: [] });
      await getHandler(tools, 'tandem_audio_recordings')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/audio/recordings');
    });
  });

  describe('tandem_screenshot_annotated', () => {
    it('returns annotated screenshot as image', async () => {
      mockApiCall.mockResolvedValueOnce('base64png');
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await getHandler(tools, 'tandem_screenshot_annotated')({});
      expectImageContent(result);
    });
  });

  describe('tandem_screenshot_capture_annotated', () => {
    it('captures annotated screenshot', async () => {
      mockApiCall.mockResolvedValueOnce({ path: '/tmp/ss.png' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'tandem_screenshot_capture_annotated')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/screenshot/annotated');
    });
  });

  describe('tandem_screenshot_capture_application', () => {
    it('captures a full application screenshot', async () => {
      mockApiCall.mockResolvedValueOnce({ path: '/tmp/application.png' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'tandem_screenshot_capture_application')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/screenshot/application');
    });
  });

  describe('tandem_screenshot_capture_region', () => {
    it('captures a region screenshot', async () => {
      mockApiCall.mockResolvedValueOnce({ path: '/tmp/region.png' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'tandem_screenshot_capture_region')({
        x: 12,
        y: 34,
        width: 320,
        height: 180,
      });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/screenshot/region', {
        x: 12,
        y: 34,
        width: 320,
        height: 180,
      });
    });
  });

  describe('tandem_screenshots_list', () => {
    it('lists screenshots', async () => {
      mockApiCall.mockResolvedValueOnce({ screenshots: [] });
      await getHandler(tools, 'tandem_screenshots_list')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/screenshots');
    });

    it('applies limit', async () => {
      mockApiCall.mockResolvedValueOnce({ screenshots: [] });
      await getHandler(tools, 'tandem_screenshots_list')({ limit: 5 });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('limit=5');
    });
  });

  describe('tandem_draw_toggle', () => {
    it('toggles draw mode', async () => {
      mockApiCall.mockResolvedValueOnce({ enabled: true });
      await getHandler(tools, 'tandem_draw_toggle')({ enabled: true });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/draw/toggle', { enabled: true });
    });
  });

  describe('tandem_wingman_stream_toggle', () => {
    it('toggles wingman stream', async () => {
      mockApiCall.mockResolvedValueOnce({ enabled: true });
      await getHandler(tools, 'tandem_wingman_stream_toggle')({ enabled: true });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/wingman-stream/toggle', { enabled: true });
    });
  });
});
