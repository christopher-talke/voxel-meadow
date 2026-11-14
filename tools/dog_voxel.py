import json, math, struct

# Axes: x = tail(-) to nose(+), y = up, z = left/right
W = (237, 231, 220)   # white
T = (196, 132, 74)    # tan
TL = (205, 160, 112)  # tick
IN = (214, 160, 128)  # inner ear
NOSE = (24, 22, 22)
EYE = (36, 24, 16)
COL = (40, 40, 42)
TAG = (52, 96, 170)

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

# Body, chest, neck
ell(-1, 19, 0, 11.5, 6, 5, "body")
ell(6, 18, 0, 5.5, 7, 5.2, "chest")
tube((9, 21, 0), (13, 27, 0), 3.6, "neck")

# Head
ell(15, 29, 0, 4.6, 4.2, 4.2, "head")
for x in range(17, 23):
    taper = (x - 17) * 0.25
    for y in range(int(25 + taper), 29):
        for z in range(-2, 3):
            if abs(z) <= 2 - (1 if x >= 21 and abs(z) == 2 else 0):
                vox.setdefault((x, y, z), "muzzle")
for y in (27, 28):
    for z in (-1, 0, 1):
        vox[(23, y, z)] = "nose"
vox[(22, 28, 0)] = "nose"

# Folded ears
for s in (-1, 1):
    for x in range(15, 18):
        for y in (32, 33):
            vox[(x, y, s * 4)] = "ear"
    for x in range(16, 19):
        for y in range(30, 33):
            vox[(x, y, s * 5)] = "ear"

# Front legs
for s in (-1, 1):
    tube((7, 14, s * 3), (7, 1, s * 3), 1.6, "leg")
    for x in range(6, 10):
        for z in (s * 2, s * 3, s * 4):
            vox[(x, 0, z)] = "leg"

# Back legs with hock
for s in (-1, 1):
    ell(-8, 15, s * 3, 3.5, 5, 2.2, "leg")
    tube((-7, 11, s * 3), (-10, 5, s * 3), 1.5, "leg")
    tube((-10, 5, s * 3), (-9, 1, s * 3), 1.4, "leg")
    for x in range(-10, -6):
        for z in (s * 2, s * 3, s * 4):
            vox[(x, 0, z)] = "leg"

# Tail
pts = [(-12, 21, 0), (-15, 21, 0), (-18, 22, 0), (-20, 24, 0)]
for a, b in zip(pts, pts[1:]):
    tube(a, b, 1.1, "tail", 10)

# Collar ring, perpendicular to the neck axis
ux, uy = 4 / 7.211, 6 / 7.211
for (x, y, z), p in list(vox.items()):
    if p in ("neck", "chest", "head") and abs((x - 10.8) * ux + (y - 23.6) * uy) < 0.75 and y > 19:
        vox[(x, y, z)] = "collar"
for (x, y, z) in [(14, 21, 0), (14, 20, 0), (14, 20, 1), (14, 20, -1), (14, 19, 0)]:
    vox[(x, y, z)] = "tag"

# Eyes
for s in (-1, 1):
    vox[(19, 29, s * 2)] = "eye"
    vox[(19, 30, s * 2)] = "eye"

def colour(x, y, z, p):
    if p in ("nose", "eye", "collar", "tag"):
        return {"nose": NOSE, "eye": EYE, "collar": COL, "tag": TAG}[p]
    if p == "ear":
        return T
    if p == "muzzle":
        return W
    if p == "head":
        if abs(z) <= 1 and y >= 28:
            return W  # blaze
        if y <= 26:
            return W  # jaw/throat
        return T
    if p == "neck" and y >= 26 and abs(z) >= 2 and x >= 12:
        return T
    if p in ("body", "chest", "leg", "tail", "neck"):
        if p == "body" and -11 <= x <= -2 and y >= 23:
            return T  # saddle over hips
        if p == "tail" and x <= -18:
            return W
        if p == "body" and h(x // 3, y // 3, z // 3, 1) < 0.10:
            return TL  # flank blotches
        if y > 1 and h(x, y, z, 2) < 0.16:
            return TL  # ticking
        return W
    return W

dirs = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
surface = [(k, colour(*k, p)) for k, p in vox.items()
           if any((k[0]+d[0], k[1]+d[1], k[2]+d[2]) not in vox for d in dirs)]

# JSON for preview: [x,y,z,hex]
data = [[x, y, z, "%02x%02x%02x" % c] for (x, y, z), c in surface]
json.dump(data, open("dog_voxels.json", "w"), separators=(",", ":"))

# MagicaVoxel .vox export (z-up), full solid model
xs = [k[0] for k in vox]; ys = [k[1] for k in vox]; zs = [k[2] for k in vox]
mx, my, mz = min(xs), min(ys), min(zs)
pal = []
voxels = []
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
rgba = b"".join(struct.pack("<BBBB", *c, 255) for c in pal) + b"\x00\x00\x00\xff" * (256 - len(pal))
rgba = chunk(b"RGBA", rgba)
children = size + xyzi + rgba
main = b"MAIN" + struct.pack("<ii", 0, len(children)) + children
open("doggo.vox", "wb").write(b"VOX " + struct.pack("<i", 150) + main)

print("solid", len(vox), "surface", len(surface), "size", sx, sy, sz, "pal", len(pal))
