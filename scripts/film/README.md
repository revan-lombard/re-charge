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
