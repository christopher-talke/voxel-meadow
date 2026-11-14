# Cats on the dog rig (same x = tail->nose, y = up, z = side). Built at dog scale and shrunk in app.js.
# CAT = 'white' (white with black patches) or 'black' (black, long fluffy tail, white chest "suit")
CAT = globals().get('CAT', 'white')
BLK = (28, 26, 31); BLK2 = (40, 37, 44)
W = (243, 240, 234); PINK = (232, 168, 170); NOSEC = (214, 128, 140)
EYEC = (170, 168, 64) if CAT == 'white' else (206, 164, 40)

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

def tube(p0, p1, r, part, steps=24, r1=None):
    r1 = r if r1 is None else r1
    for i in range(steps + 1):
        t = i / steps
        c = [p0[k] + (p1[k] - p0[k]) * t for k in range(3)]
        rr = r + (r1 - r) * t
        ell(c[0], c[1], c[2], rr, rr, rr, part)

fluffy = CAT == 'black'
# Body: long, low and soft
ell(0, 16, 0, 8.6, 3.9 + (0.3 if fluffy else 0), 3.5 + (0.4 if fluffy else 0), "body")
ell(-5, 15.5, 0, 4.2, 4.2, 3.8, "body")
ell(6, 16, 0, 3.6, 4.2, 3.4, "chest")
ell(9, 19, 0, 2.8, 3.3, 2.9, "neck")
# Head: round, small muzzle
ell(12, 22.5, 0, 3.2, 3.0, 3.3 + (0.3 if fluffy else 0), "head")
for y in (20, 21):
    for z in (-1, 0, 1):
        vox.setdefault((15, y, z), "muzzle")
vox[(16, 21, 0)] = "nose"
for s in (-1, 1):
    vox[(14, 23, s * 2)] = "eye"
    vox[(15, 23, s * 2)] = "eye"
# Ears: upright triangles
for s in (-1, 1):
    for (y, z0, z1) in [(25, 1, 3), (26, 1, 3), (27, 2, 3), (28, 2, 3)]:
        for z in range(z0, z1 + 1):
            for x in (10, 11):
                vox[(x, y, s * z)] = "ear"
    vox[(10, 29, s * 3)] = "ear"; vox[(11, 29, s * 3)] = "ear"
# Legs: slim
for s in (-1, 1):
    tube((6, 13, s * 2.4), (6.5, 1, s * 2.4), 1.3, "leg", 18)
    for x in range(5, 9):
        for z in (s * 1, s * 2, s * 3):
            vox[(x, 0, z)] = "leg"
    tube((-7, 12, s * 2.8), (-8, 6, s * 2.8), 1.5, "leg", 12)
    tube((-8, 6, s * 2.8), (-7.5, 1, s * 2.8), 1.25, "leg", 10)
    for x in range(-10, -6):
        for z in (s * 1, s * 2, s * 3):
            vox[(x, 0, z)] = "leg"
# Tail
if not fluffy:
    pts = [(-9, 17, 0), (-11, 19, 0), (-12, 22, 0), (-12, 26, 0), (-11.5, 30, 0)]
    for a, b in zip(pts, pts[1:]):
        tube(a, b, 1.0, "tail", 10)
else:   # long plume sweeping up and back
    pts = [(-9, 17, 0), (-13, 18.5, 0), (-17, 21, 0), (-19, 25, 0), (-18.5, 29, 0), (-16.5, 32, 0)]
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        tube(a, b, 1.9 + i * 0.25, "tail", 10, 2.1 + i * 0.25)

def colour(x, y, z, p):
    n = h(x, y, z, 3) - 0.5
    if p == "eye":
        return EYEC
    if p == "nose":
        return NOSEC
    if p == "ear":
        return PINK if CAT == 'white' and abs(z) <= 2 else BLK if CAT == 'black' else BLK
    if CAT == 'black':
        base = BLK if n < 0.15 else BLK2
        if p == "chest" and x >= 7 and y <= 18.5 and abs(z) <= 2.2:
            return W                        # the "suit"
        if p == "muzzle":
            return BLK2
        return base
    # white cat with black patches
    if p == "muzzle":
        return W
    if p == "head":
        return BLK if y >= 23.6 + 0.8 * n and x <= 14 else W
    if p in ("chest", "neck", "leg"):
        return W
    if p == "tail":
        return BLK
    if p == "body":
        return BLK if (y >= 15.8 + 1.4 * n and x <= 4) else W
    return W
