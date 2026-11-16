import json, struct

# Bobby: slender tricolour Border Collie mix, about 15 kg.
# Axes: x = tail(-) to nose(+), y = up, z = left/right
BLK = (30, 28, 33)       # black mantle, cap and ears
TAN = (178, 120, 66)     # eyebrows, cheeks, lower hind legs
W = (241, 237, 231)      # white
NOSE = (20, 18, 22)
EYE = (112, 66, 34)      # warm brown
COL = (150, 30, 40)      # dark red collar
RING = (198, 202, 208)   # silver D-ring
TONGUE = (238, 122, 150)

vox = {}

def h(x, y, z, s=0):
    n = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (s * 2654435761)
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF

def ell(cx, cy, cz, rx, ry, rz, part):
    for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for z in range(int(cz - rz) - 1, int(cz + rz) + 2):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1:
                    vox.setdefault((x, y, z), part)

def tube(p0, p1, r, part, steps=24):
    for i in range(steps + 1):
        t = i / steps
        c = [p0[k] + (p1[k] - p0[k]) * t for k in range(3)]
        ell(c[0], c[1], c[2], r, r, r, part)

# Slender, slightly long in the body; deep chest with a fluffy white ruff
ell(-1, 19, 0, 11.8, 5.4, 4.3, "body")
ell(6, 18, 0, 5.0, 6.6, 4.5, "chest")
ell(9.5, 19.5, 0, 2.8, 4.6, 3.8, "chest")          # chest ruff
tube((9, 21, 0), (13, 27, 0), 3.3, "neck")
ell(11, 24, 0, 3.4, 3.6, 3.6, "neck")             # moderately thick, fluffy neck

# Head with a medium-length snout
ell(15, 29, 0, 4.3, 4.0, 3.8, "head")
for x in range(17, 23):
    taper = (x - 17) * 0.3
    for y in range(int(25 + taper), 29):
        for z in range(-2, 3):
            if abs(z) <= 2 - (1 if x >= 20 and abs(z) == 2 else 0):
                vox.setdefault((x, y, z), "muzzle")
for y in (27, 28):
    for z in (-1, 0, 1):
        vox[(23, y, z)] = "nose"
vox[(22, 28, 0)] = "nose"

# Relaxed pant: tongue hanging down from the open mouth
for (x, y, z) in [(19, 24, 0), (20, 24, 0), (20, 24, 1), (20, 24, -1), (21, 24, 0), (21, 23, 0), (21, 23, 1), (21, 23, -1), (21, 22, 0)]:
    vox[(x, y, z)] = "tongue"

# Semi-prick ears: stand at the base, tips fold down and out
for s in (-1, 1):
    for x in range(14, 17):
        for y in range(32, 36):
            for z in (3, 4):
                vox[(x, y, s * z)] = "ear"
        for (y, z) in [(36, 4), (36, 5), (35, 5), (35, 6), (34, 6), (33, 6)]:
            vox[(x, y, s * z)] = "ear"

# Legs: slim; hind legs with a hock
for s in (-1, 1):
    tube((7, 14, s * 3), (7, 1, s * 3), 1.45, "leg")
    for x in range(6, 10):
        for z in (s * 2, s * 3, s * 4):
            vox[(x, 0, z)] = "leg"
    ell(-8, 15, s * 3, 3.3, 5, 2.0, "leg")
    tube((-7, 11, s * 3), (-10, 5, s * 3), 1.35, "leg")
    tube((-10, 5, s * 3), (-9, 1, s * 3), 1.25, "leg")
    for x in range(-10, -6):
        for z in (s * 2, s * 3, s * 4):
            vox[(x, 0, z)] = "leg"

# Tail, low with an upward curl at the end
pts = [(-12, 21, 0), (-15, 20, 0), (-18, 20, 0), (-21, 22, 0)]
for a, b in zip(pts, pts[1:]):
    tube(a, b, 1.1, "tail", 10)

# Collar mid neck, plus a silver D-ring at the throat
ux, uy = 4 / 7.211, 6 / 7.211
for (x, y, z), p in list(vox.items()):
    if p in ("neck", "chest", "head") and abs((x - 11.0) * ux + (y - 23.9) * uy) < 0.9 and y > 19:
        vox[(x, y, z)] = "collar"
cands = [k for k, p in vox.items() if p == "collar" and k[2] == 0]
tx, ty, _ = max(cands, key=lambda k: k[0] * 0.832 - k[1] * 0.555)
for (x, y) in [(tx + 1, ty), (tx + 1, ty - 1)]:
    vox[(x, y, 0)] = "tag"

# Eyes
for s in (-1, 1):
    vox[(19, 29, s * 2)] = "eye"
    vox[(19, 30, s * 2)] = "eye"

def colour(x, y, z, p):
    n = h(x, y, z, 3) - 0.5
    if p in ("nose", "eye", "collar", "tag", "tongue"):
        return {"nose": NOSE, "eye": EYE, "collar": COL, "tag": RING, "tongue": TONGUE}[p]
    if p == "ear":
        return BLK
    if p == "muzzle":
        return W
    if p == "head":
        if 17 <= x <= 18 and 30 <= y <= 31 and 1 <= abs(z) <= 2:
            return TAN                      # round eyebrow spots
        if abs(z) >= 3 and 26 <= y <= 28 and x >= 15:
            return TAN                      # small cheek patches beside the muzzle
        if y <= 26 and x >= 15:
            return W                        # jaw and throat
        return BLK                          # cap over the forehead and around the eyes
    if p == "neck":
        rel = (x - 11) * -0.832 + (y - 24) * 0.555
        return BLK if rel > 1.4 + 0.8 * n else W
    if p == "chest":
        return BLK if (y >= 21 + n and x <= 9) else W
    if p == "body":
        return BLK if y >= 17.2 + 1.3 * n else W
    if p == "tail":
        return W if x <= -20 else BLK
    if p == "leg":
        if x > 0:
            return W                        # white front legs
        if y >= 9 + 1.0 * n:
            return BLK                      # black thighs, down to the hock
        if y >= 4.2 + 0.6 * n:
            return TAN                      # a little tan at the hocks
        return W                            # white paws
    return W

dirs = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
surface = [(k, colour(*k, p)) for k, p in vox.items()
           if any((k[0]+d[0], k[1]+d[1], k[2]+d[2]) not in vox for d in dirs)]
data = [[x, y, z, "%02x%02x%02x" % c] for (x, y, z), c in surface]
json.dump(data, open("bobby_voxels.json", "w"), separators=(",", ":"))

xs = [k[0] for k in vox]; ys = [k[1] for k in vox]; zs = [k[2] for k in vox]
mx, my, mz = min(xs), min(ys), min(zs)
pal, voxels = [], []
for (x, y, z), p in vox.items():
    c = colour(x, y, z, p)
    if c not in pal:
        pal.append(c)
    voxels.append((x - mx, z - mz, y - my, pal.index(c) + 1))
sx, sy, sz = max(xs) - mx + 1, max(zs) - mz + 1, max(ys) - my + 1

def chunk(cid, content):
    return cid + struct.pack("<ii", len(content), 0) + content

size = chunk(b"SIZE", struct.pack("<iii", sx, sy, sz))
xyzi = chunk(b"XYZI", struct.pack("<i", len(voxels)) + b"".join(struct.pack("<BBBB", *v) for v in voxels))
rgba = chunk(b"RGBA", b"".join(struct.pack("<BBBB", *c, 255) for c in pal) + b"\x00\x00\x00\xff" * (256 - len(pal)))
children = size + xyzi + rgba
main = b"MAIN" + struct.pack("<ii", 0, len(children)) + children
open("bobby.vox", "wb").write(b"VOX " + struct.pack("<i", 150) + main)
print("solid", len(vox), "surface", len(surface), "size", sx, sy, sz, "pal", len(pal))
