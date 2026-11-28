"""Rasterize public/favicon.svg into PWA PNG icons using local Edge via Playwright.

Usage: python scripts/gen_icons.py   (run from frontend/)
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
SVG = (ROOT / "public" / "favicon.svg").read_text(encoding="utf-8")
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

# (filename, size, maskable): maskable icons keep the mark inside the 80% safe zone on full-bleed bg.
TARGETS = [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("apple-touch-icon.png", 180, True),
    ("maskable-512.png", 512, True),
]


def sized_svg(w: str, h: str) -> str:
    return SVG.replace("<svg ", '<svg width="' + w + '" height="' + h + '" ', 1)


def page_html(size: int, maskable: bool) -> str:
    if maskable:
        inner = int(size * 0.72)
        return (
            f"<html><body style='margin:0;width:{size}px;height:{size}px;background:#1f8a56;"
            f"display:flex;align-items:center;justify-content:center'>"
            f"<div style='width:{inner}px;height:{inner}px'>" + sized_svg("100%", "100%") + "</div></body></html>"
        )
    return (
        f"<html><body style='margin:0;width:{size}px;height:{size}px;background:transparent'>"
        + sized_svg(str(size), str(size))
        + "</body></html>"
    )


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    for name, size, maskable in TARGETS:
        page = browser.new_page(viewport={"width": size, "height": size})
        page.set_content(page_html(size, maskable))
        page.screenshot(path=str(OUT / name), omit_background=not maskable)
        page.close()
    browser.close()

for name, size, _ in TARGETS:
    f = OUT / name
    data = f.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{name} is not PNG"
    w = int.from_bytes(data[16:20], "big")
    h = int.from_bytes(data[20:24], "big")
    assert (w, h) == (size, size), f"{name} size {w}x{h} != {size}"
    print(f"OK {name} {w}x{h} {len(data)} bytes")
