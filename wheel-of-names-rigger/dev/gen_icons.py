#!/usr/bin/env python3
"""Generate simple wheel-of-names icons (no external deps)."""
import math, struct, zlib, os

OUT = "/home/user/buddy/wheel-of-names-rigger/icons"
os.makedirs(OUT, exist_ok=True)

# vibrant wheel sector colors
SECTORS = [
    (239, 68, 68),    # red
    (245, 158, 11),   # amber
    (34, 197, 94),    # green
    (59, 130, 246),   # blue
    (168, 85, 247),   # purple
    (236, 72, 153),   # pink
]
HUB = (15, 23, 42)        # dark hub
POINTER = (15, 23, 42)    # dark pointer


def px(size):
    cx = cy = (size - 1) / 2.0
    R = size * 0.46
    hub_r = size * 0.10
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)
            r, g, b, a = 0, 0, 0, 0
            if dist <= R:
                # angle measured from top, clockwise
                ang = (math.atan2(dx, -dy)) % (2 * math.pi)
                seg = int(ang / (2 * math.pi) * len(SECTORS)) % len(SECTORS)
                r, g, b = SECTORS[seg]
                a = 255
                if dist <= hub_r:
                    r, g, b = HUB
            # pointer: small triangle dipping in from the top center
            tip_y = R * 0.55
            half = size * 0.085
            if -half <= dx <= half and 0 <= (dy + R) <= (R - tip_y):
                # widen toward the rim
                prog = (dy + R) / max(1e-6, (R - tip_y))
                if abs(dx) <= half * (1 - prog) + 0.5:
                    r, g, b, a = (*POINTER, 255)
            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    rows = px(size)
    raw = b"".join(b"\x00" + r for r in rows)
    comp = zlib.compress(raw, 9)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


for s in (16, 48, 128):
    write_png(os.path.join(OUT, f"icon{s}.png"), s)
    print("wrote", f"icon{s}.png")
