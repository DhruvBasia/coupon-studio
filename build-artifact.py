"""Bundle Coupon Studio into a single self-contained page for hosting as a claude.ai Artifact.

Usage:  python build-artifact.py      ->  writes dist/coupon-studio.html

The hosted page gets its <head>/<body> skeleton from the host, so this strips those tags, inlines the stylesheet
and the app's own scripts (fonts and default logo included), and loads jsPDF from the jsDelivr CDN.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
JSPDF_CDN = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"


def read(rel):
    with open(os.path.join(HERE, rel), encoding="utf-8") as f:
        return f.read()


def inline_script(code):
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


html = read("index.html")

title = re.search(r"<title>.*?</title>", html, re.S).group(0)
meta_sides = re.search(r'<meta name="claude:viewport-fit-sides"[^>]*>', html).group(0)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)


def replace_script(match):
    src = match.group(1)
    if src.startswith("lib/jspdf"):
        return f'<script src="{JSPDF_CDN}"></script>'
    return inline_script(read(src))


body = re.sub(r'<script src="([^"]+)"></script>', replace_script, body)

page = "\n".join([title, meta_sides, "<style>\n" + read("styles.css") + "</style>", body.strip(), ""])

os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
out = os.path.join(HERE, "dist", "coupon-studio.html")
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(page)
print(f"wrote {out} ({len(page.encode('utf-8')) / 1048576:.2f} MB)")
