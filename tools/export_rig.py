import runpy, json

# Rig pivots in dog voxel space (x = tail->nose, y = up, z = side)
PIVOTS = {
    "body": (0, 19, 0),
    "head": (10, 22.5, 0),
    "tail": (-12, 21, 0),
    "fl": (7, 13, 3), "fr": (7, 13, -3),
    "bl": (-8, 16, 3), "br": (-8, 16, -3),
    "el": (15, 33, 4), "er": (15, 33, -4),
}

CAT_PIVOTS = dict(PIVOTS, el=(11, 26, 3), er=(11, 26, -3), tail=(-9, 17, 0))

# floppy fold-over ears: a fold across the top of the skull, then a flap hanging down the side of the head
EARS = {
    "brother": {"rows": [(31, 14, 17), (30, 14, 17), (29, 15, 18), (28, 16, 18)], "col": (190, 126, 70), "tip": (160, 100, 54)},
    "sister":  {"rows": [(31, 14, 17), (30, 14, 17), (29, 14, 17), (28, 14, 17), (27, 15, 17), (26, 15, 16)], "col": (158, 110, 72), "tip": (128, 86, 54)},
    "bobby":   {"rows": [(31, 14, 17), (30, 14, 17), (29, 14, 17), (28, 15, 17)], "col": (30, 28, 33), "tip": (22, 20, 25)},
}
def add_ears(vox, name, colour=None):
    if name.startswith("cat"):   # prick ears are built into cat_voxel.py
        return {k: colour(k[0], k[1], k[2], "ear") for k, p in vox.items() if p == "ear"}
    for k in [k for k, p in vox.items() if p == "ear"]:
        del vox[k]
    cfg, ears = EARS[name], {}
    for s in (-1, 1):
        for x in range(14, 17):
            ears[(x, 33, s * 3)] = cfg["col"]; ears[(x, 33, s * 4)] = cfg["col"]
        for x in range(14, 18):
            ears[(x, 32, s * 4)] = cfg["col"]; ears[(x, 32, s * 5)] = cfg["col"]
        rows = cfg["rows"]
        for n, (y, x0, x1) in enumerate(rows):
            for x in range(x0, x1 + 1):
                ears[(x, y, s * 5)] = cfg["tip"] if n >= len(rows) - 2 else cfg["col"]
    for k in ears:
        vox[k] = "ear"
    return ears

def group_of(x, y, z, p):
    if p == "tail":
        return "tail"
    if p == "ear":
        return "el" if z > 0 else "er"
    if p in ("head", "muzzle", "nose", "eye", "neck", "collar", "tag", "tongue"):
        return "head"
    if p == "leg":
        side = "l" if z > 0 else "r"
        return ("f" if x >= 2 else "b") + side
    return "body"

def export(script, name, init=None, pivots=None):
    g = runpy.run_path(script, init_globals=init)
    vox, colour = g["vox"], g["colour"]
    ears = add_ears(vox, name, colour)
    groups, pal = {}, []
    for (x, y, z), p in vox.items():
        groups.setdefault(group_of(x, y, z, p), {})[(x, y, z)] = ears[(x, y, z)] if p == "ear" else colour(x, y, z, p)
    out = {"pal": [], "groups": {}, "pivots": pivots or PIVOTS}
    dirs = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
    for gname, cells in groups.items():
        flat = []
        for (x, y, z), c in cells.items():
            if all((x+d[0], y+d[1], z+d[2]) in cells for d in dirs):
                continue  # interior of its own group
            if c not in pal:
                pal.append(c)
            flat += [x, y, z, pal.index(c)]
        out["groups"][gname] = flat
    out["pal"] = ["#%02x%02x%02x" % c for c in pal]
    print(name, {k: len(v) // 4 for k, v in out["groups"].items()}, "pal", len(pal))
    return out

rig = {"brother": export("dog_voxel.py", "brother"), "sister": export("sister_voxel.py", "sister"), "bobby": export("bobby_voxel.py", "bobby"),
       "cat1": export("cat_voxel.py", "cat1", {"CAT": "white"}, CAT_PIVOTS), "cat2": export("cat_voxel.py", "cat2", {"CAT": "black"}, CAT_PIVOTS)}
json.dump(rig, open('../assets/rig.json','w'), separators=(",", ":"))
