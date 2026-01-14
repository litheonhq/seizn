# Seizn Demo Script (2 Minutes)

## Pre-Demo Checklist

### Environment
- [ ] Chrome/Edge browser (latest)
- [ ] Screen resolution: 1920x1080
- [ ] Dark mode OFF (better for recording)
- [ ] Notifications OFF (Do Not Disturb)
- [ ] Demo account logged in: `demo@seizn.com`

### Data
- [ ] Demo namespace seeded: `demo:public`
- [ ] Sample traces available (10+)
- [ ] No PII in demo data

### Recording
- [ ] OBS/Loom ready
- [ ] Microphone tested
- [ ] 1080p @ 30fps

---

## Demo Flow (2:00)

### Opening (0:00 - 0:15)

**Screen:** Homepage hero section

**Script:**
> "Seizn is the AI retrieval platform where you can finally debug your search. Let me show you what that means."

**Action:** Click "Try Demo" button

---

### Part 1: The Problem (0:15 - 0:30)

**Screen:** Traditional RAG diagram

**Script:**
> "With LangChain and Pinecone, you get search results... but when they're wrong, you have no idea why. Was it the embedding? The chunking? The reranker? It's a black box."

**Action:** Show black-box search result (no explanation)

---

### Part 2: Seizn Search (0:30 - 1:00)

**Screen:** Demo query interface

**Script:**
> "With Seizn, every query generates a trace. Let me search for 'OAuth 2.0 best practices'..."

**Actions:**
1. Type query in search box
2. Press Enter
3. Show results loading (< 500ms)

**Script:**
> "Here are the results. But watch this..."

**Action:** Click "View Trace" button

---

### Part 3: The Trace (1:00 - 1:30)

**Screen:** Trace detail view

**Script:**
> "This is what makes Seizn different. I can see exactly what happened:
> - 127 candidates retrieved
> - Reranker promoted document #47 from rank 12 to rank 1
> - Final context selected based on these scores
> - Total cost: $0.003, latency: 342ms"

**Actions:**
1. Expand "Candidates" section (show scores)
2. Expand "Rerank Delta" (show before/after)
3. Highlight cost breakdown

---

### Part 4: Share & Debug (1:30 - 1:50)

**Screen:** Share modal

**Script:**
> "When something goes wrong, I can share this trace with my team—no screenshots, no Slack threads. Just one link."

**Actions:**
1. Click "Share Trace" button
2. Copy link
3. Show shared trace view (read-only)

**Script:**
> "And if I need to reproduce the issue, I can replay the exact same query with one click."

---

### Closing (1:50 - 2:00)

**Screen:** Pricing page or signup

**Script:**
> "Seizn works with your existing stack—just swap out your vector search calls. Start free at seizn.com."

**Action:** Show signup page

---

## Backup Talking Points

If demo breaks or extends:

- **On Cost:** "Free tier includes 10K memories and 1K daily queries"
- **On Security:** "SOC 2 Type II in progress, GDPR compliant"
- **On Integration:** "5 lines of code to migrate from Pinecone"

---

## Post-Demo

### Files to Save
- [ ] Recording: `seizn-demo-YYYY-MM-DD.mp4`
- [ ] Thumbnail: `seizn-demo-thumb.png`
- [ ] Transcript: `seizn-demo-transcript.txt`

### Distribution
- [ ] Upload to YouTube (unlisted initially)
- [ ] Embed on `/demo` page
- [ ] Include in pitch deck (slide 8)

---

## Screen Transition Checklist

| # | Screen | Duration | Key Action |
|---|--------|----------|------------|
| 1 | Homepage | 15s | Click "Try Demo" |
| 2 | Problem diagram | 15s | Explain black box |
| 3 | Search input | 15s | Type + Enter |
| 4 | Results | 15s | Click "View Trace" |
| 5 | Trace detail | 30s | Expand sections |
| 6 | Share modal | 20s | Copy link |
| 7 | Signup/Pricing | 10s | CTA |

**Total: 2:00**
