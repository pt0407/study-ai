# 🧠 Study AI

An unlimited AI-powered study tool built with [Groq](https://groq.com) — blazing fast LLM inference, completely free.

## Features

- 💬 **AI Tutor** — Chat with an AI across any subject, with streaming responses
- 📚 **Flashcard Generator** — Paste notes → auto-generate flip cards with ratings
- 📝 **Quiz Generator** — Auto-generate multiple-choice quizzes with explanations
- 📋 **Summarizer** — Concise summaries, bullet points, detailed notes, or ELI5
- 📅 **Study Plan** — Personalized multi-week study schedules

## How to Deploy to GitHub Pages

### 1. Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `study-ai` (or anything you like)
3. Set it to **Public**
4. Click **Create repository**

### 2. Push the Files

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/study-ai.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Choose **main** branch, **/ (root)** folder
4. Click **Save**

Your site will be live at: `https://YOUR_USERNAME.github.io/study-ai`

## Getting Your Free Groq API Key

1. Visit [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Go to **API Keys** → **Create API Key**
4. Copy the key (starts with `gsk_`)

Your API key is stored **only in your browser's localStorage** — it is never sent to any external server other than Groq directly.

## Available Models

| Model | Speed | Best For |
|-------|-------|----------|
| Llama 3.3 70B | Fast | Best quality responses |
| Llama 3.1 8B | Fastest | Quick Q&A |
| DeepSeek R1 70B | Fast | Reasoning & math |
| Mixtral 8x7B | Fast | General purpose |
| Gemma 2 9B | Fast | Lightweight use |

## Privacy

- API keys are stored in `localStorage` only
- No backend server — all requests go directly from your browser to Groq
- No data is collected or stored anywhere
