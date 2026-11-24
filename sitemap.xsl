<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="publisher" content="FoulFoxHacks"/><meta name="robots" content="noindex,follow"/>
        <title>XML Sitemap — Ametherian</title><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"/>
        <style>
          :root{color-scheme:dark;--bg:#0b0812;--panel:#171125;--text:#f5f2fb;--muted:#b9b0c9;--line:#322847}
          *{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 520px at 80% 0%,rgba(139,83,254,.18),transparent 65%),var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
          a{color:#c4b5fd;text-decoration:none}a:hover{text-decoration:underline;color:#fff}.wrap{width:min(100% - 36px,1040px);margin:0 auto}
          header{padding:42px 0 30px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:12px;color:var(--text);font-weight:800;font-size:1.25rem}.brand img{width:42px;height:42px;object-fit:contain}
          .eyebrow{margin:20px 0 5px;color:#c4b5fd;font:600 .72rem/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:clamp(2rem,5vw,3.4rem);line-height:1.08;letter-spacing:-.05em}
          .intro{max-width:680px;color:var(--muted);margin:14px 0 0}.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.stat{padding:8px 12px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:.82rem}
          main{padding:30px 0 64px}section{margin:0 0 26px;padding:22px;border:1px solid var(--line);border-radius:16px;background:rgba(23,17,37,.82)}h2{margin:0 0 14px;font-size:1.2rem}
          .entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:13px 0;border-top:1px solid rgba(255,255,255,.07)}.entry:first-of-type{border-top:0}.loc{overflow-wrap:anywhere;font-size:.92rem}.date{color:var(--muted);font:.75rem ui-monospace,monospace}
          footer{padding:22px 0 36px;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem}@media(max-width:620px){.entry{grid-template-columns:1fr;gap:4px}section{padding:16px}}
        </style>
      </head>
      <body>
        <header><div class="wrap"><a class="brand" href="/"><img src="/assets/ametherian-mark.svg" alt=""/>Ametherian</a>
          <p class="eyebrow">FoulFoxHacks · Node.js library ecosystem</p><h1>XML Sitemap</h1>
          <p class="intro">A structured index of Ametherian's public pages. This branded view is a presentation layer; the underlying XML remains available to crawlers.</p>
          <div class="stats"><span class="stat"><xsl:value-of select="count(sm:urlset/sm:url)"/> public URLs</span><span class="stat">Sitemap Protocol</span></div>
        </div></header>
        <main class="wrap">
          <section><h2>Website and project policies</h2>
            <xsl:for-each select="sm:urlset/sm:url[not(contains(sm:loc,'/docs/'))]">
              <div class="entry"><a class="loc"><xsl:attribute name="href"><xsl:value-of select="sm:loc"/></xsl:attribute><xsl:value-of select="sm:loc"/></a><span class="date"><xsl:if test="sm:lastmod">Updated <xsl:value-of select="sm:lastmod"/></xsl:if></span></div>
            </xsl:for-each>
          </section>
          <section><h2>Documentation</h2>
            <xsl:for-each select="sm:urlset/sm:url[contains(sm:loc,'/docs/')]">
              <div class="entry"><a class="loc"><xsl:attribute name="href"><xsl:value-of select="sm:loc"/></xsl:attribute><xsl:value-of select="sm:loc"/></a><span class="date"><xsl:if test="sm:lastmod">Updated <xsl:value-of select="sm:lastmod"/></xsl:if></span></div>
            </xsl:for-each>
          </section>
        </main>
        <footer><div class="wrap">© Ametherian · Published by FoulFoxHacks · <a href="/">Return to website</a></div></footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
