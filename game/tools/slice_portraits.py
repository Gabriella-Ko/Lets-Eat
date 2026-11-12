"""Preview-only portrait cutter for the game prototype.

Cuts each art/source/<character>_sheet.jpg (3x2 grid: HAPPY ANNOYED SURPRISED / ANGRY CONTENT NEUTRAL)
into 128x128 PNGs in game/public/art-preview/gfx/ and writes a manifest in the Art Asset agent's format.
The official assets are the Art Asset agent's job (public/assets/); this only lets the game show real art now.
Usage (from the repo root): python game/tools/slice_portraits.py [--contact out.png]
"""
import json, os, re, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'art', 'source')
OUT = os.path.join(ROOT, 'game', 'public', 'art-preview')
GRID = ['happy', 'annoyed', 'surprised', 'angry', 'content', 'neutral']
BIBLE_TAGS = ['happy', 'annoyed', 'surprised', 'hungry', 'angry', 'neutral']
CHARACTERS = ['maya', 'liam', 'mina', 'roxy', 'cyrus', 'brooke']

# Picture area of each cell (label bars excluded), keyed by sheet size.
LAYOUTS = {
    (1264, 848): {'cols': [(0, 413), (422, 841), (850, 1264)], 'rows': [(0, 364), (424, 794)]},
    (1407, 768): {'cols': [(0, 463), (474, 933), (944, 1407)], 'rows': [(0, 338), (398, 711)]},
    (1408, 768): {'cols': [(0, 463), (474, 933), (944, 1408)], 'rows': [(0, 338), (398, 711)]},
    (1024, 559): {'cols': [(14, 337), (345, 679), (686, 1010)], 'rows': [(14, 248), (286, 515)]},
}

def square(box):
    x0, y0, x1, y1 = box
    side = min(x1 - x0, y1 - y0)
    cx = (x0 + x1) // 2
    return (cx - side // 2, y0, cx - side // 2 + side, y0 + side)

def main():
    os.makedirs(os.path.join(OUT, 'gfx'), exist_ok=True)
    manifest = {'portraits': {}, 'generated_by': 'human:gabby', 'note': 'PREVIEW, cut by game/tools/slice_portraits.py; not the Art Asset agent output'}
    cells = []
    for ch in CHARACTERS:
        path = os.path.join(SRC, f'{ch}_sheet.jpg')
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGB')
        lay = LAYOUTS[im.size]
        cut = {}
        for i, tag in enumerate(GRID):
            (x0, x1), (y0, y1) = lay['cols'][i % 3], lay['rows'][i // 3]
            cut[tag] = im.crop(square((x0, y0, x1, y1))).resize((128, 128), Image.LANCZOS)
            cells.append(cut[tag])
        for tag in BIBLE_TAGS:
            # The sheets have CONTENT instead of HUNGRY; HUNGRY shows NEUTRAL until real art exists.
            src_tag = tag if tag in cut else 'neutral'
            name = f'portrait_{ch}_{src_tag}.png'
            cut[src_tag].save(os.path.join(OUT, 'gfx', name))
            manifest['portraits'][f'portrait_{ch}_{tag}'] = {'file': f'gfx/{name}', 'placeholder': src_tag != tag}
    manifest['outcomes'] = cut_outcomes()
    manifest['backgrounds'] = cut_chat_backgrounds()
    with open(os.path.join(OUT, 'asset_manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    if '--contact' in sys.argv and cells:
        sheet = Image.new('RGB', (128 * 6, 128 * (len(cells) // 6)), 'black')
        for i, c in enumerate(cells):
            sheet.paste(c, ((i % 6) * 128, (i // 6) * 128))
        sheet.save(sys.argv[sys.argv.index('--contact') + 1])
    print(f'wrote {len(manifest["portraits"])} portrait entries, {len(manifest["outcomes"])} outcome images, {len(manifest["backgrounds"])} chat backgrounds')

def cut_outcomes():
    """art/source/level_XX_result_<venue name>.jpg -> outcomes/outcome_level_XX_<venue id>.jpg (680x456).
    The file name leaves out the district, so the venue id is looked up in that level's venues file."""
    out = {}
    os.makedirs(os.path.join(OUT, 'outcomes'), exist_ok=True)
    for f in sorted(os.listdir(SRC)):
        m = re.match(r'(level_\d\d)_result_(\w+)\.(jpe?g|png)$', f)
        if not m:
            continue
        level, name = m.group(1), m.group(2)
        venues_file = os.path.join(ROOT, 'content', 'levels', level, f'venues_{level}.json')
        ids = []
        if os.path.exists(venues_file):
            with open(venues_file, encoding='utf-8') as vf:
                ids = [v['id'] for v in json.load(vf)['venues']]
        match = [i for i in ids if i.endswith('_' + name)]
        if len(match) != 1:
            print(f'skipped {f}: no single venue in {level} ends with "_{name}"')
            continue
        key = f'outcome_{level}_{match[0]}'
        im = Image.open(os.path.join(SRC, f)).convert('RGB')
        im = im.crop(cover_box(im.size, 680 / 456)).resize((680, 456), Image.LANCZOS)
        im.save(os.path.join(OUT, 'outcomes', key + '.jpg'), quality=90)
        out[key] = {'file': f'outcomes/{key}.jpg'}
    return out

# Chat backgrounds keep the whole picture (no crop): the game shows them at the chat panel's width
# and pans down the tall picture as the chat goes on. Here they are only muted and washed toward the UI cream.
CHAT_W = 644            # chat panel width in the game
MUTE_SATURATION = 0.45  # 1 = original colour, 0 = grey
CREAM_WASH = 0.35      # 0 = none, 1 = flat cream
CREAM = (243, 228, 208) # theme.js C.panel

def cut_chat_backgrounds():
    """art/source/chat_background_chapter_XX_<district>.jpg -> backgrounds/chat_bg_chapter_XX.jpg (whole picture)"""
    from PIL import ImageEnhance
    out = {}
    os.makedirs(os.path.join(OUT, 'backgrounds'), exist_ok=True)
    for f in sorted(os.listdir(SRC)):
        m = re.match(r'chat_background_chapter_(\d\d)_\w+\.(jpe?g|png)$', f)
        if not m:
            continue
        key = f'chat_bg_chapter_{m.group(1)}'
        im = Image.open(os.path.join(SRC, f)).convert('RGB')
        w, h = im.size
        im = ImageEnhance.Color(im).enhance(MUTE_SATURATION)
        im = Image.blend(im, Image.new('RGB', im.size, CREAM), CREAM_WASH)
        if w > CHAT_W * 2:  # no point keeping more than 2x the panel width
            im = im.resize((CHAT_W * 2, round(h * CHAT_W * 2 / w)), Image.LANCZOS)
        im.save(os.path.join(OUT, 'backgrounds', key + '.jpg'), quality=90)
        out[key] = {'file': f'backgrounds/{key}.jpg'}
    return out

def cover_box(size, ratio):
    w, h = size
    if w / h > ratio:
        nw = round(h * ratio)
        return ((w - nw) // 2, 0, (w - nw) // 2 + nw, h)
    nh = round(w / ratio)
    return (0, (h - nh) // 2, w, (h - nh) // 2 + nh)

main()
