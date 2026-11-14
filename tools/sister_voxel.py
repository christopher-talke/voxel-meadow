import json, struct

# Axes: x = tail(-) to nose(+), y = up, z = left/right
W = (238, 234, 228)    # white
FAWN = (206, 168, 124) # face
EAR = (158, 110, 72)   # darker ears
SAD = (150, 96, 52)    # saddle patch
TK = (202, 168, 128)   # ticking
NOSE = (42, 34, 38)
EYE = (36, 26, 22)
COL = (220, 134, 184)  # pink collar

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

# Slightly leaner than her brother
ell(-1, 19, 0, 11.5, 5.8, 4.7, "body")
ell(6, 18, 0, 5.3, 6.8, 4.9, "chest")
tube((9, 21, 0), (13, 27, 0), 3.4, "neck")

# Head
ell(15, 29, 0, 4.4, 4.1, 4.0, "head")
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

# Folded ears, a touch perkier at the base
for s in (-1, 1):
    for x in range(14, 17):
        for y in (32, 33, 34):
            vox[(x, y, s * 4)] = "ear"
    for x in range(15, 18):
        for y in range(30, 33):
            vox[(x, y, s * 5)] = "ear"

# Legs
for s in (-1, 1):
    tube((7, 14, s * 3), (7, 1, s * 3), 1.5, "leg")
    for x in range(6, 10):
        for z in (s * 2, s * 3, s * 4):
            vox[(x, 0, z)] = "leg"
    ell(-8, 15, s * 3, 3.4, 5, 2.1, "leg")
    tube((-7, 11, s * 3), (-10, 5, s * 3), 1.4, "leg")
    tube((-10, 5, s * 3), (-9, 1, s * 3), 1.3, "leg")
    for x in range(-10, -6):
        for z in (s * 2, s * 3, s * 4):
            vox[(x, 0, z)] = "leg"

# Tail, carried out and slightly up
pts = [(-12, 21, 0), (-15, 22, 0), (-18, 23, 0), (-21, 25, 0)]
for a, b in zip(pts, pts[1:]):
    tube(a, b, 1.1, "tail", 10)

# Collar ring, perpendicular to the neck axis (no tag)
ux, uy = 4 / 7.211, 6 / 7.211
for (x, y, z), p in list(vox.items()):
    if p in ("neck", "chest", "head") and abs((x - 11.0) * ux + (y - 23.9) * uy) < 0.85 and y > 19:
        vox[(x, y, z)] = "collar"

# Eyes
for s in (-1, 1):
    vox[(19, 29, s * 2)] = "eye"
    vox[(19, 30, s * 2)] = "eye"

def colour(x, y, z, p):
    if p in ("nose", "eye", "collar"):
        return {"nose": NOSE, "eye": EYE, "collar": COL}[p]
    if p == "ear":
        return EAR
    if p == "muzzle":
        if x <= 19 and abs(z) == 2 and y >= 27:
            return FAWN   # fawn creeping down the muzzle sides
        return W
    if p == "head":
        if z == 0 and y >= 28:
            return W      # narrow blaze
        if y <= 26 and x >= 15:
            return W      # jaw and throat
        return FAWN
    if p == "neck":
        return FAWN if (y >= 27 and x <= 14) or (y >= 28) else W
    if p == "body":
        # brown saddle over the mid back, ragged edge
        d = ((x + 1.5) / 5.2) ** 2 + ((y - 25.0) / 4.8) ** 2
        if d <= 1.0 + 0.35 * (h(x, y, z, 5) - 0.5):
            return SAD
        # small patch at the top of the rump
        if x <= -9 and y >= 22 and abs(z) <= 3 and ((x + 11) ** 2 + (y - 23) ** 2) <= 8 + 3 * h(x, y, z, 6):
            return SAD
    if p == "tail":
        return W
    if p in ("body", "chest", "leg"):
        prob = 0.12 if x < 0 else 0.05
        if p == "leg":
            prob = 0.09
        if y > 1 and h(x, y, z, 9) < prob:
            return TK
    return W

dirs = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
surface = [(k, colour(*k, p)) for k, p in vox.items()
           if any((k[0]+d[0], k[1]+d[1], k[2]+d[2]) not in vox for d in dirs)]
data = [[x, y, z, "%02x%02x%02x" % c] for (x, y, z), c in surface]
json.dump(data, open("sister_voxels.json", "w"), separators=(",", ":"))

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
open("sister.vox", "wb").write(b"VOX " + struct.pack("<i", 150) + main)
print("solid", len(vox), "surface", len(surface), "size", sx, sy, sz, "pal", len(pal))
