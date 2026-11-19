"""Generate draft art with the PixelLab API (art_generator agent's script).

Reads a jobs file (written by the art_generator agent), calls PixelLab's pixflux endpoint once per
job x variant, and saves PNGs to assets/drafts/pixellab/<group>/<key>_v<n>.png plus a contact sheet.

Usage (from the repo root):
  python scripts/pixellab_draft.py                      # run every job not yet generated
  python scripts/pixellab_draft.py --dry-run            # list what would be generated, no API calls
  python scripts/pixellab_draft.py --only badges        # one group (or a key: --only icon_sushi)
  python scripts/pixellab_draft.py --wait               # out of credits: wait and retry until they come back
  python scripts/pixellab_draft.py --sheet              # rebuild the contact sheets and the dashboard only

Every run also rebuilds the draft-art dashboard, assets/drafts/index.html (scripts/art_dashboard.py):
click a variant to pick it, then "Copy my picks".
Free tier: PixelLab draws at most 200x200, so keep `gen` at or under that and let `out` enlarge it.

Needs: PIXELLAB_API_KEY in the environment, Python 3 with Pillow.

Credits and rate limits:
  - Resumable: an image that already exists on disk is never generated again, so re-running the same
    command after any stop (credits, rate limit, a closed terminal, Claude's own usage limit) picks up
    where it left off.
  - 429/529 (rate limited): back off 30 s, doubling to 15 min, then continue. Never gives up on its own.
  - 402 (out of credits): stop and exit with code 3, state "paused_out_of_credits" in the log.
    With --wait it does not exit: it retries one image every --wait-minutes (a 402 costs nothing)
    and carries on when credits are back. Run it in the background so nothing burns while it waits.

Generation: each group has a `gen` size (what PixelLab draws) and an `out` size (saved file).
`out` must be a whole-number multiple of `gen`; upscaling is nearest-neighbour so pixels stay crisp.
PixelLab only returns a transparent background up to 40,000 px of area; above that it returns a flat
colour, which this script keys out by flood-filling from the corners.

Exit codes: 0 done, 1 error (bad jobs file, bad key, API error), 3 paused out of credits.
"""

import argparse
import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
JOBS = ROOT / "assets" / "drafts" / "pixellab_jobs.json"
OUT = ROOT / "assets" / "drafts" / "pixellab"
LOG = ROOT / "logs" / "pixellab_drafts.json"
API = "https://api.pixellab.ai/v1"
TRANSPARENT_MAX_AREA = 40_000
MAX_GEN = 200  # free tier: images up to 200x200 (the paid API allows 400)
PAUSED = 3


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class OutOfCredits(Exception):
    pass


class Log:
    """logs/pixellab_drafts.json: run state, and one row per generated image (cost included)."""

    def __init__(self):
        self.data = json.loads(LOG.read_text("utf-8")) if LOG.exists() else {"state": "new", "spent_usd": 0, "images": []}

    def set_state(self, state, note=None):
        self.data["state"] = state
        self.data["state_at"] = now()
        self.data["note"] = note
        self.save()

    def image(self, row):
        self.data["images"].append(row)
        self.data["spent_usd"] = round(self.data.get("spent_usd", 0) + (row.get("usd") or 0), 4)
        self.save()

    def save(self):
        LOG.parent.mkdir(parents=True, exist_ok=True)
        LOG.write_text(json.dumps(self.data, indent=2) + "\n", "utf-8")


def call(path, key, body=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def generate(key, body):
    """One pixflux call with rate-limit backoff. Raises OutOfCredits on 402."""
    delay = 30
    while True:
        try:
            return call("/generate-image-pixflux", key, body)
        except urllib.error.HTTPError as e:
            if e.code == 402:
                raise OutOfCredits()
            if e.code in (429, 529, 503):
                print(f"  rate limited ({e.code}), waiting {delay} s", flush=True)
                time.sleep(delay)
                delay = min(delay * 2, 900)
                continue
            detail = e.read().decode(errors="replace")[:300]
            raise RuntimeError(f"PixelLab {e.code}: {detail}") from None
        except urllib.error.URLError as e:
            print(f"  network error ({e.reason}), waiting {delay} s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 900)


def key_out_background(img):
    """Flat-colour background -> transparent, flood-filling from the four corners."""
    img = img.convert("RGBA")
    w, h = img.size
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if img.getpixel(corner)[3] != 0:
            ImageDraw.floodfill(img, corner, (0, 0, 0, 0), thresh=24)
    return img


def seed_for(key, variant):
    return int(hashlib.sha256(f"{key}:{variant}".encode()).hexdigest()[:8], 16) % 2_000_000_000


def load_jobs():
    spec = json.loads(JOBS.read_text("utf-8"))
    groups, defaults, style = spec["groups"], spec.get("defaults", {}), spec["style"]
    for name, g in groups.items():
        (gw, gh), (ow, oh) = g["gen"], g["out"]
        if ow % gw or oh % gh or ow // gw != oh // gh:
            sys.exit(f"group {name}: out {ow}x{oh} is not a whole multiple of gen {gw}x{gh}")
        if max(gw, gh) > MAX_GEN or min(gw, gh) < 16:
            sys.exit(f"group {name}: gen size must be 16-{MAX_GEN} px per side (PixelLab free tier); enlarge with `out` instead")
    jobs = []
    for j in spec["jobs"]:
        g = groups[j["group"]]
        for v in range(1, j.get("variants", g.get("variants", defaults.get("variants", 1))) + 1):
            jobs.append({**j, "variant": v, "gen": g["gen"], "out": g["out"],
                         "file": OUT / j["group"] / f"{j['key']}_v{v}.png",
                         "style": {**defaults, **g.get("style", {}), **j.get("style", {})},
                         "description": f"{j['subject']}. {g.get('framing', '')} {style}".strip()})
    return jobs


def body_for(job):
    (gw, gh) = job["gen"]
    s = job["style"]
    body = {
        "description": job["description"],
        "image_size": {"width": gw, "height": gh},
        "no_background": True,
        "seed": seed_for(job["key"], job["variant"]),
    }
    for field in ("outline", "shading", "detail", "view", "text_guidance_scale"):
        if s.get(field) is not None:
            body[field] = s[field]
    return body


def save(job, resp):
    b64 = resp["image"]["base64"].split(",", 1)[-1]
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    gw, gh = job["gen"]
    if gw * gh > TRANSPARENT_MAX_AREA:
        img = key_out_background(img)
    img = img.resize(tuple(job["out"]), Image.NEAREST)
    job["file"].parent.mkdir(parents=True, exist_ok=True)
    img.save(job["file"])


def contact_sheets():
    """One review sheet per group: every variant on a checkerboard (shows transparency), labelled."""
    for group_dir in sorted(p for p in OUT.iterdir() if p.is_dir()) if OUT.exists() else []:
        files = sorted(group_dir.glob("*.png"))
        if not files:
            continue
        w, h = Image.open(files[0]).size
        cols = 4 if w > 200 else 6
        cell_w, cell_h = w + 16, h + 34
        rows = (len(files) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (46, 38, 36))
        draw = ImageDraw.Draw(sheet)
        for i, f in enumerate(files):
            x, y = (i % cols) * cell_w + 8, (i // cols) * cell_h + 8
            checker = Image.new("RGB", (w, h), (243, 228, 208))
            cd = ImageDraw.Draw(checker)
            for cy in range(0, h, 16):
                for cx in range((cy // 16 % 2) * 16, w, 32):
                    cd.rectangle([cx, cy, cx + 15, cy + 15], fill=(230, 208, 184))
            img = Image.open(f).convert("RGBA")
            checker.paste(img, (0, 0), img)
            sheet.paste(checker, (x, y))
            draw.text((x, y + h + 6), f.stem, fill=(217, 184, 168))
        out = OUT / f"contact_sheet_{group_dir.name}.png"
        sheet.save(out)
        print(f"sheet {out.relative_to(ROOT)}")


def build_gallery():
    """Rebuild the shared draft-art dashboard, assets/drafts/index.html (scripts/art_dashboard.py)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import art_dashboard
    art_dashboard.build()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="a group name or a key")
    ap.add_argument("--wait", action="store_true", help="when out of credits, wait and retry instead of exiting")
    ap.add_argument("--wait-minutes", type=float, default=30)
    ap.add_argument("--sheet", action="store_true", help="only rebuild the contact sheets")
    args = ap.parse_args()

    build_gallery()
    if args.sheet:
        contact_sheets()
        return 0

    jobs = [j for j in load_jobs() if not args.only or args.only in (j["group"], j["key"])]
    todo = [j for j in jobs if not j["file"].exists()]
    print(f"{len(jobs)} images in scope, {len(jobs) - len(todo)} already on disk, {len(todo)} to generate")
    if args.dry_run:
        for j in todo:
            print(f"  {j['file'].relative_to(ROOT)}  gen {j['gen'][0]}x{j['gen'][1]} -> {j['out'][0]}x{j['out'][1]}")
            print(f"    {j['description']}")
        return 0
    if not todo:
        contact_sheets()
        return 0

    key = os.environ.get("PIXELLAB_API_KEY")
    if not key:
        sys.exit("PIXELLAB_API_KEY is not set. Get a key at https://www.pixellab.ai/account and set it as an environment variable.")

    log = Log()
    log.set_state("running")
    i = 0
    while i < len(todo):
        job = todo[i]
        print(f"[{i + 1}/{len(todo)}] {job['file'].relative_to(ROOT)}", flush=True)
        try:
            resp = generate(key, body_for(job))
        except OutOfCredits:
            done = i
            note = f"PixelLab credits ran out after {done} of {len(todo)} images. Re-run the same command to resume."
            if not args.wait:
                log.set_state("paused_out_of_credits", note)
                print(f"PAUSED: {note}")
                contact_sheets()
                return PAUSED
            log.set_state("waiting_for_credits", f"{note} Waiting, retrying every {args.wait_minutes:g} min.")
            print(f"  out of credits, retrying in {args.wait_minutes:g} min", flush=True)
            time.sleep(args.wait_minutes * 60)
            continue
        except RuntimeError as e:
            log.set_state("error", str(e))
            print(f"ERROR: {e}")
            return 1
        save(job, resp)
        log.image({"at": now(), "file": str(job["file"].relative_to(ROOT)).replace("\\", "/"), "key": job["key"],
                   "variant": job["variant"], "seed": body_for(job)["seed"], "usd": resp.get("usage", {}).get("usd"),
                   "description": job["description"]})
        if log.data["state"] != "running":
            log.set_state("running")
        i += 1

    log.set_state("done", f"{len(todo)} images generated")
    contact_sheets()
    print(f"done. spent so far: ${log.data['spent_usd']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
