import os
from PIL import Image
import numpy as np

root = r"f:\projects\CVClass\static\assets\principles"
files = sorted(os.listdir(root))
for fn in files:
    path = os.path.join(root, fn)
    try:
        img = Image.open(path)
        w, h = img.size
        arr = np.array(img.convert('L'))
        bg = arr > 240
        row_fg = (~bg).any(axis=1)
        col_fg = (~bg).any(axis=0)
        top = int(np.argmax(row_fg))
        bottom = int(len(row_fg) - np.argmax(row_fg[::-1])) if row_fg.any() else h
        left = int(np.argmax(col_fg))
        right = int(len(col_fg) - np.argmax(col_fg[::-1])) if col_fg.any() else w
        empty = ~row_fg
        half = h // 2
        max_gap = 0
        gap_y = None
        in_gap = False
        cur_start = 0
        cur_len = 0
        for y in range(half, h):
            if empty[y]:
                if not in_gap:
                    cur_start = y
                    cur_len = 1
                    in_gap = True
                else:
                    cur_len += 1
            else:
                if in_gap and cur_len > max_gap:
                    max_gap = cur_len
                    gap_y = cur_start
                in_gap = False
        if in_gap and cur_len > max_gap:
            max_gap = cur_len
            gap_y = cur_start
        size_kb = os.path.getsize(path) / 1024
        print(f"{fn}: {w}x{h}, size={size_kb:.1f}KB, bbox=[{left},{top},{right},{bottom}], bottom_gap={max_gap}px@y={gap_y}")
    except Exception as e:
        print(f"{fn}: ERROR {e}")
