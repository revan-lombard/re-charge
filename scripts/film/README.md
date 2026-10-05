# Flow film (assets/video/flow*.mp4|webm)

A 24-second muted loop of the free-mockup route, rendered frame by frame from
`film.html` (edit the words or timings there; `render(t)` draws time `t`).

    cd scripts/film
    NODE_PATH=/opt/node22/lib/node_modules node render.js "$PWD"            # → frames/ (1280×720)
    NODE_PATH=/opt/node22/lib/node_modules node render.js "$PWD" portrait   # → framesP/ (720×960, phones)
    FF=ffmpeg   # any build with libx264 + libvpx-vp9 (pip install imageio-ffmpeg works)
    $FF -framerate 30 -i frames/%04d.png -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an ../../assets/video/flow.mp4
    $FF -framerate 30 -i frames/%04d.png -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -an ../../assets/video/flow.webm
    $FF -i frames/0095.png -q:v 4 ../../assets/video/flow-poster.jpg
    # same three with framesP/ → flow-portrait.mp4, flow-portrait.webm, flow-poster-portrait.jpg

script.js plays it only while on screen, swaps in the portrait cut on phones,
and shows a play button instead of autoplay for reduced-motion visitors.
Bella Hair Studio is a demo business (the same one used on the Demos page).

## Ad cuts (assets/video/ads/)

Full-HD versions for paid ads: 25 s, ending on the logo, the free-mockup link
and the WhatsApp number, which stay on screen instead of looping. Text in the
9:16 cut stays clear of the top 14% and bottom 20%, where Stories and Reels put
their own buttons. A silent audio track is included because some ad tools
reject video with no audio.

    cd scripts/film
    for m in story feed wide; do NODE_PATH=/opt/node22/lib/node_modules node render-ad.js "$PWD" $m; done   # → ads/<mode>/ at 1.5×
    $FF -framerate 30 -i ads/story/%04d.png -f lavfi -i anullsrc=r=48000:cl=stereo -shortest \
        -c:v libx264 -profile:v high -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart \
        ../../assets/video/ads/re-charge-free-mockup-9x16-stories-reels.mp4
    # same for feed → …-4x5-feed.mp4 (1080×1350) and wide → …-16x9-youtube.mp4 (1920×1080)

15-second cuts (`…-15s-….mp4`): add `15` after the mode, e.g. `node render-ad.js "$PWD" story 15`
(frames go to ads/story-15/). The steps play about 1.7× faster, the "You're live" beat is skipped
and the end card holds for the last ~2.5 s; the timing is the CUT15 table in render-ad.js.

Desktop hero cut (`flow-hero.*`, 4:5, 720×900): `node render.js "$PWD" feed` → framesH/, encoded like
the portrait cut to `flow-hero.mp4|webm` and `flow-poster-hero.jpg`. script.js uses it on screens
901px+ for a video with `data-desktop`, and sizes it to the height of the text beside it.

## Hero film (assets/video/ai-hero.mp4)

The homepage hero's film: at 11:47pm a customer asks a salon about Sunday hours and a
price, the assistant answers in seconds, takes the booking, and the owner wakes to it at
7am. 24 s, muted, looping. Source is `ai-film.html` (same `render(t)` contract as
`film.html`).

    cd scripts/film
    NODE_PATH=/opt/node22/lib/node_modules node render-ai.js "$PWD" hero    # → framesAI-hero/
    FF=/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2
    $FF -framerate 30 -i framesAI-hero/%04d.png -c:v libx264 -preset slow -crf 25 \
        -pix_fmt yuv420p -movflags +faststart -an ../../assets/video/ai-hero.mp4
    $FF -i framesAI-hero/0240.png -q:v 4 ../../assets/video/ai-poster-hero.jpg

Two things about it are deliberate and easy to undo by accident:

**It is drawn at 396×495 and rendered at 2×, not at 720×900.** The hero column is about
396 CSS px wide, so a film designed at 720 is shrunk to half size on the page — the first
cut nested a phone inside that frame and the message text came out around 7px, which is
unreadable. Designing at the size it is actually displayed means a 13px bubble is 13px to
the reader, and the 2× render keeps it sharp on a retina screen.

**mp4 only, and mp4 listed first.** For this footage — dark, mostly still, lots of text —
x264 at crf 25 is 356 KB where VP9 at crf 40 is 719 KB. The older `flow.*` films still
ship both, but their `<source>` order was webm-first, so every modern browser was
downloading the larger file; that order is now mp4-first everywhere.
