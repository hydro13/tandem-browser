import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Bookmark — A single bookmark or folder.
 */
export interface Bookmark {
  id: string;
  name: string;
  url?: string;
  type: 'folder' | 'url';
  children?: Bookmark[];
  dateAdded: number;
  parentId?: string;
}

interface BookmarkStore {
  bookmarks: Bookmark[];
  importedFrom?: string;
  lastModified: string;
}

/**
 * BookmarkManager — CRUD operations for bookmarks with folder support.
 * 
 * Storage: ~/.tandem/bookmarks.json
 */
export class BookmarkManager {
  private storePath: string;
  private store: BookmarkStore;

  constructor() {
    const tandemDir = path.join(os.homedir(), '.tandem');
    if (!fs.existsSync(tandemDir)) {
      fs.mkdirSync(tandemDir, { recursive: true });
    }
    this.storePath = path.join(tandemDir, 'bookmarks.json');
    this.store = this.load();
  }

  private load(): BookmarkStore {
    try {
      if (fs.existsSync(this.storePath)) {
        return JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
      }
    } catch (e: any) { console.warn('Bookmarks file corrupted, starting fresh:', e.message); }
    return { bookmarks: [], lastModified: new Date().toISOString() };
  }

  private save(): void {
    this.store.lastModified = new Date().toISOString();
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  /** Get all bookmarks (tree structure) */
  list(): Bookmark[] {
    return this.store.bookmarks;
  }

  /** Get flat list of all bookmarks (for search, bar display, etc.) */
  listFlat(): Bookmark[] {
    const result: Bookmark[] = [];
    const flatten = (nodes: Bookmark[]) => {
      for (const node of nodes) {
        result.push(node);
        if (node.children) flatten(node.children);
      }
    };
    flatten(this.store.bookmarks);
    return result;
  }

  /** Add a bookmark */
  add(name: string, url: string, parentId?: string): Bookmark {
    const bookmark: Bookmark = {
      id: this.generateId(),
      name,
      url,
      type: 'url',
      dateAdded: Date.now(),
      parentId,
    };

    if (parentId) {
      const parent = this.findById(parentId, this.store.bookmarks);
      if (parent && parent.type === 'folder') {
        if (!parent.children) parent.children = [];
        parent.children.push(bookmark);
      } else {
        this.store.bookmarks.push(bookmark);
      }
    } else {
      this.store.bookmarks.push(bookmark);
    }

    this.save();
    return bookmark;
  }

  /** Add a folder */
  addFolder(name: string, parentId?: string): Bookmark {
    const folder: Bookmark = {
      id: this.generateId(),
      name,
      type: 'folder',
      children: [],
      dateAdded: Date.now(),
      parentId,
    };

    if (parentId) {
      const parent = this.findById(parentId, this.store.bookmarks);
      if (parent && parent.type === 'folder') {
        if (!parent.children) parent.children = [];
        parent.children.push(folder);
      } else {
        this.store.bookmarks.push(folder);
      }
    } else {
      this.store.bookmarks.push(folder);
    }

    this.save();
    return folder;
  }

  /** Remove a bookmark or folder by ID */
  remove(id: string): boolean {
    const removed = this.removeFromList(id, this.store.bookmarks);
    if (removed) this.save();
    return removed;
  }

  private removeFromList(id: string, list: Bookmark[]): boolean {
    const idx = list.findIndex(b => b.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      return true;
    }
    for (const item of list) {
      if (item.children && this.removeFromList(id, item.children)) return true;
    }
    return false;
  }

  /** Update a bookmark */
  update(id: string, data: { name?: string; url?: string }): Bookmark | null {
    const bookmark = this.findById(id, this.store.bookmarks);
    if (!bookmark) return null;

    if (data.name !== undefined) bookmark.name = data.name;
    if (data.url !== undefined) bookmark.url = data.url;

    this.save();
    return bookmark;
  }

  /** Search bookmarks by name or URL */
  search(query: string): Bookmark[] {
    const q = query.toLowerCase();
    return this.listFlat().filter(b =>
      b.type === 'url' && (
        (b.name && b.name.toLowerCase().includes(q)) ||
        (b.url && b.url.toLowerCase().includes(q))
      )
    );
  }

  /** Check if a URL is bookmarked */
  isBookmarked(url: string): boolean {
    return this.listFlat().some(b => b.type === 'url' && b.url === url);
  }

  /** Find bookmark by URL */
  findByUrl(url: string): Bookmark | null {
    return this.listFlat().find(b => b.type === 'url' && b.url === url) || null;
  }

  /** Get bookmarks bar items (top-level bookmarks only) */
  getBarItems(): Bookmark[] {
    // Return top-level items from "bookmark_bar" folder, or just top-level items
    const barFolder = this.store.bookmarks.find(b => b.name === 'Bookmarks Bar' || b.name === 'Bladwijzerbalk');
    if (barFolder && barFolder.children) return barFolder.children;
    return this.store.bookmarks.filter(b => b.type === 'url').slice(0, 20);
  }

  /** Find a bookmark by ID in the tree */
  private findById(id: string, list: Bookmark[]): Bookmark | null {
    for (const item of list) {
      if (item.id === id) return item;
      if (item.children) {
        const found = this.findById(id, item.children);
        if (found) return found;
      }
    }
    return null;
  }
}
