# media/

Card art for the win overlay.

| File | What it is |
|---|---|
| `you_win.mp4` | The animated win card. 540x946, H.264, 6.33s, silent, ~620KB. **Loops.** |
| `you_win_poster.jpg` | Its opening frame, used as the `poster` while the video loads. |

`icons/you_win.png` is still the fallback still — it shows on any browser that
refuses to autoplay or can't decode the video. It is not otherwise used on a win.

## The loop

The video loops (via the `loop` attribute) for as long as the win overlay is up.
`hideResult()` pauses it on the way out.

**The source clip cannot be looped as-is.** Its first ~2.7s is a one-time reveal:
the card dims from cream to grey as the sunburst blooms behind the cat. Frame 0
and the last frame differ by ~44 units of mean brightness, so a naive `loop`
flashes hard every cycle. Cutting back to the closest matching frame instead
still jumps ~1.75x a normal frame step, because the confetti never repeats.

So the shipped file is **the settled portion only, cross-faded to wrap**: frames
64..239 of the source, with the segment's last second dissolved over its first
second. That makes the wrap a normal frame step (measured 7.5 vs 7.1 for an
ordinary step — i.e. invisible) at the cost of the reveal, which is no loss when
the overlay pops in anyway. The cat's full cheer is inside the looping section.

## Regenerating from a new source animation

The source was a 720x1280 render of `icons/you_win.png`. MP4 has no alpha
channel, so the tool that produced it **baked the transparency in as a literal
grey-and-white checkerboard** around the card's rounded corners. Much of the
recipe exists to get rid of that.

Build it with `scripts/make-win-loop.py` (crop + trim + cross-fade + encode, all
from the original file so there's only one generation of compression):

```sh
python3 scripts/make-win-loop.py path/to/source.mp4
```

Why the crop and encode flags are what they are:

- **`crop=702:1230:4:25`** — the card sits at x 0..710, y 21..1259 in the source.
  The crop insets 4px past that on every side. Cropping exactly on the measured
  edge is not enough: h264 blurs the boundary, and a 1-2px checkerboard fringe
  survives along the straight edges where `border-radius` cannot reach it.
- **`-an`** — the track is dropped deliberately. The video plays muted (every
  mobile browser blocks autoplay with sound), and the win jingle is already
  `playWinSound()`'s job. Keeping it would add ~160KB for silence.
- **`-movflags +faststart`** — moves the index to the front so playback can start
  before the whole file is in.
- **`scale=540`** — the card renders at ~240px wide on a phone (`max-height: 52vh`).
  540 is comfortable headroom; 720 just costs bytes.
- **`START = 64`** — where the reveal finishes, found by looking for the first
  frame whose mean brightness matches the settled level. If a re-render changes
  the pacing, this moves; the script prints a seam measurement so you'll know.
- **`FADE = 24`** — 1s. The script reports the wrap seam against a normal frame
  step; if they're within ~25% the loop is invisible.

## The corners

The crop removes the checkerboard from the straight edges but **not** from the
four corner arcs — the card is round there and the video is square. That last bit
is handled in CSS, by `#result-video { border-radius: 6.67% / 3.8% }`, which
clips each corner back to the artwork's own arc and lets the overlay scrim show
through exactly as it does for the transparent PNG.

The two percentages are not interchangeable with a single value: percentage radii
resolve against width horizontally and height vertically, so one value on a
540x946 box gives elliptical corners. `6.67%` of 540 and `3.8%` of 946 both land
on ~36px, keeping it circular at any rendered size.

**If you re-crop, re-check the radius.** 36px was chosen by compositing real
frames against the scrim and looking: at 20px a white wedge still showed in each
corner, at 52px the clip began eating the card's dark outline.

## If you change the dev server

`scripts/dev-server.js` needs `.mp4` -> `video/mp4` in its MIME map. Served as
`application/octet-stream`, Safari silently refuses the video and the card drops
to the still — which looks like the animation is broken rather than unsupported.
