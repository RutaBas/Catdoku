#!/usr/bin/env python3
"""Build media/you_win.mp4 (+ poster) from a source win animation.

    python3 scripts/make-win-loop.py path/to/source.mp4

Not part of the shipped app — run it by hand when the animation is re-rendered.
See media/README.md for why each number is what it is. The short version:

  * The source has a transparency checkerboard baked into its edges (MP4 has no
    alpha), so it gets cropped to the card and inset past the h264 blur fringe.
  * Its first ~2.7s is a one-time reveal that makes the clip unloopable, so only
    the settled remainder is kept, cross-faded onto itself so it wraps cleanly.
  * Everything happens in one decode -> one encode, to avoid a second generation
    of compression loss.

Requires ffmpeg/ffprobe on PATH and numpy.
"""

import os
import subprocess
import sys

import numpy as np

# --- tunables, all measured against the original 720x1280 render -------------

CROP = "crop=702:1230:4:25"  # card is at x 0..710, y 21..1259; 4px inset clears
                             # the compression fringe that border-radius can't
OUT_W = 540                  # renders ~240px wide on a phone; 540 is headroom
START = 64                   # first frame whose brightness matches the settled
                             # level, i.e. where the one-time reveal has finished
FADE = 24                    # 1s cross-fade; long enough to hide the wrap,
                             # short enough not to eat the cat's cheer
FPS = 24
CRF = 30                     # flat cartoon art; 30 is visually clean here

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, os.pardir, "media")


def probe_dims(src):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", src],
        capture_output=True, text=True, check=True).stdout.strip()
    return tuple(int(v) for v in out.split("x")[:2])


def decode_settled(src):
    """Decode the cropped, scaled frames from START onward as raw RGB."""
    vf = f"{CROP},scale={OUT_W}:-2,select=gte(n\\,{START})"
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", src, "-vf", vf, "-vsync", "0",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True)
    # derive the scaled height rather than assuming it
    probe = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", src, "-vf", f"{CROP},scale={OUT_W}:-2",
         "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True).stdout
    h = len(probe) // (OUT_W * 3)
    return np.frombuffer(proc.stdout, dtype=np.uint8).reshape(-1, h, OUT_W, 3), h


def make_loop(seg):
    """Dissolve the segment's tail over its head so the wrap is a normal step.

    result[0] lands exactly where result[-1] leaves off, which is what makes the
    loop invisible rather than merely quick.
    """
    length = len(seg)
    keep = length - FADE
    if keep <= FADE:
        sys.exit(f"segment too short: {length} frames with a {FADE}-frame fade")
    out = seg[:keep].copy()
    a = (np.arange(FADE, dtype=np.float32) / FADE).reshape(FADE, 1, 1, 1)
    head = seg[:FADE].astype(np.float32)
    tail = seg[keep:keep + FADE].astype(np.float32)
    out[:FADE] = np.clip(head * a + tail * (1 - a), 0, 255).astype(np.uint8)
    return out


def encode(frames, h, dest, poster):
    raw = os.path.join(MEDIA, "_loop_raw.rgb")
    frames.tofile(raw)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{OUT_W}x{h}", "-r", str(FPS), "-i", raw, "-an",
             "-c:v", "libx264", "-profile:v", "main", "-level", "4.0",
             "-pix_fmt", "yuv420p", "-crf", str(CRF), "-preset", "slow",
             "-movflags", "+faststart", dest], check=True)
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{OUT_W}x{h}", "-r", str(FPS), "-i", raw, "-frames:v", "1",
             "-vf", "scale=270:-2", "-c:v", "mjpeg", "-q:v", "6", poster],
            check=True)
    finally:
        if os.path.exists(raw):
            os.remove(raw)


def report(frames):
    """The wrap should cost about as much as any other frame step."""
    g = frames[:, ::4, ::4, :].astype(np.float32).mean(3)
    wrap = np.abs(g[-1] - g[0]).mean()
    step = np.abs(np.diff(g, axis=0)).mean()
    print(f"  wrap seam:   {wrap:.2f}")
    print(f"  normal step: {step:.2f}")
    print("  -> " + ("seamless" if wrap <= step * 1.25 else
                     "VISIBLE SEAM: re-check START, the reveal may have moved"))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    if not os.path.exists(src):
        sys.exit(f"no such file: {src}")
    print(f"source {src} {probe_dims(src)[0]}x{probe_dims(src)[1]}")
    seg, h = decode_settled(src)
    print(f"settled segment: {len(seg)} frames from #{START}")
    loop = make_loop(seg)
    print(f"loop: {len(loop)} frames ({len(loop)/FPS:.2f}s) at {OUT_W}x{h}")
    report(loop)
    dest = os.path.normpath(os.path.join(MEDIA, "you_win.mp4"))
    poster = os.path.normpath(os.path.join(MEDIA, "you_win_poster.jpg"))
    encode(loop, h, dest, poster)
    print(f"wrote {dest} ({os.path.getsize(dest)//1024}KB)")
    print(f"wrote {poster} ({os.path.getsize(poster)//1024}KB)")
    print("\nIf you re-cut this, re-check #result-video's border-radius in "
          "css/styles.css — it's tuned to this exact crop.")


if __name__ == "__main__":
    main()
