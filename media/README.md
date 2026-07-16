# media/

Card art for the win overlay.

| File | What it is |
|---|---|
| `you_win.mp4` | The animated win card. 540x946, H.264, 10s, silent, ~970KB. |
| `you_win_poster.jpg` | Its closing frame, used as the `poster` while the video loads. |

`icons/you_win.png` is still the fallback still — it shows on any browser that
refuses to autoplay or can't decode the video. It is not otherwise used on a win.

## Regenerating from a new source animation

The source was a 720x1280 render of `icons/you_win.png`. MP4 has no alpha
channel, so the tool that produced it **baked the transparency in as a literal
grey-and-white checkerboard** around the card's rounded corners. Everything below
exists to get rid of that.

```sh
ffmpeg -i source.mp4 -an \
  -vf "crop=702:1230:4:25,scale=540:-2" \
  -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p \
  -crf 30 -preset slow -movflags +faststart you_win.mp4

ffmpeg -i source.mp4 -vf "select='eq(n\,239)',crop=702:1230:4:25,scale=270:-2" \
  -frames:v 1 -c:v mjpeg -q:v 6 you_win_poster.jpg
```

Why each part:

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
