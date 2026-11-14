import runpy, struct, importlib.util
spec = importlib.util.spec_from_file_location("er", "/home/claude/export_rig.py")
src = open("/home/claude/export_rig.py").read().split("rig = {")[0]
ns = {}; exec(src, ns)
for script, name, out in [("dog_voxel.py", "brother", "murphy.vox"), ("sister_voxel.py", "sister", "mali.vox")]:
    g = runpy.run_path(script); vox, colour = g["vox"], g["colour"]
    ears = ns["add_ears"](vox, name)
    xs = [k[0] for k in vox]; ys = [k[1] for k in vox]; zs = [k[2] for k in vox]
    mx, my, mz = min(xs), min(ys), min(zs); pal, vv = [], []
    for (x, y, z), p in vox.items():
        c = ears[(x, y, z)] if p == "ear" else colour(x, y, z, p)
        if c not in pal: pal.append(c)
        vv.append((x - mx, z - mz, y - my, pal.index(c) + 1))
    ch = lambda cid, b: cid + struct.pack("<ii", len(b), 0) + b
    body = ch(b"SIZE", struct.pack("<iii", max(xs) - mx + 1, max(zs) - mz + 1, max(ys) - my + 1)) + ch(b"XYZI", struct.pack("<i", len(vv)) + b"".join(struct.pack("<BBBB", *v) for v in vv)) + ch(b"RGBA", b"".join(struct.pack("<BBBB", *c, 255) for c in pal) + b"\x00\x00\x00\xff" * (256 - len(pal)))
    open(out, "wb").write(b"VOX " + struct.pack("<i", 150) + b"MAIN" + struct.pack("<ii", 0, len(body)) + body)
    print(out, len(vv))
