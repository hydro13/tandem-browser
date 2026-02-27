import fs from 'fs';
import path from 'path';
import { GALLERY_DEFAULTS, GalleryExtension, ExtensionCategory } from './gallery-defaults';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('GalleryLoader');

// ─── User Gallery JSON format ───────────────────────────────────────────────

interface UserGalleryFile {
  version: number;
  extensions: GalleryExtension[];
}

// ─── Gallery Response types ─────────────────────────────────────────────────

export interface GalleryEntry extends GalleryExtension {
  installed: boolean;
}

export interface GalleryResponse {
  extensions: GalleryEntry[];
  categories: ExtensionCategory[];
  counts: {
    total: number;
    works: number;
    partial: number;
    needsWork: number;
  };
}

// ─── Gallery Loader ─────────────────────────────────────────────────────────

/**
 * GalleryLoader — Two-layer gallery with extensible merge architecture.
 *
 * Layer 1: Built-in defaults from gallery-defaults.ts (shipped with the app)
 * Layer 2: User overrides from ~/.tandem/extensions/gallery.json (optional)
 *
 * Merge: user entries override defaults by ID, new user entries are appended.
 * Architecture allows adding a third layer (remote gallery) without code changes.
 */
export class GalleryLoader {
  private extensionsDir: string;

  constructor() {
    this.extensionsDir = tandemDir('extensions');
  }

  /**
   * Load the merged gallery: built-in defaults + user overrides.
   */
  loadGallery(): GalleryExtension[] {
    const defaults = this.loadDefaults();
    const userOverrides = this.loadUserGallery();
    return this.merge(defaults, userOverrides);
  }

  /**
   * Get the full gallery response with installed status and filtering.
   */
  getGalleryResponse(
    installedIds: Set<string>,
    options?: { category?: string; featured?: string }
  ): GalleryResponse {
    let extensions: GalleryEntry[] = this.loadGallery().map(ext => ({
      ...ext,
      installed: installedIds.has(ext.id),
    }));

    // Apply filters
    if (options?.category) {
      extensions = extensions.filter(e => e.category === options.category);
    }
    if (options?.featured === 'true') {
      extensions = extensions.filter(e => e.featured);
    }

    // Collect unique categories from the full (unfiltered) gallery
    const allExtensions = this.loadGallery();
    const categories = [...new Set(allExtensions.map(e => e.category))].sort() as ExtensionCategory[];

    // Compute counts from the filtered list
    const counts = {
      total: extensions.length,
      works: extensions.filter(e => e.compatibility === 'works').length,
      partial: extensions.filter(e => e.compatibility === 'partial').length,
      needsWork: extensions.filter(e => e.compatibility === 'needs-work').length,
    };

    return { extensions, categories, counts };
  }

  // ── Layer loaders ───────────────────────────────────────────────────────

  private loadDefaults(): GalleryExtension[] {
    return [...GALLERY_DEFAULTS];
  }

  private loadUserGallery(): GalleryExtension[] {
    const galleryPath = path.join(this.extensionsDir, 'gallery.json');

    if (!fs.existsSync(galleryPath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(galleryPath, 'utf-8');
      const parsed: UserGalleryFile = JSON.parse(raw);

      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.extensions)) {
        log.warn('⚠️ gallery.json has invalid format — expected { version, extensions[] }');
        return [];
      }

      // Validate each entry has at minimum an id
      return parsed.extensions.filter(ext => {
        if (!ext || typeof ext !== 'object' || typeof ext.id !== 'string' || !ext.id.trim()) {
          log.warn('⚠️ Skipping gallery.json entry with missing/invalid id');
          return false;
        }
        return true;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`⚠️ Failed to load gallery.json: ${message}`);
      return [];
    }
  }

  // ── Merge logic ─────────────────────────────────────────────────────────

  /**
   * Merge multiple gallery sources. Later sources override earlier ones by ID.
   * New IDs are appended.
   */
  private merge(defaults: GalleryExtension[], ...overrides: GalleryExtension[][]): GalleryExtension[] {
    const byId = new Map<string, GalleryExtension>();

    // Insert defaults first (preserves order)
    for (const ext of defaults) {
      byId.set(ext.id, ext);
    }

    // Override/add from each source
    for (const source of overrides) {
      for (const ext of source) {
        byId.set(ext.id, { ...byId.get(ext.id), ...ext });
      }
    }

    return [...byId.values()];
  }
}
