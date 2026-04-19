#!/usr/bin/env python3
"""
Generate docs/changelog.html from GitHub Releases JSON (via stdin).
Invoked by bin/update-changelog.sh — do not run directly.
"""

import json
import html
import re
import sys
import datetime


def md_to_html(text):
    """Minimal Markdown-to-HTML converter for GitHub release notes."""
    if not text or not text.strip():
        return '<p><em>(no release notes)</em></p>'

    lines = text.split('\n')
    out = []
    in_list = False
    in_code = False
    code_buf = []

    for raw in lines:
        line = raw.rstrip()

        # Code fences
        if line.startswith('```'):
            if in_code:
                out.append('<pre><code>' + html.escape('\n'.join(code_buf)) + '</code></pre>')
                code_buf = []
                in_code = False
            else:
                if in_list:
                    out.append('</ul>')
                    in_list = False
                in_code = True
            continue

        if in_code:
            code_buf.append(line)
            continue

        # Headings
        if line.startswith('### '):
            if in_list:
                out.append('</ul>')
                in_list = False
            out.append('<h4>' + html.escape(line[4:]) + '</h4>')
            continue
        if line.startswith('## '):
            if in_list:
                out.append('</ul>')
                in_list = False
            out.append('<h3>' + html.escape(line[3:]) + '</h3>')
            continue
        if line.startswith('# '):
            if in_list:
                out.append('</ul>')
                in_list = False
            out.append('<h3>' + html.escape(line[2:]) + '</h3>')
            continue

        # Bullets
        m = re.match(r'^[*\-+]\s+(.+)$', line)
        if m:
            if not in_list:
                out.append('<ul>')
                in_list = True
            content = inline_format(html.escape(m.group(1)))
            out.append('  <li>' + content + '</li>')
            continue

        # Blank line
        if not line.strip():
            if in_list:
                out.append('</ul>')
                in_list = False
            continue

        # Plain paragraph
        if in_list:
            out.append('</ul>')
            in_list = False
        content = inline_format(html.escape(line))
        out.append('<p>' + content + '</p>')

    if in_list:
        out.append('</ul>')
    if in_code:
        out.append('<pre><code>' + html.escape('\n'.join(code_buf)) + '</code></pre>')

    return '\n'.join(out)


def inline_format(content):
    """Apply inline formatting to an already-HTML-escaped string."""
    # Inline code (escaped backticks become &#x60; — handle the raw char first)
    content = re.sub(r'`([^`]+)`', r'<code>\1</code>', content)
    # Bold
    content = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', content)
    # Links — unescape &amp; in href so URLs stay valid
    def link_replace(m):
        label = m.group(1)
        href = m.group(2)
        return '<a href="' + href + '">' + label + '</a>'
    content = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link_replace, content)
    return content


def build_html(releases):
    latest_tag = releases[0]['tag_name'] if releases else 'v0.75.0'
    generated = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    sections = []
    for r in releases:
        if r.get('draft'):
            continue
        tag = r['tag_name']
        name = r.get('name') or tag
        pub = r.get('published_at', '') or ''
        date_iso = pub[:10] if pub else ''
        prerelease = r.get('prerelease', False)
        body = r.get('body', '') or ''
        body_html = md_to_html(body)
        pre_label = ' <span class="cl-pre">pre-release</span>' if prerelease else ''

        sections.append(f'''
<article class="release" id="{html.escape(tag)}">
<header class="release-head">
<h2><a href="#{html.escape(tag)}">{html.escape(name)}</a>{pre_label}</h2>
<div class="release-meta">{html.escape(tag)} &middot; {html.escape(date_iso)} &middot; <a href="https://github.com/hydro13/tandem-browser/releases/tag/{html.escape(tag)}">View on GitHub &rarr;</a></div>
</header>
<div class="release-body">
{body_html}
</div>
</article>
''')

    sections_html = ''.join(sections)

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Changelog — Tandem Browser releases</title>
<meta name="description" content="Release notes for Tandem Browser — every version, what changed, when. Tandem Browser is in active development; this page is regenerated from GitHub Releases.">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="https://tandembrowser.org/changelog">
<meta property="og:title" content="Tandem Browser changelog">
<meta property="og:description" content="Release notes for Tandem Browser — every version, what changed.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://tandembrowser.org/changelog">
<meta property="og:image" content="https://tandembrowser.org/og.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{
--bg:#0a0a0b;--bg2:#111113;--bg3:#1a1a1d;
--text:#e8e6e0;--text2:#a8a6a0;--text3:#6a6862;
--accent:#da7756;--accent2:#e89b7d;
--green:#5DCAA5;--blue:#85B7EB;--red:#F09595;
--mono:'JetBrains Mono',monospace;
--serif:'Source Serif 4',Georgia,serif;
--border:#2a2a2d;
}}
html{{scroll-behavior:smooth;font-size:16px}}
body{{background:var(--bg);color:var(--text);font-family:var(--mono);line-height:1.7;overflow-x:hidden}}
a{{color:var(--accent);text-decoration:none;transition:color .2s}}
a:hover{{color:var(--accent2)}}

.grain{{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:.03;z-index:9999;
background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}}

header.site{{padding:2rem 0;border-bottom:1px solid var(--border)}}
.nav{{max-width:960px;margin:0 auto;padding:0 2rem;display:flex;justify-content:space-between;align-items:center}}
.logo{{font-size:1.1rem;font-weight:600;letter-spacing:-.02em;color:var(--text)}}
.logo span{{color:var(--accent)}}
.nav-links{{display:flex;gap:1.5rem;font-size:.8rem;color:var(--text2)}}
.nav-links a{{color:var(--text2)}}
.nav-links a:hover{{color:var(--text)}}

.hero{{max-width:960px;margin:0 auto;padding:4rem 2rem 2rem}}
.hero-label{{font-size:.75rem;color:var(--accent);letter-spacing:.15em;text-transform:uppercase;margin-bottom:1rem}}
.hero h1{{font-family:var(--serif);font-size:clamp(1.8rem,4vw,2.6rem);font-weight:600;line-height:1.2;letter-spacing:-.03em;color:var(--text);margin-bottom:1rem}}
.hero p{{font-size:.92rem;color:var(--text2);max-width:680px;line-height:1.7}}

.preview-banner{{max-width:960px;margin:1.5rem auto 0;padding:0 2rem}}
.preview-banner-inner{{padding:.85rem 1.1rem;background:rgba(218,119,86,.06);border:1px solid rgba(218,119,86,.2);border-radius:6px;font-size:.78rem;color:var(--text2);line-height:1.6}}
.preview-banner-inner strong{{color:var(--accent)}}

main{{max-width:960px;margin:0 auto;padding:2rem 2rem 4rem}}

.release{{margin-top:2.5rem;padding-top:2rem;border-top:1px solid var(--border)}}
.release:first-of-type{{border-top:none;padding-top:0}}
.release-head h2{{font-family:var(--serif);font-size:1.4rem;font-weight:600;letter-spacing:-.02em;margin-bottom:.4rem;line-height:1.3}}
.release-head h2 a{{color:var(--text)}}
.release-head h2 a:hover{{color:var(--accent)}}
.cl-pre{{display:inline-block;font-family:var(--mono);font-size:.65rem;color:var(--text3);background:var(--bg3);padding:.15rem .45rem;border-radius:3px;margin-left:.4rem;letter-spacing:.05em;text-transform:uppercase;vertical-align:middle}}
.release-meta{{font-size:.75rem;color:var(--text3);margin-bottom:1.2rem}}
.release-meta a{{color:var(--text3)}}
.release-meta a:hover{{color:var(--text2)}}
.release-body h3{{font-family:var(--serif);font-size:1rem;font-weight:600;color:var(--text);margin:1.5rem 0 .6rem;letter-spacing:-.01em}}
.release-body h4{{font-size:.82rem;font-weight:600;color:var(--text);margin:1.1rem 0 .4rem;text-transform:uppercase;letter-spacing:.05em}}
.release-body p{{font-size:.82rem;color:var(--text2);margin-bottom:.8rem;line-height:1.7}}
.release-body ul{{list-style:none;padding-left:0;margin-bottom:.8rem}}
.release-body li{{font-size:.82rem;color:var(--text2);line-height:1.7;padding-left:1.2rem;position:relative;margin-bottom:.3rem}}
.release-body li::before{{content:"→";position:absolute;left:0;color:var(--accent);font-weight:600}}
.release-body code{{background:var(--bg3);padding:.1rem .35rem;border-radius:3px;font-size:.75rem;color:var(--green)}}
.release-body pre{{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:1rem;overflow-x:auto;margin:.8rem 0;font-size:.75rem;line-height:1.5}}
.release-body pre code{{background:transparent;padding:0;color:var(--text)}}
.release-body strong{{color:var(--text)}}
.release-body a{{color:var(--accent);text-decoration:underline;text-decoration-color:rgba(218,119,86,.3)}}
.release-body a:hover{{text-decoration-color:var(--accent2)}}

.footer-note{{text-align:center;font-size:.7rem;color:var(--text3);margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border)}}

footer{{max-width:960px;margin:0 auto;padding:3rem 2rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:.75rem;color:var(--text3);flex-wrap:wrap;gap:1rem}}
footer a{{color:var(--text3)}}
footer a:hover{{color:var(--text2)}}

@media(max-width:700px){{
.nav-links{{display:none}}
}}
</style>
</head>
<body>
<div class="grain"></div>
<header class="site">
<nav class="nav">
<div class="logo"><a href="/" style="color:inherit"><span>Tandem</span> Browser</a></div>
<div class="nav-links">
<a href="/">Home</a>
<a href="/#how">How it works</a>
<a href="/#security">Security</a>
<a href="/#faq">FAQ</a>
<a href="/api">API</a>
<a href="https://github.com/hydro13/tandem-browser">GitHub</a>
</div>
</nav>
</header>

<div class="hero">
<div class="hero-label">Changelog</div>
<h1>Tandem Browser releases</h1>
<p>Every release of Tandem Browser, with full notes. This page is regenerated from <a href="https://github.com/hydro13/tandem-browser/releases">GitHub Releases</a> after each version ships.</p>
</div>

<div class="preview-banner">
<div class="preview-banner-inner"><strong>Note:</strong> Tandem Browser is in active development preview ({html.escape(latest_tag)}). Releases ship frequently; expect rough edges, breaking changes between minor versions, and rapid iteration on the agent and security layers.</div>
</div>

<main>
{sections_html}
<div class="footer-note">Generated {html.escape(generated)}. Updates with each release on <a href="https://github.com/hydro13/tandem-browser/releases">GitHub</a>.</div>
</main>

<footer>
<div>&copy; 2026 Tandem Browser &middot; MIT License</div>
<div><a href="/">Home</a> &middot; <a href="/#faq">FAQ</a> &middot; <a href="https://github.com/hydro13/tandem-browser">GitHub</a></div>
</footer>
</body>
</html>'''


if __name__ == '__main__':
    releases = json.load(sys.stdin)
    print(build_html(releases))
