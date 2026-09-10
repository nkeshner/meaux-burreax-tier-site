from html import escape
from pathlib import Path
from shutil import copyfileobj
import re
import sys
from docx import Document

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "pages"
IMAGES = ROOT / "assets" / "images"

FILES = [
    ("2024", Path(r"C:\Users\noahk\Downloads\2024 Fantasy Football Pre-Season Rankings.docx"), "2024 Pre-Season Rankings"),
    ("2025", Path(r"C:\Users\noahk\Downloads\2025 Fantasy Football Pre-Season Rankings.docx"), "2025 Pre-Season Rankings"),
    ("2026", Path(r"C:\Users\noahk\Downloads\2026 Fantasy Football Pre-Season Rankings.docx"), "2026 Pre-Season Rankings"),
]

def image_extension(part):
    return {
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/tiff": "tiff",
        "image/bmp": "bmp", "image/x-emf": "emf", "image/x-wmf": "wmf",
    }.get(part.content_type, "bin")

def drawing_html(paragraph, document, year, index):
    embeds = paragraph._p.xpath('.//a:blip/@r:embed')
    if not embeds:
        return [], index
    folder = IMAGES / year
    folder.mkdir(parents=True, exist_ok=True)
    images = []
    for embed in embeds:
        part = document.part.related_parts[embed]
        index += 1
        filename = f"source-{index}.{image_extension(part)}"
        (folder / filename).write_bytes(part.blob)
        images.append(f'<figure class="source-image"><img src="../assets/images/{year}/{filename}" alt="Embedded illustration from the source document"></figure>')
    return images, index

def convert(year, source, title):
    document = Document(source)
    paragraph_map = {id(p._p): p for p in document.paragraphs}
    content = []
    image_index = 0
    tier_open = False
    manager_open = False
    source_title_seen = False
    intro_seen = False

    for child in document.element.body.iterchildren():
        if child.tag.rsplit('}', 1)[-1] != 'p':
            continue
        paragraph = paragraph_map.get(id(child))
        if paragraph is None:
            continue
        images, image_index = drawing_html(paragraph, document, year, image_index)
        content.extend(images)
        text = paragraph.text.strip()
        if not text:
            continue
        safe = escape(text)
        style = paragraph.style.name.lower()
        if style == 'heading 1':
            source_title_seen = True
            content.append(f'<p class="source-title">{safe}</p>')
        elif style == 'heading 2':
            # The modern source files use their first Heading 2 as an opening deck.
            # Treat it as prose, not as a tier name.
            if source_title_seen and not intro_seen:
                intro_seen = True
                content.append(f'<p class="season-intro">{safe}</p>')
                continue
            if manager_open:
                content.append('</article>')
                manager_open = False
            if tier_open:
                content.append('</section>')
            tier_open = True
            content.append(f'<section class="tier"><h2>{safe}</h2>')
        elif style == 'heading 3':
            if manager_open:
                content.append('</article>')
            manager_open = True
            content.append(f'<article class="manager"><h3>{safe}</h3>')
        else:
            css = ' class="weakness"' if text.startswith('Weakness:') else ''
            content.append(f'<p{css}>{safe}</p>')

    if manager_open:
        content.append('</article>')
    if tier_open:
        content.append('</section>')

    page = f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="{year} Meaux Burreax fantasy football pre-season rankings.">
    <title>{title} · Meaux Burreax: Tiers for Fears</title>
    <link rel="stylesheet" href="../assets/site.css">
    <script src="../assets/site.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header"><div class="site-header__inner"><a class="site-name" href="../index.html">Meaux Burreax: Tiers for Fears</a><nav aria-label="Primary navigation"><ul class="site-nav"><li><a href="../index.html">Home</a></li><li><a href="index.html">Pre-Season Rankings</a></li></ul></nav></div></header>
    <main id="main-content" class="content-wrap article rankings">
      <p class="eyebrow">Meaux Burreax · {year}</p>
      <h1>{title}</h1>
      <p class="article__meta"><a href="index.html">All years</a></p>
      {''.join(content)}
    </main>
    <footer class="site-footer"><div class="content-wrap"><p>Meaux Burreax: Tiers for Fears.</p></div></footer>
  </body>
</html>'''
    (PAGES / f'{year}.html').write_text(page, encoding='utf-8')

for year, source, title in FILES:
    convert(year, source, title)
