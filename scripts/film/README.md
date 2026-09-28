# Flow film (assets/video/flow*.mp4|webm)

A 20-second muted loop of the free-mockup route, rendered frame by frame from
`film.html` (edit the words or timings there; `render(t)` draws time `t`).

    cd scripts/film
    NODE_PATH=/opt/node22/lib/node_modules node render.js "$PWD"            # → frames/ (1280×720)
    NODE_PATH=/opt/node22/lib/node_modules node render.js "$PWD" portrait   # → framesP/ (720×960, phones)
    FF=ffmpeg   # any build with libx264 + libvpx-vp9 (pip install imageio-ffmpeg works)
    $FF -framerate 30 -i frames/%04d.png -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an ../../assets/video/flow.mp4
    $FF -framerate 30 -i frames/%04d.png -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -an ../../assets/video/flow.webm
    $FF -i frames/0225.png -q:v 4 ../../assets/video/flow-poster.jpg
    # same three with framesP/ → flow-portrait.mp4, flow-portrait.webm, flow-poster-portrait.jpg

script.js plays it only while on screen, swaps in the portrait cut on phones,
and shows a play button instead of autoplay for reduced-motion visitors.
Bella Hair Studio is a demo business (the same one used on the Demos page).
