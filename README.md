# Meaux Burreax: Tiers for Fears

A deliberately simple static website for sharing Meaux Burreax fantasy football tier lists and write-ups.

## Working with content

1. Put original files in `source-documents/` (this folder is intentionally ignored by Git).
2. Keep one page per year in `pages/`.
3. Copy the text faithfully, then apply the shared page pattern: year title, tier heading, and manager write-up.
4. Add the year to the navigation in `assets/site.js`.

The published years are `2024.html`, `2025.html`, and `2026.html`. The 2026 page also retains the images embedded in its source document under `assets/images/2026/`.

The site does not include a password mechanism. Do not publish private material to a public host. For a friends-only site, deploy the static files behind an identity gate such as Cloudflare Access, which supports allow policies for a protected hostname. See Cloudflare's documentation: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/

## Local preview

Open `index.html` directly in a browser, or serve this folder with any static web server. No build step or package installation is required.
