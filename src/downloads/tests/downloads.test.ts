import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  Notification: {
    isSupported: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../shared/ipc-channels', () => ({
  IpcChannels: { DOWNLOAD_COMPLETE: 'download-complete' },
}));

import { DownloadManager } from '../manager';

describe('DownloadManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createManager(folder?: string): DownloadManager {
    return new DownloadManager(folder);
  }

  describe('constructor', () => {
    it('uses provided download folder', () => {
      const dm = createManager('/custom/downloads');
      expect(dm.getDownloadFolder()).toBe('/custom/downloads');
    });

    it('defaults to ~/Downloads when no folder provided', () => {
      const dm = createManager();
      expect(dm.getDownloadFolder()).toContain('Downloads');
    });
  });

  describe('list', () => {
    it('returns empty array initially', () => {
      const dm = createManager();
      expect(dm.list()).toEqual([]);
    });
  });

  describe('listActive', () => {
    it('returns empty array when no downloads', () => {
      const dm = createManager();
      expect(dm.listActive()).toEqual([]);
    });
  });

  describe('setDownloadFolder', () => {
    it('updates the download folder', () => {
      const dm = createManager('/original');
      dm.setDownloadFolder('/new/path');
      expect(dm.getDownloadFolder()).toBe('/new/path');
    });
  });

  describe('getDownloadFolder', () => {
    it('returns the current download folder', () => {
      const dm = createManager('/test/folder');
      expect(dm.getDownloadFolder()).toBe('/test/folder');
    });
  });

  describe('hookSession', () => {
    it('registers a will-download listener on the session', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);
      expect(mockSession.on).toHaveBeenCalledWith('will-download', expect.any(Function));
    });

    it('tracks a download when will-download fires', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);

      const willDownloadCb = mockSession.on.mock.calls[0][1];

      const mockItem = {
        getFilename: vi.fn().mockReturnValue('test.pdf'),
        getURL: vi.fn().mockReturnValue('https://example.com/test.pdf'),
        getTotalBytes: vi.fn().mockReturnValue(1024),
        getReceivedBytes: vi.fn().mockReturnValue(0),
        getMimeType: vi.fn().mockReturnValue('application/pdf'),
        setSavePath: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
      };

      willDownloadCb({}, mockItem);

      expect(mockItem.setSavePath).toHaveBeenCalledWith('/tmp/downloads/test.pdf');
      const downloads = dm.list();
      expect(downloads).toHaveLength(1);
      expect(downloads[0].filename).toBe('test.pdf');
      expect(downloads[0].url).toBe('https://example.com/test.pdf');
      expect(downloads[0].status).toBe('progressing');
      expect(downloads[0].totalBytes).toBe(1024);
    });

    it('updates download progress on updated event', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);

      const willDownloadCb = mockSession.on.mock.calls[0][1];
      const mockItem = {
        getFilename: vi.fn().mockReturnValue('file.zip'),
        getURL: vi.fn().mockReturnValue('https://example.com/file.zip'),
        getTotalBytes: vi.fn().mockReturnValue(2048),
        getReceivedBytes: vi.fn().mockReturnValue(512),
        getMimeType: vi.fn().mockReturnValue('application/zip'),
        setSavePath: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
      };

      willDownloadCb({}, mockItem);

      // Find the 'updated' callback
      const updatedCb = mockItem.on.mock.calls.find((c: any[]) => c[0] === 'updated')![1];
      updatedCb({}, 'progressing');

      const downloads = dm.list();
      expect(downloads[0].receivedBytes).toBe(512);
    });

    it('marks download as interrupted on updated event', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);

      const willDownloadCb = mockSession.on.mock.calls[0][1];
      const mockItem = {
        getFilename: vi.fn().mockReturnValue('file.zip'),
        getURL: vi.fn().mockReturnValue('https://example.com/file.zip'),
        getTotalBytes: vi.fn().mockReturnValue(2048),
        getReceivedBytes: vi.fn().mockReturnValue(100),
        getMimeType: vi.fn().mockReturnValue('application/zip'),
        setSavePath: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
      };

      willDownloadCb({}, mockItem);
      const updatedCb = mockItem.on.mock.calls.find((c: any[]) => c[0] === 'updated')![1];
      updatedCb({}, 'interrupted');

      expect(dm.list()[0].status).toBe('interrupted');
    });

    it('marks download as completed on done event', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);

      const willDownloadCb = mockSession.on.mock.calls[0][1];
      const mockItem = {
        getFilename: vi.fn().mockReturnValue('file.zip'),
        getURL: vi.fn().mockReturnValue('https://example.com/file.zip'),
        getTotalBytes: vi.fn().mockReturnValue(2048),
        getReceivedBytes: vi.fn().mockReturnValue(2048),
        getMimeType: vi.fn().mockReturnValue('application/zip'),
        setSavePath: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
      };

      willDownloadCb({}, mockItem);
      const doneCb = mockItem.once.mock.calls.find((c: any[]) => c[0] === 'done')![1];
      doneCb({}, 'completed');

      const downloads = dm.list();
      expect(downloads[0].status).toBe('completed');
      expect(downloads[0].endTime).toBeTruthy();
    });

    it('marks download as cancelled on done event', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);

      const willDownloadCb = mockSession.on.mock.calls[0][1];
      const mockItem = {
        getFilename: vi.fn().mockReturnValue('file.zip'),
        getURL: vi.fn().mockReturnValue('https://example.com/file.zip'),
        getTotalBytes: vi.fn().mockReturnValue(2048),
        getReceivedBytes: vi.fn().mockReturnValue(0),
        getMimeType: vi.fn().mockReturnValue('application/zip'),
        setSavePath: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
      };

      willDownloadCb({}, mockItem);
      const doneCb = mockItem.once.mock.calls.find((c: any[]) => c[0] === 'done')![1];
      doneCb({}, 'cancelled');

      expect(dm.list()[0].status).toBe('cancelled');
    });

    it('filters active downloads correctly', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);

      const willDownloadCb = mockSession.on.mock.calls[0][1];

      // Create two downloads
      for (const name of ['a.zip', 'b.zip']) {
        const mockItem = {
          getFilename: vi.fn().mockReturnValue(name),
          getURL: vi.fn().mockReturnValue(`https://example.com/${name}`),
          getTotalBytes: vi.fn().mockReturnValue(1024),
          getReceivedBytes: vi.fn().mockReturnValue(0),
          getMimeType: vi.fn().mockReturnValue('application/zip'),
          setSavePath: vi.fn(),
          on: vi.fn(),
          once: vi.fn(),
        };
        willDownloadCb({}, mockItem);

        // Complete the first one
        if (name === 'a.zip') {
          const doneCb = mockItem.once.mock.calls.find((c: any[]) => c[0] === 'done')![1];
          doneCb({}, 'completed');
        }
      }

      expect(dm.list()).toHaveLength(2);
      expect(dm.listActive()).toHaveLength(1);
      expect(dm.listActive()[0].filename).toBe('b.zip');
    });

    it('returns downloads in reverse order (most recent first)', () => {
      const dm = createManager('/tmp/downloads');
      const mockSession = { on: vi.fn() } as any;
      dm.hookSession(mockSession);

      const willDownloadCb = mockSession.on.mock.calls[0][1];

      for (const name of ['first.zip', 'second.zip']) {
        willDownloadCb({}, {
          getFilename: vi.fn().mockReturnValue(name),
          getURL: vi.fn().mockReturnValue(`https://example.com/${name}`),
          getTotalBytes: vi.fn().mockReturnValue(100),
          getReceivedBytes: vi.fn().mockReturnValue(0),
          getMimeType: vi.fn().mockReturnValue('application/zip'),
          setSavePath: vi.fn(),
          on: vi.fn(),
          once: vi.fn(),
        });
      }

      const list = dm.list();
      expect(list[0].filename).toBe('second.zip');
      expect(list[1].filename).toBe('first.zip');
    });
  });
});
