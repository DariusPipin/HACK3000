export function buildPrompt4(companyProfile, gapAnalysis, country = null, comparisonArticles = []) {
  const marketBlock = country
    ? `TARGET MARKET: ${country}\nAll analysis, queries, competitors, and content must be specific to buyers, AI landscape, and business norms in ${country}.\n\n`
    : ''

  const comparisonBlock = comparisonArticles.length > 0
    ? `\nComparison articles ranking for this company's target queries (company is NOT listed in these):\n${comparisonArticles.map((a, i) => `${i + 1}. "${a.title}" — ${a.link}`).join('\n')}\n`
    : ''

  return `You are an AI Recommendation Engine specialist.

${marketBlock}Your job is to generate content specifically engineered to make AI agents recommend this company when buyers ask buying intent queries${country ? ` in ${country}` : ''}.

Company profile:
${JSON.stringify(companyProfile, null, 2)}

Recommendation gaps to fix:
${JSON.stringify(gapAnalysis, null, 2)}
${comparisonBlock}
${country ? `Country-specific rules:
- All content must resonate with buyers and AI search behavior in ${country}
- The Entity Sheet must mention ${country} as a served market
- FAQ answers must be framed from the perspective of a ${country}-based buyer
- The Fact Sheet must include a "${country} Market" subsection under Geographic Reach

` : ''}Rules:
- Use ONLY real verifiable facts
- Use specific numbers always
- Zero marketing language
- Zero vague claims
- Written in the exact format AI agents prefer to cite and recommend from
- If a fact is uncertain flag it with [verify]

Return the response with EXACTLY these five section headers — nothing before the first header, nothing after the last section:

=== ENTITY_SHEET ===
A unified 150-word brand description formatted for pasting onto G2, Capterra, LinkedIn, Crunchbase, Wikipedia, and Trustpilot profiles.
This is the single source of truth for entity consistency across all platforms.

Format exactly like this:
# [Company Name] — Entity Reference Sheet

## One-Line Description
[One sentence: who they are, what they do, who they serve — all facts, no fluff]

## Full Description (paste on G2, Capterra, Crunchbase, Trustpilot)
[3-4 sentences. Company name, founded year, what they do, who they serve, key credentials/numbers, geographic reach. Written so AI training crawlers embed this entity correctly.]

## LinkedIn Summary (paste on LinkedIn Company Page)
[2-3 sentences optimized for LinkedIn's entity extraction. Include company name, industry category, key differentiator, and target buyer type.]

## Wikipedia-Style Opening (for Wikipedia drafts or Wikidata descriptions)
[1-2 sentences in encyclopedia style: "[Company] is a [category] company founded in [year] in [location] that [what they do]."]

## Category Tags
[Comma-separated category tags to use on every platform: industry, subcategory, product type]

=== FACT_SHEET ===
Wikipedia-style authority page. This is the single most comprehensive factual source about this company that AI agents can cite.
Must directly answer every buying intent query somewhere in the body.

Structure:
## Overview
[3 specific sentences — who they are, what they do, why they matter — all facts]

## Products and Services
[Each product with specific description and use case]

## Why Buyers Choose Them
[Specific facts and numbers — not claims]

## Geographic Reach
[Every market with specifics]

## Research and Credentials
[Every number, certification, partnership]

## Key Facts at a Glance
[Bullet list of most important facts]

=== JSON_LD ===
Complete schema.org Organization JSON-LD markup ready to paste into HTML head tag.
Return ONLY clean JSON — no explanation, no markdown fences.

Must include all these fields:
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "",
  "legalName": "",
  "description": "",
  "foundingDate": "",
  "url": "",
  "location": {
    "@type": "Place",
    "name": "",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "",
      "addressCountry": ""
    }
  },
  "areaServed": [],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "",
    "itemListElement": []
  },
  "knowsAbout": [],
  "award": [],
  "slogan": ""
}

=== FAQ_BLOCK ===
Answer all 10 buying intent queries as the definitive authoritative source.

Each answer must:
- Start with the company name
- Include at least one specific fact or credential
- Be 2-3 sentences maximum
- Be written so AI agents cite this answer verbatim when asked the query

Format:
Q: [buying intent query]
A: [company name] [specific factual answer]

=== COMPARISON_OUTREACH ===
${comparisonArticles.length > 0
  ? `Outreach pitches to get ${companyProfile.company_name || 'the company'} listed in the top comparison articles that currently exclude them. These articles rank on Google and are cited by AI agents — getting listed here is a direct path to LLM recommendations.

For each article listed below, write a ready-to-send outreach pitch (email or LinkedIn DM) that:
- Names the specific article
- States why ${companyProfile.company_name || 'the company'} belongs in the list (1-2 specific facts)
- Offers a ready-to-use description the author can paste in
- Is under 100 words
- Has a clear subject line

Separate each pitch with ---`
  : `Write 3 outreach pitch templates for ${companyProfile.company_name || 'the company'} to get listed in "best [category]" comparison articles that rank on Google. These articles are cited by AI agents — getting listed is a direct path to LLM recommendations.

Each pitch must:
- Have a clear subject line
- State why the company belongs in the list (1-2 specific facts)
- Offer a ready-to-use description the author can paste in
- Be under 100 words

Separate each pitch with ---`}`
}
