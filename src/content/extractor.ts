import type { BrowserWindow} from 'electron';
import TurndownService = require('turndown');
import { createLogger } from '../utils/logger';
import { hostnameMatches, isSearchEngineResultsUrl, pathnameMatchesPrefix, tryParseUrl } from '../utils/security';

const log = createLogger('ContentExtractor');

interface PageContent {
  url: string;
  title: string;
  type: 'article' | 'profile' | 'product' | 'search' | 'generic';
  extractedAt: string;
  content: ArticleContent | ProfileContent | ProductContent | SearchContent | GenericContent;
}

interface ArticleContent {
  title: string;
  author?: string;
  date?: string;
  bodyText: string;
  images: string[];
  summary?: string;
}

interface ProfileContent {
  name?: string;
  headline?: string;
  location?: string;
  summary?: string;
  experience?: Array<{
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    institution: string;
    degree?: string;
    duration?: string;
  }>;
}

interface ProductContent {
  name: string;
  price?: string;
  description: string;
  images: string[];
  reviewsSummary?: {
    rating?: string;
    reviewCount?: number;
    topReviews?: string[];
  };
}

interface SearchContent {
  query?: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
}

interface GenericContent {
  title: string;
  description?: string;
  text: string;
  images: string[];
  links: Array<{
    text: string;
    href: string;
  }>;
}

export class ContentExtractor {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_'
    });

    // Configure turndown rules
    this.turndown.addRule('removeScripts', {
      filter: ['script', 'style', 'nav', 'header', 'footer', 'aside'],
      replacement: () => ''
    });
  }

  /**
   * Extract structured content from the current page
   */
  async extractCurrentPage(webview: BrowserWindow): Promise<PageContent> {
    const url = webview.webContents.getURL();
    const title = webview.webContents.getTitle();
    
    // Get page content
    const html = await this.getPageHTML(webview);
    const pageType = this.detectPageType(url, html);
    
    let content: ArticleContent | ProfileContent | ProductContent | SearchContent | GenericContent;
    switch (pageType) {
      case 'article':
        content = await this.extractArticle(webview, html);
        break;
      case 'profile':
        content = await this.extractProfile(webview, html);
        break;
      case 'product':
        content = await this.extractProduct(webview, html);
        break;
      case 'search':
        content = await this.extractSearchResults(webview, html);
        break;
      default:
        content = await this.extractGeneric(webview, html);
    }

    return {
      url,
      title,
      type: pageType,
      extractedAt: new Date().toISOString(),
      content
    };
  }

  /**
   * Extract content from a specific URL using headless browser
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HeadlessManager API mismatch (legacy dead code)
  async extractFromURL(url: string, headlessManager: any): Promise<PageContent> {
    const headlessWindow = await headlessManager.openHeadless(url);
    
    try {
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const result = await this.extractCurrentPage(headlessWindow);
      return result;
    } finally {
      if (headlessWindow && !headlessWindow.isDestroyed()) {
        headlessWindow.close();
      }
    }
  }

  private async getPageHTML(webview: BrowserWindow): Promise<string> {
    return await webview.webContents.executeJavaScript(`
      document.documentElement.outerHTML;
    `);
  }

  private detectPageType(url: string, html: string): 'article' | 'profile' | 'product' | 'search' | 'generic' {
    const parsedUrl = tryParseUrl(url);
    const urlLower = url.toLowerCase();
    const htmlLower = html.toLowerCase();

    // Profile pages
    if ((parsedUrl && hostnameMatches(parsedUrl, 'linkedin.com') && pathnameMatchesPrefix(parsedUrl, '/in')) ||
        urlLower.includes('/profile') ||
        htmlLower.includes('profile') && htmlLower.includes('experience')) {
      return 'profile';
    }

    // Product pages
    if ((parsedUrl && pathnameMatchesPrefix(parsedUrl, '/product')) ||
        (parsedUrl && hostnameMatches(parsedUrl, 'amazon.com') && pathnameMatchesPrefix(parsedUrl, '/dp')) ||
        htmlLower.includes('add to cart') ||
        htmlLower.includes('price') && htmlLower.includes('reviews')) {
      return 'product';
    }

    // Search results
    if (isSearchEngineResultsUrl(url) ||
        htmlLower.includes('search results') ||
        htmlLower.includes('results for')) {
      return 'search';
    }

    // Article pages
    if (htmlLower.includes('<article') ||
        htmlLower.includes('byline') ||
        htmlLower.includes('author') && htmlLower.includes('published') ||
        (parsedUrl && pathnameMatchesPrefix(parsedUrl, '/article')) ||
        (parsedUrl && pathnameMatchesPrefix(parsedUrl, '/blog'))) {
      return 'article';
    }

    return 'generic';
  }

  private async extractArticle(webview: BrowserWindow, html: string): Promise<ArticleContent> {
    const extracted = await webview.webContents.executeJavaScript(`
      (() => {
        // Try to find article content
        const article = document.querySelector('article') || document.querySelector('[role="main"]') || document.querySelector('main');
        const titleEl = document.querySelector('h1') || document.querySelector('.title') || document.querySelector('[class*="title"]');
        const authorEl = document.querySelector('[class*="author"]') || document.querySelector('.byline') || document.querySelector('[rel="author"]');
        const dateEl = document.querySelector('time') || document.querySelector('[class*="date"]') || document.querySelector('[class*="published"]');
        
        // Extract images
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => img.src)
          .filter(src => src && !src.includes('data:image') && !src.includes('avatar') && !src.includes('icon'))
          .slice(0, 10); // Max 10 images

        // Get main content
        const contentEl = article || document.querySelector('.content') || document.querySelector('#content') || document.body;
        let bodyText = '';
        
        if (contentEl) {
          // Remove unwanted elements
          const unwanted = contentEl.querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ads, .social-share');
          unwanted.forEach(el => el.remove());
          bodyText = contentEl.innerText || contentEl.textContent || '';
        }

        return {
          title: titleEl?.textContent?.trim() || document.title,
          author: authorEl?.textContent?.trim(),
          date: dateEl?.textContent?.trim() || dateEl?.getAttribute('datetime'),
          bodyText: bodyText.trim(),
          images,
          summary: document.querySelector('meta[name="description"]')?.getAttribute('content')
        };
      })()
    `);

    // Convert HTML to markdown if we have rich content
    if (html.includes('<p>') || html.includes('<h')) {
      try {
        const contentHtml = await webview.webContents.executeJavaScript(`
          (() => {
            const article = document.querySelector('article') || document.querySelector('[role="main"]') || document.querySelector('main');
            const contentEl = article || document.querySelector('.content') || document.querySelector('#content');
            
            if (contentEl) {
              // Clean up
              const unwanted = contentEl.cloneNode(true).querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ads, .social-share');
              unwanted.forEach(el => el.remove());
              return contentEl.innerHTML;
            }
            return '';
          })()
        `);

        if (contentHtml) {
          extracted.bodyText = this.turndown.turndown(contentHtml);
        }
      } catch {
        log.info('Failed to convert to markdown, using text content');
      }
    }

    return extracted;
  }

  private async extractProfile(webview: BrowserWindow, _html: string): Promise<ProfileContent> {
    return await webview.webContents.executeJavaScript(`
      (() => {
        const name = document.querySelector('h1')?.textContent?.trim() ||
                    document.querySelector('.name')?.textContent?.trim() ||
                    document.querySelector('[class*="name"]')?.textContent?.trim();

        const headline = document.querySelector('.headline')?.textContent?.trim() ||
                        document.querySelector('[class*="headline"]')?.textContent?.trim() ||
                        document.querySelector('h2')?.textContent?.trim();

        const location = document.querySelector('[class*="location"]')?.textContent?.trim() ||
                        document.querySelector('.location')?.textContent?.trim();

        const summary = document.querySelector('[class*="summary"]')?.textContent?.trim() ||
                       document.querySelector('.about')?.textContent?.trim();

        // Extract experience (LinkedIn-like)
        const experience = Array.from(document.querySelectorAll('[class*="experience"] li, .experience li, [class*="job"]'))
          .slice(0, 5)
          .map(el => ({
            title: el.querySelector('h3, .title, [class*="title"]')?.textContent?.trim() || '',
            company: el.querySelector('[class*="company"], .company')?.textContent?.trim() || '',
            duration: el.querySelector('[class*="duration"], .duration, .dates')?.textContent?.trim(),
            description: el.querySelector('p, .description')?.textContent?.trim()
          }))
          .filter(exp => exp.title || exp.company);

        // Extract education
        const education = Array.from(document.querySelectorAll('[class*="education"] li, .education li, [class*="school"]'))
          .slice(0, 3)
          .map(el => ({
            institution: el.querySelector('h3, .school, [class*="school"]')?.textContent?.trim() || '',
            degree: el.querySelector('.degree, [class*="degree"]')?.textContent?.trim(),
            duration: el.querySelector('.dates, [class*="date"]')?.textContent?.trim()
          }))
          .filter(edu => edu.institution);

        return {
          name,
          headline,
          location,
          summary,
          experience: experience.length > 0 ? experience : undefined,
          education: education.length > 0 ? education : undefined
        };
      })()
    `);
  }

  private async extractProduct(webview: BrowserWindow, _html: string): Promise<ProductContent> {
    return await webview.webContents.executeJavaScript(`
      (() => {
        const name = document.querySelector('h1')?.textContent?.trim() ||
                    document.querySelector('[class*="product-name"]')?.textContent?.trim() ||
                    document.querySelector('.title')?.textContent?.trim();

        const price = document.querySelector('[class*="price"]')?.textContent?.trim() ||
                     document.querySelector('.price')?.textContent?.trim() ||
                     document.querySelector('[data-testid*="price"]')?.textContent?.trim();

        const description = document.querySelector('[class*="description"]')?.textContent?.trim() ||
                           document.querySelector('.description')?.textContent?.trim() ||
                           document.querySelector('meta[name="description"]')?.getAttribute('content');

        // Product images
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => img.src)
          .filter(src => src && !src.includes('data:image') && 
                  (src.includes('product') || src.includes('item') || img.alt?.toLowerCase().includes(name?.toLowerCase().split(' ')[0] || '')))
          .slice(0, 5);

        // Reviews summary
        const rating = document.querySelector('[class*="rating"]')?.textContent?.trim() ||
                      document.querySelector('.stars')?.textContent?.trim();
        
        const reviewCountEl = document.querySelector('[class*="review-count"], [class*="reviews"]');
        const reviewCount = reviewCountEl ? parseInt(reviewCountEl.textContent.replace(/D/g, '')) : undefined;

        const topReviews = Array.from(document.querySelectorAll('[class*="review"] p, .review p'))
          .slice(0, 3)
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 20);

        return {
          name: name || 'Unknown Product',
          price,
          description: description || '',
          images,
          reviewsSummary: rating || reviewCount || topReviews.length > 0 ? {
            rating,
            reviewCount,
            topReviews: topReviews.length > 0 ? topReviews : undefined
          } : undefined
        };
      })()
    `);
  }

  private async extractSearchResults(webview: BrowserWindow, _html: string): Promise<SearchContent> {
    return await webview.webContents.executeJavaScript(`
      (() => {
        // Extract search query
        const query = document.querySelector('input[type="search"]')?.value ||
                     document.querySelector('[name="q"]')?.value ||
                     new URLSearchParams(window.location.search).get('q') ||
                     new URLSearchParams(window.location.search).get('query');

        // Extract search results - try multiple selectors for different search engines
        const resultSelectors = [
          'div[class*="result"]',
          '.search-result',
          '[data-testid*="result"]',
          '.g', // Google
          '.b_result', // Bing
          '[data-layout="organic"]' // DuckDuckGo
        ];

        let results = [];
        for (const selector of resultSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            results = Array.from(elements).slice(0, 10).map(el => {
              const titleEl = el.querySelector('h2 a, h3 a, a h2, a h3, .title a') || el.querySelector('a');
              const title = titleEl?.textContent?.trim() || '';
              const url = titleEl?.href || '';
              const snippet = el.querySelector('.snippet, [class*="snippet"], [class*="description"]')?.textContent?.trim() || '';
              
              return { title, url, snippet };
            }).filter(result => result.title && result.url);
            
            if (results.length > 0) break;
          }
        }

        return {
          query,
          results
        };
      })()
    `);
  }

  private async extractGeneric(webview: BrowserWindow, _html: string): Promise<GenericContent> {
    return await webview.webContents.executeJavaScript(`
      (() => {
        const title = document.title;
        const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
        
        // Get main content
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || 
                     document.querySelector('.content') || document.querySelector('#content') ||
                     document.body;

        // Remove unwanted elements
        const unwanted = main?.querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ads') || [];
        unwanted.forEach(el => el.remove());

        const text = main?.innerText?.trim() || '';

        // Extract images
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => img.src)
          .filter(src => src && !src.includes('data:image'))
          .slice(0, 5);

        // Extract important links
        const links = Array.from(document.querySelectorAll('a'))
          .filter(a => a.href && a.textContent?.trim() && 
                      !a.href.startsWith('javascript:') && 
                      !a.href.startsWith('#'))
          .slice(0, 10)
          .map(a => ({
            text: a.textContent.trim(),
            href: a.href
          }));

        return {
          title,
          description,
          text,
          images,
          links
        };
      })()
    `);
  }
}
