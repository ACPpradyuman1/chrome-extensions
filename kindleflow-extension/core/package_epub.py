#!/usr/bin/env python3
"""
Package EPUB — Master E-Book Compiler for Kindle & E-Readers
Converts any Markdown file into a validated EPUB 3 and native Kindle AZW3.
"""

import sys
import os
import re
import shutil
import argparse
import datetime
import subprocess
import zipfile

try:
    import lxml.etree as ET
except ImportError:
    ET = None

try:
    import markdown
except ImportError:
    print("Error: 'markdown' package required. Run: pip install markdown")
    sys.exit(1)

try:
    import ebooklib
    from ebooklib import epub
except ImportError:
    print("Error: 'ebooklib' package required. Run: pip install ebooklib")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def sanitize_filename(name):
    clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name)
    return re.sub(r'_+', '_', clean).strip('_')

_has_katex_node = None

def run_math_preprocessor(md_path, script_dir):
    """
    Renders LaTeX to MathML using Node+KaTeX if available, shielding currency tokens.
    Cached check ensures zero wasted subprocess delay if KaTeX is not installed.
    """
    global _has_katex_node
    if _has_katex_node is None:
        if shutil.which("node"):
            try:
                res = subprocess.run(["node", "-e", "require('katex')"], capture_output=True, timeout=1)
                _has_katex_node = (res.returncode == 0)
            except Exception:
                _has_katex_node = False
        else:
            _has_katex_node = False

    render_js = os.path.join(script_dir, "render_math.js")
    math_md_path = md_path.replace(".md", "_math.md")
    if _has_katex_node and os.path.exists(render_js):
        try:
            cmd = ["node", render_js, md_path, math_md_path]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if res.returncode == 0 and os.path.exists(math_md_path):
                return math_md_path
        except Exception:
            pass

    # Instant pure Python regex: shield currency and format math
    with open(md_path, "r", encoding="utf-8") as f:
        text = f.read()

    # Protect escaped dollars and currencies
    text = re.sub(r'\\(\$)', 'ESC_DOLLAR_TOKEN', text)
    text = re.sub(r'\$(\d[0-9,.]*[mbkMBK]?)', r'CURRENCY_TOKEN_\1', text)

    # Wrap display math in pre or math block if not rendered
    def math_block_wrap(m):
        code = m.group(1).strip()
        return f'\n\n<div class="math-block"><code>{code}</code></div>\n\n'

    text = re.sub(r'\$\$([\s\S]*?)\$\$', math_block_wrap, text)

    # Wrap inline math
    def math_inline_wrap(m):
        code = m.group(1).strip()
        return f'<span class="math-inline"><i>{code}</i></span>'

    text = re.sub(r'\$([^\$\n]+?)\$', math_inline_wrap, text)

    # Restore currency
    text = text.replace('CURRENCY_TOKEN_', '$').replace('ESC_DOLLAR_TOKEN', '$')

    with open(math_md_path, "w", encoding="utf-8") as f:
        f.write(text)
    return math_md_path

def generate_cover_image(title, author, subtitle, output_img, script_dir):
    """Calls generate_cover.py or creates a clean fallback image."""
    cover_py = os.path.join(script_dir, "generate_cover.py")
    if os.path.exists(cover_py):
        cmd = [sys.executable, cover_py, "--title", title, "--author", author, "--output", output_img]
        if subtitle:
            cmd.extend(["--subtitle", subtitle])
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0 and os.path.exists(output_img):
            return output_img

    # Pillow fallback
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (1600, 2400), color=(20, 25, 35))
        draw = ImageDraw.Draw(img)
        draw.rectangle([(50, 50), (1550, 2350)], outline=(200, 170, 100), width=4)
        draw.text((800, 1000), title, fill=(255, 255, 255), anchor="mm")
        if author:
            draw.text((800, 1300), f"By {author}", fill=(200, 170, 100), anchor="mm")
        img.save(output_img, "JPEG")
        return output_img
    except Exception as e:
        print(f"Notice: Pillow cover generation skipped: {e}")
        return None

def make_xhtml_page(title, body_html, css_rel_path="style/style.css"):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
    <meta charset="utf-8" />
    <title>{title}</title>
    <link rel="stylesheet" type="text/css" href="{css_rel_path}" />
</head>
<body>
{body_html}
</body>
</html>'''

def split_into_chapters(md_text):
    """
    Splits markdown into logical chapters.
    Tries splitting on '# ' (Level 1) or '## ' (Level 2).
    """
    # Check for # headings
    h1_matches = list(re.finditer(r'^#\s+([^\n]+)', md_text, re.M))
    if len(h1_matches) >= 2:
        chapters = []
        for i, match in enumerate(h1_matches):
            title = match.group(1).strip()
            start = match.start()
            end = h1_matches[i + 1].start() if i + 1 < len(h1_matches) else len(md_text)
            body = md_text[start:end].strip()
            chapters.append({"title": title, "content": body})
        return chapters

    # Check for ## headings
    h2_matches = list(re.finditer(r'^##\s+([^\n]+)', md_text, re.M))
    if len(h2_matches) >= 2:
        chapters = []
        for i, match in enumerate(h2_matches):
            title = match.group(1).strip()
            start = match.start()
            end = h2_matches[i + 1].start() if i + 1 < len(h2_matches) else len(md_text)
            body = md_text[start:end].strip()
            chapters.append({"title": title, "content": body})
        return chapters

    # Single chapter fallback
    return [{"title": "Content", "content": md_text}]

def compile_epub(
    input_md,
    output_epub=None,
    title=None,
    author="Reader",
    subtitle=None,
    cover_image=None,
    auto_azw3=True
):
    input_md = os.path.abspath(input_md)
    if not os.path.exists(input_md):
        print(f"Error: Input file {input_md} does not exist.")
        sys.exit(1)

    work_dir = os.path.dirname(input_md)
    base_name = os.path.splitext(os.path.basename(input_md))[0]

    if not title:
        title = base_name.replace("_", " ").replace("-", " ").title()

    if not output_epub:
        output_epub = os.path.join(work_dir, f"{sanitize_filename(title)}.epub")

    print(f"--- Packaging EPUB for Kindle: '{title}' ---")

    # 1. Math & Currency Pre-processing
    processed_md = run_math_preprocessor(input_md, SCRIPT_DIR)

    with open(processed_md, "r", encoding="utf-8") as f:
        md_text = f.read()

    # 2. Cover image
    if not cover_image or not os.path.exists(cover_image):
        generated_cover = os.path.join(work_dir, f"{sanitize_filename(title)}_cover.jpg")
        cover_image = generate_cover_image(title, author, subtitle, generated_cover, SCRIPT_DIR)

    # 3. Read CSS
    css_src = os.path.join(SCRIPT_DIR, "style.css")
    if os.path.exists(css_src):
        with open(css_src, "r", encoding="utf-8") as f:
            css_content = f.read()
    else:
        css_content = "body { margin: 0; padding: 0.5em; line-height: 1.5; }"

    # 4. Initialize EpubBook
    book = epub.EpubBook()
    book_uid = f"urn:uuid:{sanitize_filename(title).lower()}-{datetime.date.today().isoformat()}"
    book.set_identifier(book_uid)
    book.set_title(title)
    book.set_language("en")
    book.add_author(author)
    book.add_metadata("DC", "publisher", "Kindle Study Edition")
    book.add_metadata("DC", "date", datetime.date.today().isoformat())
    if subtitle:
        book.add_metadata("DC", "description", subtitle)

    # Add Cover
    if cover_image and os.path.exists(cover_image):
        with open(cover_image, "rb") as f:
            book.set_cover("images/cover.jpg", f.read())

    # Add CSS
    style_item = epub.EpubItem(
        uid="style_kindle",
        file_name="style/style.css",
        media_type="text/css",
        content=css_content
    )
    book.add_item(style_item)

    # Add any localized article images in work_dir to the EPUB manifest
    for fname in sorted(os.listdir(work_dir)):
        if fname.startswith("img_") and fname.lower().endswith((".jpg", ".jpeg", ".png", ".gif")):
            img_path = os.path.join(work_dir, fname)
            try:
                with open(img_path, "rb") as f_img:
                    img_bytes = f_img.read()
                m_type = "image/jpeg" if fname.lower().endswith((".jpg", ".jpeg")) else "image/png"
                img_item = epub.EpubItem(
                    uid=f"asset_{sanitize_filename(fname)}",
                    file_name=fname,
                    media_type=m_type,
                    content=img_bytes
                )
                book.add_item(img_item)
            except Exception as e:
                print(f"Notice: Could not bundle image {fname}: {e}")

    # 5. Markdown extensions
    md_extensions = ['tables', 'fenced_code', 'def_list', 'attr_list']

    # Title Page
    title_html = f'''
    <div class="title-page">
        <h1 class="book-title">{title}</h1>
        {f'<div class="book-subtitle">{subtitle}</div>' if subtitle else ''}
        <div class="meta-divider"></div>
        <div class="book-author">By {author}</div>
        <div class="book-date">{datetime.date.today().strftime("%B %Y")}</div>
    </div>
    '''
    title_doc = make_xhtml_page("Title Page", title_html)
    title_item = epub.EpubHtml(title="Title Page", file_name="title_page.xhtml", lang="en")
    title_item.content = title_doc.encode('utf-8')
    title_item.add_item(style_item)
    book.add_item(title_item)

    # 6. Parse and Build Chapters
    chapters_raw = split_into_chapters(md_text)
    chapter_items = []
    toc_links = []
    toc_html_items = []

    for i, ch in enumerate(chapters_raw, 1):
        ch_title = ch["title"]
        raw_body_html = markdown.markdown(ch["content"], extensions=md_extensions)
        ch_xhtml = make_xhtml_page(ch_title, raw_body_html)

        # Validate with lxml if available
        if ET is not None:
            try:
                ET.fromstring(ch_xhtml.encode('utf-8'))
            except ET.XMLSyntaxError as e:
                print(f"XML Notice on Chapter {i} ({ch_title}): {e}. Escaping entity...")
                raw_body_html = raw_body_html.replace("&", "&amp;")
                ch_xhtml = make_xhtml_page(ch_title, raw_body_html)

        file_name = f"ch_{i:03d}_{sanitize_filename(ch_title)[:30]}.xhtml"
        item = epub.EpubHtml(title=ch_title, file_name=file_name, lang="en")
        item.content = ch_xhtml.encode('utf-8')
        item.add_item(style_item)
        book.add_item(item)
        chapter_items.append(item)
        toc_links.append(item)
        toc_html_items.append(f'<li class="toc-item"><a href="{file_name}">{ch_title}</a></li>')

    # In-line Table of Contents Page
    toc_body = f'''
    <h1>Table of Contents</h1>
    <ul class="toc-list">
        {''.join(toc_html_items)}
    </ul>
    '''
    toc_page = make_xhtml_page("Table of Contents", toc_body)
    toc_item = epub.EpubHtml(title="Table of Contents", file_name="toc_page.xhtml", lang="en")
    toc_item.content = toc_page.encode('utf-8')
    toc_item.add_item(style_item)
    book.add_item(toc_item)

    # Navigation & Spine
    book.toc = tuple([title_item, toc_item] + toc_links)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    spine = ["cover", title_item, toc_item] + chapter_items
    book.spine = spine

    # Write EPUB
    epub.write_epub(output_epub, book, {})
    size_kb = os.path.getsize(output_epub) / 1024
    print(f"Successfully compiled EPUB: {output_epub} ({size_kb:.1f} KB)")

    # Integrity verification
    with zipfile.ZipFile(output_epub, 'r') as zf:
        bad = zf.testzip()
        if bad is not None:
            print(f"Error: EPUB zip check failed on file: {bad}")
            return False
        else:
            print(f"EPUB ZIP integrity verified (0 errors, {len(zf.namelist())} files).")

    # Optional AZW3 compilation via Calibre
    if auto_azw3 and shutil.which("ebook-convert"):
        azw3_path = output_epub.replace(".epub", ".azw3")
        print(f"Compiling Kindle AZW3 with Calibre...")
        res = subprocess.run(["ebook-convert", output_epub, azw3_path], capture_output=True, text=True)
        if res.returncode == 0 and os.path.exists(azw3_path):
            azw3_size_kb = os.path.getsize(azw3_path) / 1024
            print(f"Successfully generated AZW3: {azw3_path} ({azw3_size_kb:.1f} KB)")
        else:
            print(f"Notice: Calibre AZW3 conversion failed or skipped: {res.stderr[:200]}")

    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Package Markdown into Kindle EPUB & AZW3")
    parser.add_argument("input", help="Path to input Markdown (.md) file")
    parser.add_argument("--output", "-o", default=None, help="Output EPUB path")
    parser.add_argument("--title", "-t", default=None, help="Book title")
    parser.add_argument("--author", "-a", default="Reader", help="Author name")
    parser.add_argument("--subtitle", "-s", default=None, help="Subtitle / description")
    parser.add_argument("--cover", "-c", default=None, help="Path to custom cover image")
    parser.add_argument("--no-azw3", action="store_true", help="Skip Calibre AZW3 generation")

    args = parser.parse_args()
    compile_epub(
        input_md=args.input,
        output_epub=args.output,
        title=args.title,
        author=args.author,
        subtitle=args.subtitle,
        cover_image=args.cover,
        auto_azw3=not args.no_azw3
    )
