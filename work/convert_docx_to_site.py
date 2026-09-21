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

# The page shell (theme script, fonts, favicon, full site nav, theme toggle)
# matches pages/_template.html. It is a plain string with __PLACEHOLDERS__
# rather than an f-string so the JavaScript braces don't need escaping.
# When you add a new top-level page, add it to the nav here and in
# pages/_template.html as well as in the other pages' headers.
PAGE_TEMPLATE = '''<!doctype html>
<html lang="en">
  <head>
    <script>
      (function () {
        try {
          var stored = localStorage.getItem('meaux-burreax-theme');
          document.documentElement.dataset.theme = stored === 'light' ? 'light' : 'dark';
        } catch (error) {
          document.documentElement.dataset.theme = 'dark';
        }
      })();
    </script>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="__YEAR__ Meaux Burreax fantasy football pre-season rankings.">
    <title>__TITLE__ · Meaux Burreax: Tiers for Fears</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../assets/site.css">
    <link rel="icon" type="image/png" href="../assets/images/favicon.png">
    <script src="../assets/site.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header"><div class="site-header__inner"><a class="site-name" href="../index.html">Meaux Burreax: Tiers for Fears</a><nav aria-label="Primary navigation"><ul class="site-nav"><li><a href="../index.html">Home</a></li><li><a href="index.html">Pre-Season Rankings</a></li><li><a href="power-rankings.html">ESPN Power Rankings</a></li><li><a href="profiles.html">Manager Profiles</a></li><li><a href="draftroom.html">Draft Room</a></li><li><a href="leaderboard.html">All-Time Leaderboard</a></li></ul></nav><button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false"><span class="theme-toggle__icon" aria-hidden="true">☾</span><span class="theme-toggle__label">Dark</span></button></div></header>
    <main id="main-content" class="content-wrap article rankings">
      <p class="eyebrow">Meaux Burreax · __YEAR__</p>
      <h1>__TITLE__</h1>
      <p class="article__meta"><a href="index.html">All years</a></p>
      __CONTENT__
    </main>
    <footer class="site-footer"><div class="content-wrap"><p>Meaux Burreax: Tiers for Fears.</p></div></footer>
  </body>
</html>'''

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

    # Substitute the document text last so nothing in it can be mistaken for a placeholder.
    page = (PAGE_TEMPLATE
            .replace('__YEAR__', year)
            .replace('__TITLE__', title)
            .replace('__CONTENT__', ''.join(content)))
    (PAGES / f'{year}.html').write_text(page, encoding='utf-8')

for year, source, title in FILES:
    convert(year, source, title)
