# The Re-Charge AI hub (the office PC)

The office PC runs an AI model that sorts incoming emails, WhatsApps and website enquiries for the
admin panel. It costs nothing per message, and message text stays on your own machine. If the PC
is off, the website quietly uses Claude instead, so nothing stops working.

```
website / admin panel ──► Supabase (ai-hub, project-intake)
                                │  https, with the hub password
                                ▼
                     Tailscale Funnel  https://<pc-name>.<tailnet>.ts.net
                                ▼
                     proxy.py  (this folder, port 8787: checks the password)
                                ▼
                     LM Studio server (port 1234) ── Qwen 2.5 7B Instruct on the RX 580
```

**Why LM Studio, not Ollama:** Ollama's AMD support doesn't cover the RX 580. LM Studio runs models
on it through Vulkan.

## Set it up (about 30 minutes, once)

1. **LM Studio:**
   - Install it from lmstudio.ai.
   - In **Discover**, download **Qwen2.5 7B Instruct** in the **Q4_K_M** version (about 4.7 GB; it fits in the 8 GB card).
   - In **Settings → Runtime**, pick the **Vulkan** llama.cpp engine.
2. **The server:**
   - Go to the **Developer** tab and load the model.
   - Set **GPU offload** to the maximum, and **Context length** to 8192 (the website chat needs it; it still fits in 8 GB).
   - Turn the server **on** (port 1234).
   - In the server settings, tick **Start the server when LM Studio starts**. In LM Studio's app settings, tick **Run on startup**.
   - Leave **Serve on local network** off: the gateway is the only way in.
   - Test it: open http://127.0.0.1:1234/v1/models in a browser. It should list the model.
3. **Python 3:** install it from python.org and tick "Add python.exe to PATH". The gateway needs nothing else.
4. **The hub password:** in this folder, make **hub-token.txt** holding one long random line. In PowerShell:
   `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_}) | Out-File -NoNewline -Encoding ascii hub-token.txt`
   Keep it secret: it's what stops anyone else using your PC's AI.
5. **Start the gateway:**
   - Double-click **start-hub.bat**.
   - To start it with Windows: press Win+R, type `shell:startup`, and put a shortcut to start-hub.bat in that folder.
   - Test it: http://127.0.0.1:8787/health should answer `{"ok": true}`.
6. **Tailscale (the secure address):**
   - Install Tailscale from tailscale.com (free) and sign in.
   - In an admin terminal, run `tailscale funnel --bg 8787`. It prints your https address, like `https://office-pc.tail1234.ts.net`. That address stays the same.
   - If it asks, allow Funnel for your tailnet in the Tailscale admin page.
   - Tailscale starts with Windows by itself.
7. **Tell Supabase about it:** in your own terminal, not in a chat:
   `supabase secrets set LOCAL_AI_URL=https://office-pc.tail1234.ts.net LOCAL_AI_TOKEN=<the line in hub-token.txt> --project-ref aqwdncyihcbktbbuvvzd`
8. **Check it from the panel:** open **Settings → AI hub**. It should say **Online**, with the model's name. Press **Try it** to sort a sample message.

## Keeping it healthy
- **Load-shedding:** set the BIOS to "Power on after power loss" if your board has it. Everything above starts by itself after a reboot. A small UPS keeps it running through short cuts.
- **Windows Update restarts:** set active hours to cover the working day. Again, everything restarts by itself.
- **Speed:** a 7B model on the RX 580 sorts a message in a few seconds. Each answer also shows in the gateway window as one line: the time, the request, and how long it took. Message text is never logged.
- **Turning it off:** remove `LOCAL_AI_URL` from the Supabase secrets, or stop the gateway. Sorting then uses Claude, if `ANTHROPIC_API_KEY` is set.

## What the PC answers
- **Sorting** incoming enquiries, emails and WhatsApps (admin panel). A few seconds each.
- **Reply drafts** for your leads (admin panel). About 10–20 seconds each.
- **The website chat** ("Ask us anything") and the "Try it on your own email" example.
  - The first question in a while takes longest (10–20 seconds), while the model reads the business facts. Later questions are quicker, because LM Studio keeps those facts loaded.
  - One visitor is answered at a time; others wait their turn.
  - When the PC is off, the website goes back to prepared answers and WhatsApp by itself, within about 5 minutes.

## Call transcription (Whisper)
Calls you upload or record in the admin panel are transcribed here, then summarised by the model above. `worker.py` collects them from the website; nothing on this PC needs opening up.

1. **Whisper:**
   - From github.com/ggerganov/whisper.cpp → **Releases**, download the Windows build (`whisper-bin-x64.zip`) and unzip it into a folder called **whisper** next to these files, so that `hub\whisper\whisper-server.exe` exists.
   - If the release has a **Vulkan** build, use that one instead: it runs on the RX 580 and is faster.
2. **The model:** download `ggml-small.bin` (466 MB) from huggingface.co/ggerganov/whisper.cpp into the same **whisper** folder.
   - "small" understands South African English and Afrikaans well, and runs fine on the CPU.
   - `ggml-base.bin` is faster but makes more mistakes.
3. **ffmpeg:** run `winget install ffmpeg` in a terminal, so Whisper can read phone recordings (m4a, mp3, amr, ogg, webm).
4. **Restart `start-hub.bat`.** It now also opens a minimised **Whisper** window and a **Re-Charge call worker** window.
   - The worker checks for new recordings every 20 seconds.
   - Each one is logged as one line: downloading, transcribing, done.
   - The recording is deleted from this PC as soon as it's done.
5. **Test it:** in the panel, open a lead → **Calls → Add a call recording**, and upload a short voice note. The notes should appear on the lead in a minute or two.

**Speed:** with the "small" model on the CPU, a 10-minute call takes roughly 3 to 6 minutes, plus about 20 seconds for the notes. Calls wait in a queue and are done one at a time.
