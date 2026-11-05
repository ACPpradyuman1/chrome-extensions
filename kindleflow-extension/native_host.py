#!/usr/bin/env python3
"""
KindleFlow Chrome Native Messaging Host
Processes web articles with Google Gemini AI, strips ads, preserves charts/diagrams,
and compiles into Kindle-optimized EPUB or formats for download.
Runs strictly on-demand (zero idle memory/CPU).
"""

import sys
import os
import json
import struct
import re
import urllib.request
import urllib.error
import urllib.parse
import datetime
import tempfile
import shutil

# Save native stdout buffer for Native Messaging protocol
_native_stdout = sys.stdout.buffer
_native_stdin = sys.stdin.buffer

# Crucial: Redirect sys.stdout to sys.stderr so any print() from submodules or libraries
# never corrupts Chrome's binary length-prefixed packet protocol on stdout!
sys.stdout = sys.stderr

# Self-contained core modules directory
HOST_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.join(HOST_DIR, "core")
if os.path.exists(CORE_DIR) and CORE_DIR not in sys.path:
    sys.path.insert(0, CORE_DIR)

def read_message():
    """Reads a message from Chrome Native Messaging (4-byte length prefix + JSON)."""
    raw_length = _native_stdin.read(4)
    if len(raw_length) == 0:
        return None
    length = struct.unpack('@I', raw_length)[0]
    message = _native_stdin.read(length).decode('utf-8')
    return json.loads(message)

def send_message(msg):
    """Sends a message back to Chrome Native Messaging."""
    content = json.dumps(msg).encode('utf-8')
    _native_stdout.write(struct.pack('@I', len(content)))
    _native_stdout.write(content)
    _native_stdout.flush()

def sanitize_slug(text):
    text = re.sub(r'[^\w\s-]', '', text).strip().lower()
    return re.sub(r'[-\s]+', '-', text)[:45]

def call_gemini_api(api_key, title, url, hostname, text_content, images):
    """
    Calls Google Gemini Flash to strip ads, filter relevant diagrams/charts,
    and structure into clean Markdown for Kindle Paperwhite.
    """
    # Truncate raw text if extremely large to stay well within limits (150,000 chars = ~25,000 words)
    truncated_text = text_content[:150000] if len(text_content) > 150000 else text_content

    prompt = f"""You are an expert editorial cleaner and publisher preparing an article for an Amazon Kindle Paperwhite e-reader.

SOURCE CONTEXT:
Article Title: {title}
Website: {hostname}
Source URL: {url}

CANDIDATE IMAGES FOUND ON PAGE:
{json.dumps(images[:60], indent=2)}

ARTICLE RAW TEXT:
{truncated_text}

YOUR MANDATORY PUBLISHING TASKS:
1. STRIP ALL JUNK & ADS: Remove all advertising, sponsored links, "Read Next" / "Related stories" sections, newsletter subscriptions, author social media plugs, cookie/GDPR disclaimers, and interactive UI widgets.
2. SMART IMAGE FILTERING: Inspect the candidate images. Keep ONLY informative charts, diagrams, infographics, screenshots, and illustrations that explain or enhance the article text. Discard ad banners, tracking pixels, brand logos, author headshots, and decorative icons. Embed kept images using markdown: ![caption](image_url).
3. E-INK STRUCTURING: Organize into clean, readable GitHub-Flavored Markdown:
   - Use clear hierarchical headings (# Title, ## Main Sections, ### Subsections).
   - Clean paragraphs with proper emphasis (**bold**, *italic*).
   - Format comparison data into clean Markdown tables.
   - Preserve all code blocks (in ```), formulas, and quotes (in >).
4. EXECUTIVE SUMMARY: Include a crisp 2-3 bullet "Executive Summary & Key Takeaways" section directly under the title.

OUTPUT FORMAT:
Return ONLY the clean Markdown text. Do NOT wrap your entire answer in ```markdown or add any conversational introduction/conclusion."""

    request_body = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192
        }
    }

    # High-reliability models in priority order
    candidate_models = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"]
    last_err = None

    import time
    for model in candidate_models:
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(request_body).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )

        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=40) as resp:
                    result = json.loads(resp.read().decode('utf-8'))
                    candidates = result.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            cleaned = parts[0]["text"].strip()
                            # Remove outer fences if model returned them
                            if cleaned.startswith("```markdown"):
                                cleaned = cleaned[11:].strip()
                            if cleaned.startswith("```"):
                                cleaned = cleaned[3:].strip()
                            if cleaned.endswith("```"):
                                cleaned = cleaned[:-3].strip()
                            return cleaned
            except urllib.error.HTTPError as e:
                last_err = e
                # Transient 503 (high demand) or 429: wait and retry
                if e.code in (503, 429) and attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                break
            except Exception as e:
                last_err = e
                if attempt < 2:
                    time.sleep(1.0)
                    continue
                break

    raise Exception(f"Gemini API request failed across models: {last_err}")

def fallback_local_clean(title, html, text_content, url, hostname, byline="", subtitle="", lead_image=""):
    """Converts clean HTML into structured Markdown without external AI."""
    if html and html.strip():
        try:
            import lxml.html
            doc = lxml.html.fromstring(html)

            # Strip any lingering unwanted nodes
            for tag in doc.xpath('//script | //style | //noscript | //iframe | //svg | //button | //input | //form'):
                try: tag.drop_tree()
                except Exception: pass

            def walk(node):
                tag = node.tag.lower() if isinstance(node.tag, str) else ''
                text = (node.text or '').strip()
                tail = (node.tail or '').strip()

                children_md = ''.join([walk(c) for c in node.iterchildren() if isinstance(c.tag, str)])
                inner = (text + ' ' + children_md).strip()

                if tag == 'h1': res = f'\n\n# {inner}\n\n'
                elif tag == 'h2': res = f'\n\n## {inner}\n\n'
                elif tag == 'h3': res = f'\n\n### {inner}\n\n'
                elif tag == 'h4': res = f'\n\n#### {inner}\n\n'
                elif tag in ['h5', 'h6']: res = f'\n\n##### {inner}\n\n'
                elif tag == 'p': res = f'\n\n{inner}\n\n'
                elif tag == 'blockquote': res = f'\n\n> {inner}\n\n'
                elif tag == 'li': res = f'- {inner}\n'
                elif tag in ['ul', 'ol']: res = f'\n\n{inner}\n\n'
                elif tag in ['strong', 'b']: res = f'**{inner}**'
                elif tag in ['em', 'i']: res = f'*{inner}*'
                elif tag == 'a':
                    href = node.get('href', '')
                    res = f'[{inner}]({href})' if href and not href.startswith('javascript:') and inner else inner
                elif tag == 'img':
                    src = node.get('src') or node.get('data-src') or ''
                    alt = node.get('alt') or 'Figure'
                    lsrc = src.lower()
                    if not src or any(k in lsrc for k in ['divider', 'icon', 'pixel', 'tracker', 'loading', 'logo']):
                        res = ''
                    else:
                        res = f'\n\n![{alt}]({src})\n\n'
                elif tag == 'br': res = '\n'
                elif tag == 'hr': res = '\n\n---\n\n'
                else: res = inner

                if tail: res += ' ' + tail
                return res

            body = ''.join([walk(c) for c in doc.iterchildren() if isinstance(c.tag, str)])
            body = re.sub(r'\n{3,}', '\n\n', body).strip()

            header = f'# {title}\n\n'
            if subtitle: header += f'*{subtitle}*\n\n'
            if byline: header += f'**By {byline}** • *{hostname}*\n\n'
            if lead_image and lead_image not in body:
                header += f'![{title}]({lead_image})\n\n'

            return header + body
        except Exception:
            pass

    # Heuristic line filtering if HTML parsing fails
    lines = [line.strip() for line in text_content.split('\n') if line.strip()]
    filtered = []
    bad_terms = ["subscribe", "cookie", "advertisement", "share on twitter", "sign up", "terms of use", "privacy policy"]
    for l in lines:
        lower = l.lower()
        if any(term in lower for term in bad_terms):
            continue
        filtered.append(l)

    body = "\n\n".join(filtered)
    header = f"# {title}\n\n"
    if byline: header += f"**By {byline}** • "
    header += f"*Source: [{hostname}]({url})*\n\n"
    return header + body

def download_and_localize_images(md_text, target_dir, source_url=""):
    """
    Downloads remote images referenced in markdown in parallel (fast!)
    with gzip compression and converts to JPEG for maximum Kindle compatibility.
    """
    import concurrent.futures
    import gzip
    try:
        from PIL import Image
    except ImportError:
        Image = None

    img_pattern = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')
    matches = list(img_pattern.finditer(md_text))[:15] # Keep up to top 15 diagrams/figures

    if not matches:
        return md_text

    def fetch_single_image(idx, match):
        alt = match.group(1)
        raw_url = match.group(2).strip()
        url = urllib.parse.urljoin(source_url, raw_url)
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                    'Accept-Encoding': 'gzip, deflate'
                }
            )
            with urllib.request.urlopen(req, timeout=4) as response:
                img_bytes = response.read()
                if response.info().get('Content-Encoding') == 'gzip':
                    try:
                        img_bytes = gzip.decompress(img_bytes)
                    except Exception:
                        pass

            ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
            if not ext or ext in ['.webp', '.avif']:
                ext = '.jpg'

            local_filename = f"img_{idx:02d}.jpg"
            local_path = os.path.join(target_dir, local_filename)

            if Image:
                import io
                with Image.open(io.BytesIO(img_bytes)) as pil_img:
                    rgb_img = pil_img.convert('RGB')
                    # Downscale huge images to fit Carta 1300 Kindle screen without bloating file size
                    if rgb_img.width > 1600 or rgb_img.height > 2400:
                        resample_mode = getattr(Image, 'Resampling', Image).LANCZOS if hasattr(Image, 'Resampling') else Image.ANTIALIAS
                        rgb_img.thumbnail((1600, 2400), resample_mode)
                    rgb_img.save(local_path, "JPEG", quality=85, optimize=True)
            else:
                with open(local_path, "wb") as f:
                    f.write(img_bytes)

            return (match.group(0), f'![{alt}]({local_filename})')
        except Exception:
            return (match.group(0), f'*[Figure: {alt or "Chart"}]*')

    workers = min(8, len(matches))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(fetch_single_image, i, m) for i, m in enumerate(matches, 1)]
        for f in concurrent.futures.as_completed(futures):
            try:
                orig, repl = f.result()
                md_text = md_text.replace(orig, repl)
            except Exception:
                pass

    return md_text

def main():
    payload = read_message()
    if not payload:
        return

    action = payload.get("action", "kindle")

    # Handle configuration requests from extension
    if action == "get_config":
        cfg = {}
        try:
            cfg_path = os.path.expanduser("~/.config/kindle/config.json")
            if os.path.exists(cfg_path):
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
        except Exception:
            pass
        send_message({
            "step": "config",
            "geminiApiKey": cfg.get("gemini_api_key", ""),
            "kindleEmail": cfg.get("kindle_email", ""),
            "senderEmail": cfg.get("sender_email", "")
        })
        return

    if action == "save_config":
        cfg_path = os.path.expanduser("~/.config/kindle/config.json")
        os.makedirs(os.path.dirname(cfg_path), exist_ok=True)
        cfg = {}
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
            except Exception:
                pass
        if "geminiApiKey" in payload: cfg["gemini_api_key"] = payload["geminiApiKey"].strip()
        if "kindleEmail" in payload: cfg["kindle_email"] = payload["kindleEmail"].strip()
        if "senderEmail" in payload: cfg["sender_email"] = payload["senderEmail"].strip()
        try:
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2)
            send_message({"step": "done", "message": "Settings saved successfully."})
        except Exception as e:
            send_message({"step": "error", "message": f"Failed to save settings: {e}"})
        return

    title = payload.get("title", "Saved Article").strip()
    byline = payload.get("byline", "").strip()
    subtitle = payload.get("subtitle", "").strip()
    lead_image = payload.get("leadImage", "").strip()
    url = payload.get("url", "")
    hostname = payload.get("hostname", "")
    html = payload.get("html", "")
    text_content = payload.get("textContent", "")
    images = payload.get("images", [])
    api_key = payload.get("geminiApiKey", "").strip()
    if not api_key:
        try:
            cfg_path = os.path.expanduser("~/.config/kindle/config.json")
            if os.path.exists(cfg_path):
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg_data = json.load(f)
                    api_key = cfg_data.get("gemini_api_key", "").strip()
        except Exception:
            pass

    slug = sanitize_slug(title)

    # Performance optimization: For EPUB/Kindle, generate the 300 PPI cover in parallel
    # on a background thread while Gemini is streaming over the network!
    temp_dir = None
    cover_future = None
    cover_executor = None

    if action in ["epub", "kindle"]:
        import concurrent.futures
        temp_dir = tempfile.mkdtemp(prefix="kindleflow_")
        cover_path = os.path.join(temp_dir, "cover.jpg")
        cover_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)

        def make_cover_task():
            try:
                import generate_cover
                return generate_cover.generate_cover(
                    title=title,
                    subtitle=subtitle or f"Article from {hostname}",
                    author=byline or hostname or "KindleFlow",
                    output_path=cover_path,
                    theme="slate_gold"
                )
            except Exception:
                return None

        cover_future = cover_executor.submit(make_cover_task)

    skip_gemini = payload.get("skipGemini", False)

    # 1. Step: Content Structuring (Gemini AI or Direct Offline Cleaner)
    if skip_gemini:
        send_message({"step": "gemini", "message": "Direct mode: bypassing Google AI processing, using local clean parser..."})
        cleaned_md = fallback_local_clean(title, html, text_content, url, hostname, byline, subtitle, lead_image)
    else:
        send_message({"step": "gemini", "message": "Gemini analyzing content & filtering ads/diagrams..."})
        try:
            if api_key:
                cleaned_md = call_gemini_api(api_key, title, url, hostname, text_content, images)
                send_message({"step": "gemini", "message": "Gemini successfully structured article & kept relevant diagrams."})
            else:
                send_message({"step": "gemini", "message": "No API key found. Using local heuristic cleaner (add Gemini key in Settings for AI cleaning)."})
                cleaned_md = fallback_local_clean(title, html, text_content, url, hostname, byline, subtitle, lead_image)
        except Exception as e:
            send_message({"step": "gemini", "message": f"Gemini notice ({e}). Falling back to local cleaner..."})
            cleaned_md = fallback_local_clean(title, html, text_content, url, hostname, byline, subtitle, lead_image)

    # Handle Markdown Download Action
    if action == "markdown":
        frontmatter = f"---\ntitle: \"{title}\"\nsource: \"{url}\"\nsite: \"{hostname}\"\ndate: \"{datetime.date.today().isoformat()}\"\n---\n\n"
        full_md = frontmatter + cleaned_md
        encoded = urllib.parse.quote(full_md)
        data_url = f"data:text/markdown;charset=utf-8,{encoded}"
        send_message({
            "step": "done",
            "message": "Markdown file prepared.",
            "downloadUrl": data_url,
            "filename": f"{slug}.md"
        })
        return

    # Handle HTML Download Action
    if action == "html":
        try:
            import markdown
            html_body = markdown.markdown(cleaned_md, extensions=['tables', 'fenced_code'])
        except Exception:
            html_body = f"<pre>{cleaned_md}</pre>"

        html_doc = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
body {{ font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }}
img {{ max-width: 100%; height: auto; border-radius: 6px; }}
table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
th, td {{ border: 1px solid #ddd; padding: 8px 12px; }}
th {{ background: #f4f4f4; }}
pre {{ background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; }}
blockquote {{ border-left: 4px solid #c6a869; margin: 0; padding-left: 16px; color: #555; }}
</style>
</head>
<body>
<h1>{title}</h1>
<p><em>Source: <a href="{url}">{hostname}</a> • Saved on {datetime.date.today().strftime('%B %d, %Y')}</em></p>
<hr>
{html_body}
</body>
</html>"""
        encoded = urllib.parse.quote(html_doc)
        data_url = f"data:text/html;charset=utf-8,{encoded}"
        send_message({
            "step": "done",
            "message": "HTML file prepared.",
            "downloadUrl": data_url,
            "filename": f"{slug}.html"
        })
        return

    # Handle Download Kindle EPUB Action
    if action == "epub":
        if not temp_dir:
            temp_dir = tempfile.mkdtemp(prefix="kindleflow_")
        try:
            send_message({"step": "package", "message": "Downloading & converting diagrams into E-Ink formats..."})
            localized_md = download_and_localize_images(cleaned_md, temp_dir, source_url=url)

            md_path = os.path.join(temp_dir, "article.md")
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(localized_md)

            # Await the pre-generated cover (already finished while Gemini was running!)
            cover_path = cover_future.result() if cover_future else None

            # Compile EPUB 3
            send_message({"step": "package", "message": "Compiling EPUB 3 with Carta 1300 stylesheet..."})
            epub_path = os.path.join(temp_dir, f"{slug}.epub")
            import package_epub
            package_epub.compile_epub(
                input_md=md_path,
                output_epub=epub_path,
                title=title,
                author=hostname or "Web Article",
                subtitle=f"Published on {hostname} • Prepared for Kindle Paperwhite",
                cover_image=cover_path,
                auto_azw3=False
            )

            # Read compiled EPUB as Base64 Data URL
            import base64
            with open(epub_path, "rb") as f:
                epub_b64 = base64.b64encode(f.read()).decode('utf-8')

            data_url = f"data:application/epub+zip;base64,{epub_b64}"
            send_message({
                "step": "done",
                "message": "Kindle EPUB compiled successfully.",
                "downloadUrl": data_url,
                "filename": f"{slug}.epub"
            })
            return
        except Exception as e:
            send_message({"status": "error", "message": f"Compilation error: {e}"})
            return
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    # Handle Send to Kindle Action
    if action == "kindle":
        if not temp_dir:
            temp_dir = tempfile.mkdtemp(prefix="kindleflow_")
        try:
            send_message({"step": "package", "message": "Downloading & converting diagrams into E-Ink formats..."})
            localized_md = download_and_localize_images(cleaned_md, temp_dir, source_url=url)

            md_path = os.path.join(temp_dir, "article.md")
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(localized_md)

            # Await the pre-generated cover (already finished while Gemini was running!)
            cover_path = cover_future.result() if cover_future else None

            # Compile EPUB 3
            send_message({"step": "package", "message": "Compiling EPUB 3 with Carta 1300 stylesheet..."})
            epub_path = os.path.join(temp_dir, f"{slug}.epub")
            import package_epub
            package_epub.compile_epub(
                input_md=md_path,
                output_epub=epub_path,
                title=title,
                author=hostname or "Web Article",
                subtitle=f"Published on {hostname} • Prepared for Kindle Paperwhite",
                cover_image=cover_path,
                auto_azw3=False # Send to Kindle accepts EPUB directly
            )

            # Dispatch via send_to_kindle
            send_message({"step": "dispatch", "message": "Sending wirelessly to your Kindle..."})
            import send_to_kindle
            cfg = send_to_kindle.load_config()
            res = send_to_kindle.send_via_email(
                epub_path,
                cfg,
                subject=f"Article: {title[:50]}"
            )

            if isinstance(res, tuple):
                success, status_msg = res
            else:
                success, status_msg = res, "Done"

            if success:
                send_message({
                    "step": "done",
                    "status": "success",
                    "message": "Delivered to your Kindle! Ready to read on your Paperwhite."
                })
            else:
                send_message({
                    "status": "error",
                    "message": status_msg
                })
        except Exception as e:
            send_message({"status": "error", "message": f"Compilation error: {e}"})
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
