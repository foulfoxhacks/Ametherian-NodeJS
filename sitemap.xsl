<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <div class="sitemap-groups">
      <section class="sitemap-group" aria-labelledby="sitemap-project-title">
        <div class="sitemap-group__heading"><p class="sitemap-group__eyebrow">01 · Project</p><h2 id="sitemap-project-title">Website and policies</h2></div>
        <div class="sitemap-entries">
          <xsl:for-each select="sm:urlset/sm:url[not(contains(sm:loc, '/docs/'))]">
            <article class="sitemap-entry"><a class="sitemap-entry__link"><xsl:attribute name="href"><xsl:value-of select="sm:loc"/></xsl:attribute><xsl:value-of select="sm:loc"/></a><span class="sitemap-entry__date"><xsl:if test="sm:lastmod">Updated <xsl:value-of select="sm:lastmod"/></xsl:if></span></article>
          </xsl:for-each>
        </div>
      </section>
      <section class="sitemap-group" aria-labelledby="sitemap-docs-title">
        <div class="sitemap-group__heading"><p class="sitemap-group__eyebrow">02 · Reference</p><h2 id="sitemap-docs-title">Documentation</h2></div>
        <div class="sitemap-entries">
          <xsl:for-each select="sm:urlset/sm:url[contains(sm:loc, '/docs/')]">
            <article class="sitemap-entry"><a class="sitemap-entry__link"><xsl:attribute name="href"><xsl:value-of select="sm:loc"/></xsl:attribute><xsl:value-of select="sm:loc"/></a><span class="sitemap-entry__date"><xsl:if test="sm:lastmod">Updated <xsl:value-of select="sm:lastmod"/></xsl:if></span></article>
          </xsl:for-each>
        </div>
      </section>
    </div>
  </xsl:template>
</xsl:stylesheet>
