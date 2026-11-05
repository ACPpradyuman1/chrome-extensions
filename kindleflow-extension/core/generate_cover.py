#!/usr/bin/env python3
"""
Kindle Cover Generator
Generates a crisp, high-resolution 1600x2400 (300 PPI) cover optimized for E-ink Carta screens
and Kindle library thumbnails.
"""

import sys
import os
import argparse
from PIL import Image, ImageDraw, ImageFont

def generate_cover(
    title,
    subtitle=None,
    author="Reader",
    tagline=None,
    footer="KINDLE E-INK EDITION",
    output_path="cover.jpg",
    theme="slate_gold"
):
    WIDTH = 1600
    HEIGHT = 2400

    themes = {
        "slate_gold": {
            "bg": (18, 24, 33),
            "primary": (198, 168, 105), # Antique Gold
            "text": (255, 255, 255),
            "muted": (200, 210, 225),
            "border_inner": (70, 85, 105)
        },
        "pure_black": {
            "bg": (10, 10, 10),
            "primary": (220, 220, 220),
            "text": (255, 255, 255),
            "muted": (160, 160, 160),
            "border_inner": (60, 60, 60)
        },
        "academic_navy": {
            "bg": (15, 23, 42),
            "primary": (56, 189, 248), # Sky blue accent
            "text": (255, 255, 255),
            "muted": (148, 163, 184),
            "border_inner": (51, 65, 85)
        }
    }

    palette = themes.get(theme, themes["slate_gold"])
    img = Image.new("RGB", (WIDTH, HEIGHT), color=palette["bg"])
    draw = ImageDraw.Draw(img)

    # Font resolver for macOS and Linux
    def load_font(name_list, size):
        for path in name_list:
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except Exception:
                    pass
        return ImageFont.load_default()

    font_serif_huge = load_font(["/System/Library/Fonts/Supplemental/Georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"], 95)
    font_serif_large = load_font(["/System/Library/Fonts/Supplemental/Georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"], 68)
    font_sans_bold = load_font(["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"], 38)
    font_sans_med = load_font(["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"], 30)
    font_sans_small = load_font(["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"], 24)

    # Borders
    draw.rectangle([(50, 50), (WIDTH - 50, HEIGHT - 50)], outline=palette["primary"], width=4)
    draw.rectangle([(66, 66), (WIDTH - 66, HEIGHT - 66)], outline=palette["border_inner"], width=2)

    # Corner accents
    for x, y in [(50, 50), (WIDTH - 50, 50), (50, HEIGHT - 50), (WIDTH - 50, HEIGHT - 50)]:
        draw.rectangle([(x - 8, y - 8), (x + 8, y + 8)], fill=palette["primary"])

    # Tagline
    if tagline:
        bbox = draw.textbbox((0, 0), tagline.upper(), font=font_sans_bold)
        w = bbox[2] - bbox[0]
        draw.text(((WIDTH - w) / 2, 220), tagline.upper(), fill=palette["primary"], font=font_sans_bold)
        draw.line([(WIDTH / 2 - 250, 290), (WIDTH / 2 + 250, 290)], fill=palette["primary"], width=2)

    # Title (word wrapped if needed)
    y_cursor = 480
    words = title.split()
    lines = []
    cur_line = []
    for word in words:
        cur_line.append(word)
        bbox = draw.textbbox((0, 0), " ".join(cur_line), font=font_serif_huge)
        if (bbox[2] - bbox[0]) > (WIDTH - 240):
            cur_line.pop()
            lines.append(" ".join(cur_line))
            cur_line = [word]
    if cur_line:
        lines.append(" ".join(cur_line))

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_serif_huge)
        w = bbox[2] - bbox[0]
        draw.text(((WIDTH - w) / 2, y_cursor), line, fill=palette["text"], font=font_serif_huge)
        y_cursor += 125

    # Subtitle
    if subtitle:
        y_cursor += 40
        sub_words = subtitle.split()
        sub_lines = []
        cur_sub = []
        for word in sub_words:
            cur_sub.append(word)
            bbox = draw.textbbox((0, 0), " ".join(cur_sub), font=font_serif_large)
            if (bbox[2] - bbox[0]) > (WIDTH - 260):
                cur_sub.pop()
                sub_lines.append(" ".join(cur_sub))
                cur_sub = [word]
        if cur_sub:
            sub_lines.append(" ".join(cur_sub))

        for line in sub_lines:
            bbox = draw.textbbox((0, 0), line, font=font_serif_large)
            w = bbox[2] - bbox[0]
            draw.text(((WIDTH - w) / 2, y_cursor), line, fill=palette["primary"], font=font_serif_large)
            y_cursor += 90

    # Geometric Divider
    cy = 1350
    draw.line([(280, cy), (WIDTH - 280, cy)], fill=palette["border_inner"], width=2)
    draw.polygon([(WIDTH / 2, cy - 30), (WIDTH / 2 + 30, cy), (WIDTH / 2, cy + 30), (WIDTH / 2 - 30, cy)], outline=palette["primary"], width=3)

    # Author
    if author:
        author_text = f"BY {author.upper()}"
        bbox = draw.textbbox((0, 0), author_text, font=font_sans_bold)
        w = bbox[2] - bbox[0]
        draw.text(((WIDTH - w) / 2, cy + 120), author_text, fill=palette["text"], font=font_sans_bold)

    # Device spec badge
    badge_y = 1850
    draw.rectangle([(WIDTH / 2 - 380, badge_y), (WIDTH / 2 + 380, badge_y + 85)], outline=palette["primary"], width=2, fill=(24, 32, 44))
    b1 = "KINDLE PAPERWHITE 12th GEN READY"
    bbox = draw.textbbox((0, 0), b1, font=font_sans_med)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) / 2, badge_y + 15), b1, fill=palette["text"], font=font_sans_med)
    b2 = "300 PPI • Enhanced Typesetting • MathML Support"
    bbox = draw.textbbox((0, 0), b2, font=font_sans_small)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) / 2, badge_y + 52), b2, fill=palette["primary"], font=font_sans_small)

    # Footer
    if footer:
        bbox = draw.textbbox((0, 0), footer.upper(), font=font_sans_small)
        w = bbox[2] - bbox[0]
        draw.text(((WIDTH - w) / 2, 2220), footer.upper(), fill=palette["muted"], font=font_sans_small)

    img.save(output_path, "JPEG", quality=95)
    print(f"Generated 300 PPI cover at {output_path}")
    return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate 300 PPI Kindle Cover")
    parser.add_argument("--title", required=True, help="Book title")
    parser.add_argument("--subtitle", default=None, help="Book subtitle")
    parser.add_argument("--author", default="Reader", help="Author name")
    parser.add_argument("--tagline", default=None, help="Tagline at top")
    parser.add_argument("--footer", default="KINDLE E-INK REVISION EDITION", help="Footer note")
    parser.add_argument("--theme", default="slate_gold", choices=["slate_gold", "pure_black", "academic_navy"], help="Color theme")
    parser.add_argument("--output", default="cover.jpg", help="Output path")
    args = parser.parse_args()

    generate_cover(
        title=args.title,
        subtitle=args.subtitle,
        author=args.author,
        tagline=args.tagline,
        footer=args.footer,
        output_path=args.output,
        theme=args.theme
    )
