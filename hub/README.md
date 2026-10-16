# The Re-Charge AI hub (the office PC)

The office PC runs an AI model that answers the website chat and demos, the "try it on your own
email" example, and sorts and drafts for the admin panel. It costs nothing per message, and the
text never goes to an outside AI. If the PC is off, the website quietly falls back (prepared answers
for the website, Claude for the panel), so nothing stops working.

**The PC only ever calls out.** `worker.py` keeps asking the website's backend "anything for me?",
answers each question with the model, and hands the answer back. Nothing on the PC is open to the
internet, and it needs no address, tunnel, open port or extra account (no Tailscale, no Cloudflare).

```
visitor on the website / you in the admin panel
          │
          ▼
Supabase (assistant, ai-hub, project-intake) ── leaves the job in ai_requests and waits a few seconds
          ▲
          │  https, the PC calls out with the hub password (the hub-jobs function)
          │
worker.py on the office PC ── collects the job within a second, answers it, hands it back
          │
          ▼
LM Studio server (127.0.0.1:1234) ── Qwen 2.5 7B Instruct on the RX 580
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
   - Leave **Serve on local network** off: only `worker.py` on this PC talks to it.
   - Test it: open http://127.0.0.1:1234/v1/models in a browser. It should list the model.
3. **Python 3:** install it from python.org and tick "Add python.exe to PATH". The worker needs nothing else.
4. **The hub password:** in this folder, make **hub-token.txt** holding one long random line. In PowerShell:
   `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_}) | Out-File -NoNewline -Encoding ascii hub-token.txt`
   Keep it secret: it's what proves to the website that this PC is yours.
5. **Tell Supabase** (in your own terminal, not in a chat):
   - Run the database update `supabase/migrations/0035_hub_queue.sql` in the Supabase SQL Editor.
   - Deploy the functions that use the PC: `supabase functions deploy hub-jobs assistant ai-hub project-intake --project-ref aqwdncyihcbktbbuvvzd`
   - Set the password: `supabase secrets set LOCAL_AI_TOKEN=<the line in hub-token.txt> --project-ref aqwdncyihcbktbbuvvzd`
   - If you ever set `LOCAL_AI_URL` (the older way), remove it: `supabase secrets unset LOCAL_AI_URL --project-ref aqwdncyihcbktbbuvvzd`
6. **Start the worker:**
   - Double-click **start-hub.bat**. Its window says "LM Studio is answering: ready for the website".
   - To start it with Windows: press Win+R, type `shell:startup`, and put a shortcut to start-hub.bat in that folder.
   - Each answer shows in the window as one line: what it was and how long it took. Message text is never shown or saved.
7. **Check it from the panel:** open **Settings → AI hub**. It should say **Online**, with the model's name and "The PC collects its jobs". Press **Try it** to sort a sample message. Then ask the website chat a question.

## Keeping it healthy
- **Load-shedding:** set the BIOS to "Power on after power loss" if your board has it. Everything above starts by itself after a reboot. A small UPS keeps it running through short cuts.
- **Windows Update restarts:** set active hours to cover the working day. Again, everything restarts by itself.
- **After a power cut:** LM Studio and start-hub.bat start when Windows signs in, so the PC needs to get past the login screen. Sign in after the power comes back, or, only if the PC is somewhere safe, turn on automatic sign-in for this PC.
- **Speed:** a 7B model on the RX 580 sorts a message in a few seconds. Collecting and handing back a job adds about a second.
- **Is it on?** The panel's **Settings → AI hub** shows when the PC last checked in. The website treats the PC as off when it hasn't checked in for 75 seconds, or LM Studio isn't answering.
- **Turning it off:** close the worker window (or remove `LOCAL_AI_TOKEN` from the Supabase secrets). The website goes back to prepared answers; sorting uses Claude, if `ANTHROPIC_API_KEY` is set.

## What the PC answers
- **Sorting** incoming enquiries, emails and WhatsApps (admin panel). A few seconds each.
- **Reply drafts** for your leads (admin panel). About 10–20 seconds each.
- **The website chat** ("Ask us anything") and the "Try it on your own email" example.
  - The first question in a while takes longest (10–20 seconds), while the model reads the business facts. Later questions are quicker, because LM Studio keeps those facts loaded.
  - One visitor is answered at a time; others wait their turn.
  - When the PC is off, the website goes back to prepared answers and WhatsApp by itself, within about a minute.

## Call transcription (Whisper)
Calls you upload or record in the admin panel are transcribed here, then summarised by the model above. `worker.py` collects them from the website, alongside the website answers (a long call never holds up a visitor); nothing on this PC needs opening up.

1. **Whisper:**
   - From github.com/ggerganov/whisper.cpp → **Releases**, download the Windows build (`whisper-bin-x64.zip`) and unzip it into a folder called **whisper** next to these files, so that `hub\whisper\whisper-server.exe` exists.
   - If the release has a **Vulkan** build, use that one instead: it runs on the RX 580 and is faster.
2. **The model:** download `ggml-small.bin` (466 MB) from huggingface.co/ggerganov/whisper.cpp into the same **whisper** folder.
   - "small" understands South African English and Afrikaans well, and runs fine on the CPU.
   - `ggml-base.bin` is faster but makes more mistakes.
3. **ffmpeg:** run `winget install ffmpeg` in a terminal, so Whisper can read phone recordings (m4a, mp3, amr, ogg, webm).
4. **Restart `start-hub.bat`.** It now also opens a minimised **Whisper** window.
   - The worker hears about a new recording within about 20 seconds.
   - Each one is logged as one line: downloading, transcribing, done.
   - The recording is deleted from this PC as soon as it's done.
5. **Test it:** in the panel, open a lead → **Calls → Add a call recording**, and upload a short voice note. The notes should appear on the lead in a minute or two.

**Speed:** with the "small" model on the CPU, a 10-minute call takes roughly 3 to 6 minutes, plus about 20 seconds for the notes. Calls wait in a queue and are done one at a time.

## The older way: an address for the PC (not needed)
Before the worker collected its jobs, the backend called the PC at a public address: `proxy.py` on
port 8787 behind Tailscale Funnel (or a Cloudflare Tunnel), with `LOCAL_AI_URL` set in Supabase. It
still works (set `LOCAL_AI_URL`, and remove the REM in start-hub.bat for `proxy.py`), but it needs an
extra account and a public address for the PC, so use the worker above instead.
