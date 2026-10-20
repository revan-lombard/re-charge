# The Re-Charge AI hub (the office PC)

The office PC runs an AI model that answers the website chat and demos, the "try it on your own
email" example, **your clients' Inbox Assistant** (their replies and thread summaries), the demo
builder, and sorts and drafts for the admin panel. It costs nothing per message, and the text never
goes to an outside AI: there's no Anthropic key (ADMIN.md 8dd).

**Keep it on during business hours.** If the PC is off, the website falls back to prepared answers
and WhatsApp, but a client's Inbox Assistant page says "Our AI computer is offline for a few
minutes", and Microsoft 365 drafts wait for the PC. A small UPS and "power on after power loss"
(below) cover most load-shedding.

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
Ollama (127.0.0.1:11434) ── Llama 3.1 8B        (or LM Studio on 127.0.0.1:1234)
```

**The model:** you run **Ollama with Llama 3.1 8B** (your "Local Llama 3.1 API" handover), and the
worker finds it by itself. LM Studio works too: the worker uses whichever answers, Ollama first.

## Set it up (about 30 minutes, once)

1. **Ollama and the model** (already running on your PC, per the handover):
   - Ollama from ollama.com, and the model: `ollama pull llama3.1` in a terminal.
   - Ollama starts with Windows by itself (its icon sits by the clock).
   - Test it: open http://127.0.0.1:11434/api/tags in a browser. It should list `llama3.1`.
2. **What the worker asks Ollama for** (nothing to set; change them in start-hub.bat only if you need to):
   - **An 8,192-token context.** The website chat's instructions alone are about 3,200 tokens, and Ollama's own default on an 8 GB card is 4,096. That leaves room for only the instructions and the latest question, so the chat would forget what the visitor said earlier. The model and an 8,192 context fit in 8 GB.
   - **Keep the model loaded** between questions, so no visitor waits the 15 to 20 seconds it takes to load. The worker also loads it as soon as it starts.
   - **Llama 3.1**, if Ollama has it; another model only if you set `HUB_MODEL`.
   - **Make Ollama's own defaults match, once.** Anything else that talks to Ollama (your /chat API, `ollama run`, the Ollama app's own chat) sends no context size. Ollama then reloads the model at 4,096 and forgets "keep it loaded", and the next website visitor waits 15 to 20 seconds. To stop that:
     1. Quit Ollama from its icon by the clock.
     2. In Windows, search for **environment variables** and open **Edit environment variables for your account**.
     3. Click **New** and add `OLLAMA_CONTEXT_LENGTH` with the value `8192`. Click **New** again and add `OLLAMA_KEEP_ALIVE` with the value `-1`. Press **OK**.
     4. Start Ollama again from the Start menu.

     (The Ollama app's Settings also has a context-length slider; 8k there does the same as `OLLAMA_CONTEXT_LENGTH`.) If you ever change `HUB_CONTEXT`, change `OLLAMA_CONTEXT_LENGTH` to the same number.
   - **Privacy:** keep Ollama's debug logging off (don't set `OLLAMA_DEBUG`), so no visitor text is written to its log on this PC.
   - **Using LM Studio instead:** load a model, set its Context length to 8192, turn its server on (port 1234), and keep its Verbose logging off. Then empty the `server-logs` folder under `.lmstudio` in your user folder. If Ollama isn't running, the worker uses LM Studio.
3. **Python 3:** install it from python.org and tick "Add python.exe to PATH". The worker needs nothing else.
4. **The hub password:** in this folder, make **hub-token.txt** holding one long random line. In PowerShell:
   `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_}) | Out-File -NoNewline -Encoding ascii hub-token.txt`
   Keep it secret: it's what proves to the website that this PC is yours.
5. **Tell Supabase.** First get the newest files: in the re-charge folder, `git pull` (once the repo is private, Git opens a browser the first time to sign in to GitHub). Then:
   - In the Supabase website's **SQL Editor**, run the database update `supabase/migrations/0035_hub_queue.sql` (after `0031_ai_hub.sql`, if you haven't run that yet).
   - The rest in your own terminal, from the re-charge folder (never in a chat):
     - Deploy the functions that use the PC: `supabase functions deploy hub-jobs assistant ai-hub project-intake --project-ref aqwdncyihcbktbbuvvzd`
     - Set the password: `supabase secrets set LOCAL_AI_TOKEN=<the line in hub-token.txt> --project-ref aqwdncyihcbktbbuvvzd`
     - If you ever set `LOCAL_AI_URL` (the older way), remove it: `supabase secrets unset LOCAL_AI_URL --project-ref aqwdncyihcbktbbuvvzd`
6. **Start the worker:**
   - Close any start-hub.bat window that's already open, then double-click **start-hub.bat**. Its window says "Ollama is answering, with llama3.1:latest", "Model loaded and ready" and "Connected: the website can use this PC".
   - Then check Ollama is using the graphics card: run `ollama ps` in a terminal. **PROCESSOR** should say `100% GPU` and **CONTEXT** `8192`. If it says CPU, answers will be slow: update Ollama and the AMD graphics driver, or use LM Studio's Vulkan engine (step 2).
   - To start it with Windows: press Win+R, type `shell:startup`, and put a shortcut to start-hub.bat in that folder.
   - Each answer shows in the window as one line: what it was and how long it took. The worker never shows or saves message text.
   - The window can be minimised. Clicking inside it can't freeze it: the worker switches the window's "select" mode off.
7. **Check it from the panel:** open **Settings → AI hub**. It should say **Online**, with the model's name and "The PC collects its jobs". Press **Try it** to sort a sample message. Then open the website in a new tab (a tab remembers "PC off" for 5 minutes) and ask the chat a question.

## Keeping it healthy
- **Load-shedding and restarts:** set the BIOS to "Power on after power loss" if your board has it, and set Windows Update's active hours to cover the working day. After any restart, Ollama and start-hub.bat start only once Windows is signed in, so sign in when the power comes back (after Windows Update restarts, Windows usually signs in by itself if "Use my sign-in info to automatically finish setting up" is on in Settings → Accounts → Sign-in options). If the PC is somewhere safe, you can turn on automatic sign-in for this PC instead. A small UPS keeps it running through short cuts.
- **Speed:** Llama 3.1 8B answers a short question in a few seconds once loaded. A client's reply takes about 10 to 30 seconds, a thread summary up to a minute, and building a demo a few minutes (it's written two items at a time). Collecting and handing back a job adds about a second.
- **Is it on?** The panel's **Settings → AI hub** says Online or, when the PC is off, when it last checked in, that its model isn't answering, or that a setup step is missing. The website treats the PC as off when its model isn't answering, or the PC hasn't checked in for 35 seconds and isn't busy with a job.
- **Turning it off:** close the worker window (or remove `LOCAL_AI_TOKEN` from the Supabase secrets). The website goes back to prepared answers, clients' pages say the AI is offline, and sorting waits (there's no Claude key).

## What the PC answers
- **Sorting** incoming enquiries, emails and WhatsApps (admin panel). A few seconds each.
- **Reply drafts** for your leads (admin panel). About 10–20 seconds each.
- **Your clients' Inbox Assistant:** each reply (10–30 seconds) and thread summary (up to a minute) on their private page, and the drafts that go straight into a Microsoft 365 inbox (a few every 10 minutes). The answer's shape is sent with the job, and Ollama keeps to it (worker version 5 or later: `git pull` and restart start-hub.bat).
- **The demo builder** (a lead's Live demo card): ten items, two at a time, a few minutes in all.
- **The website chat** ("Ask us anything") and the "Try it on your own email" example.
  - The first question in a while takes longest (10–20 seconds), while the model reads the business facts. Later questions are quicker, because Ollama keeps those facts loaded.
  - One visitor is answered at a time; others wait their turn.
  - When the PC is off, new visitors get the prepared answers and WhatsApp within about half a minute. A page that's already open switches to them the first time an answer doesn't come.

## Call transcription (Whisper)
Calls you upload or record in the admin panel are transcribed here, then summarised by the model above. `worker.py` collects them from the website; nothing on this PC needs opening up. Transcribing runs alongside the website answers; while a call's notes are being written (about 20 seconds) a website answer can take a little longer.

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
   - The recording is deleted from this PC as soon as it's done (and any left by a closed window or a power cut is deleted when the worker next starts).
5. **Test it:** in the panel, open a lead → **Calls → Add a call recording**, and upload a short voice note. The notes should appear on the lead in a minute or two.

**Speed:** with the "small" model on the CPU, a 10-minute call takes roughly 3 to 6 minutes, plus about 20 seconds for the notes. Calls wait in a queue and are done one at a time.

## Your Llama /chat API and the Cloudflare quick tunnel (not needed for the website)
Your handover sets up a FastAPI wrapper (port 8000, `POST /chat`, with its own key) around Ollama, and
a Cloudflare quick tunnel that gives it a public address. **The website doesn't need either:** the
worker talks to Ollama on this PC directly, and it reaches the website without any address. Keep
them if you use them for other things, but close the tunnel when you're not using it: anyone with the
address and the key can use your PC's AI. Also, FastAPI shows a page describing the API at `/docs` to
anyone, unless you turn it off.

**If you'd rather the website used your /chat API through the tunnel** instead of the worker, the
backend supports it. It's not recommended, for three reasons:
1. A quick tunnel's address changes every time it restarts, and the website stops using the PC until
   you update the secret.
2. Cloudflare decrypts the text on its way through, so the privacy notice has to name it.
3. The wrapper sends no context size or keep-alive, so set Ollama's own defaults first (step 2,
   "Make Ollama's own defaults match").

If you still want it, do these in order:
1. **First, the privacy notice:** ask Claude to switch the privacy page to "tunnel mode". It names
   Cloudflare (USA) as carrying the website's questions to your PC, and the site is rebuilt. Don't skip
   this: otherwise the page says something that isn't true.
2. **Set two secrets** in your own terminal (never paste the key into a chat). Leave `LOCAL_AI_TOKEN`
   and `hub-token.txt` as they are: they're the hub password, and they must never go through the tunnel.
   `supabase secrets set LOCAL_AI_URL=https://<your-tunnel>.trycloudflare.com/chat LOCAL_AI_CHAT_KEY=<your /chat API key> --project-ref aqwdncyihcbktbbuvvzd`
3. **Deploy the functions** (if you haven't since `git pull`):
   `supabase functions deploy assistant ai-hub project-intake hub-jobs --project-ref aqwdncyihcbktbbuvvzd`

**Settings → AI hub** then shows "Your /chat API, through a tunnel". It tells you in plain words when
the tunnel is down or has a new address, the key is wrong, or the API isn't running. The worker's
window will say that LOCAL_AI_URL is set: that's expected, and it still writes call notes. Each time
the tunnel restarts, set `LOCAL_AI_URL` again with the new address. To go back to the worker:
`supabase secrets unset LOCAL_AI_URL LOCAL_AI_CHAT_KEY --project-ref aqwdncyihcbktbbuvvzd`, and ask
Claude to switch the privacy page back.

## The older way: proxy.py at a public address (not needed)
Before the worker collected its jobs, the backend called `proxy.py` (port 8787, OpenAI-style) at a
public address such as a Tailscale Funnel, with `LOCAL_AI_URL` set to that address. It still works
(remove the REM in start-hub.bat on the `proxy.py` line for your model server: there's one for LM Studio
and one for Ollama), but use the worker instead. If you set up a Tailscale Funnel before, turn it off with
`tailscale funnel reset` in an admin terminal (or uninstall Tailscale).
