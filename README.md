# Chatbot Template

A simple, ready-to-deploy chatbot template powered by Cloudflare Workers AI. It ships with a clean chat UI, streaming responses, a default `@cf/moonshotai/kimi-k2.5` model configuration, and optional AI Gateway support for observability and guardrails.

Before publishing, update the deploy button above so it points to your GitHub repository.

<!-- dash-content-start -->

## Demo

This template demonstrates how to build a modern AI chatbot on Cloudflare Workers with optional AI Gateway integration. It features:

- Real-time streaming of AI responses using Server-Sent Events (SSE)
- Configuration-driven model and system prompt setup
- Optional AI Gateway routing for logs, observability, and guardrails
- Friendly in-chat error states for blocked prompts and failed requests
- Clean, responsive UI that works on mobile and desktop

## Features

- 💬 Minimal full-height chat interface with smooth scrolling
- ⚡ Server-Sent Events (SSE) for streaming responses
- 🧠 Powered by Cloudflare Workers AI
- 🧪 Default model set to `@cf/moonshotai/kimi-k2.5`
- 🛠️ Built with TypeScript and Cloudflare Workers
- 📱 Mobile-friendly design
- 🔄 Preserves safe chat history while pruning blocked prompt text
- 🔎 Optional AI Gateway observability and guardrails
<!-- dash-content-end -->

## Getting Started

### One-Click Deploy

Click the button below to deploy this template to Cloudflare Workers with a single click:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acme-studios-01/vlcm-chatbot)

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A Cloudflare account with Workers AI access

### Installation

1. Clone this repository:

   ```bash
   git clone <your-repo-url>
   cd <your-repo-folder>
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Generate Worker type definitions:
   ```bash
   npm run cf-typegen
   ```

### Development

Start a local development server:

```bash
npm run dev
```

This will start a local server at http://localhost:8787.

Note: Using Workers AI accesses your Cloudflare account even during local development, which will incur usage charges.

### Validation

Run the project validation checks:

```bash
npm run check
```

This runs TypeScript validation and a Wrangler deploy dry-run.

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

### Monitor

View real-time logs associated with any deployed Worker:

```bash
npm wrangler tail
```

## Project Structure

```
/
├── public/             # Static assets
│   ├── index.html      # Chat UI HTML
│   └── chat.js         # Chat UI frontend script
├── src/
│   ├── config.ts       # App copy, model, prompt, and optional gateway config
│   ├── index.ts        # Main Worker entry point
│   └── types.ts        # TypeScript type definitions
├── test/               # Test files
├── wrangler.jsonc      # Cloudflare Worker configuration
├── tsconfig.json       # TypeScript configuration
└── README.md           # This documentation
```

## How It Works

### Backend

The backend is built with Cloudflare Workers and uses the Workers AI platform to generate responses. The main components are:

1. **Config Endpoint** (`/api/config`): Exposes public app configuration to the frontend
2. **Chat Endpoint** (`/api/chat`): Accepts POST requests with chat messages and streams responses
3. **Streaming**: Uses Server-Sent Events (SSE) for real-time streaming of AI responses
4. **Workers AI Binding**: Connects to Cloudflare's AI service via the Workers AI binding
5. **Structured Error Handling**: Distinguishes between blocked prompts, blocked responses, gateway failures, and generic AI errors

### Frontend

The frontend is a simple HTML/CSS/JavaScript application that:

1. Presents a chat interface
2. Sends user messages to the API
3. Processes streaming responses in real-time
4. Preserves safe conversation history between turns
5. Excludes previously blocked prompt text from future requests for more stable prompt-block handling
6. Shows inline status messages for blocked prompts and failed requests, including custom JSON responses returned by edge security rules

## Customization

### Changing the Model

To use a different AI model, update `modelId` in `src/config.ts`. You can find available models in the [Cloudflare Workers AI documentation](https://developers.cloudflare.com/workers-ai/models/).

### Using AI Gateway

AI Gateway is optional. If a gateway ID is configured, requests will be routed through AI Gateway before reaching Workers AI.

In this app, AI Gateway is primarily used for observability, logging, and request tracing. Edge blocking for prompt injection, PII, and unsafe topics is handled separately with Cloudflare AI Security for Apps.

To enable AI Gateway:

1. [Create an AI Gateway](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway) in your Cloudflare dashboard
2. Open `src/config.ts`
3. Set `gateway.id` to your actual AI Gateway name
4. Configure other gateway options as needed:
   - `skipCache`: Set to `true` to bypass gateway caching
   - `cacheTtl`: Set the cache time-to-live in seconds
5. Redeploy the Worker

To disable AI Gateway, set `gateway.id` back to an empty string and redeploy.

### Using AI Security for Apps

This app is designed to work with Cloudflare AI Security for Apps to block risky prompts at the edge before they reach the Worker.

You can use it to block:

- PII in prompts
- Unsafe topics
- Prompt injection attempts

When WAF custom rules return JSON error payloads, the frontend parses those responses and renders inline chat status messages for the blocked category.

Relevant docs:

- [AI Security for Apps overview](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/)
- [AI Security for Apps fields](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/fields/)
- [PII detection](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/pii-detection/)
- [Prompt injection detection](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/prompt-injection/)
- [Unsafe and custom topic detection](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/unsafe-topics/)

### Modifying the System Prompt

The default system prompt can be changed by updating `systemPrompt` in `src/config.ts`.

### Styling

The UI styling is contained in the `<style>` section of `public/index.html`. You can modify the CSS variables at the top to quickly change the look and feel.

## Testing Checklist

Before pushing or demoing, verify the following:

1. `npm run dev` starts correctly
2. Normal prompts stream correctly in the chat UI
3. If AI Gateway is enabled, requests appear in AI Gateway logs
4. If AI Security for Apps rules are enabled, blocked prompts show an inline status message instead of a generic crash
5. Harmless follow-up prompts continue to work after a blocked turn

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare AI Gateway Documentation](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare AI Security for Apps Documentation](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/)
- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
