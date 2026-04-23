/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { APP_CONFIG, getGatewayConfig, getPublicConfig } from "./config";
import { ApiErrorPayload, Env, ChatMessage } from "./types";

export default {
  /**
   * Main request handler for the Worker
   */
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle static assets (frontend)
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // API Routes
    if (url.pathname === "/api/config") {
      if (request.method === "GET") {
        return Response.json(getPublicConfig(), {
          headers: getResponseHeaders(),
        });
      }

      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/chat") {
      // Handle POST requests for chat
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }

      // Method not allowed for other request types
      return new Response("Method not allowed", { status: 405 });
    }

    // Handle 404 for unmatched routes
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const gateway = getGatewayConfig();
  const modelId = APP_CONFIG.modelId as keyof AiModels;
  const mode = gateway ? "gateway" : "direct";
  const responseHeaders = getResponseHeaders();

  try {
    // Parse JSON request body
    const { messages = [], blockedUserContents = [] } =
      (await request.json()) as {
        messages: ChatMessage[];
        blockedUserContents?: string[];
      };
    const sanitizedMessages = shapeRequestMessages(
      sanitizeMessages(messages, blockedUserContents),
    );

    if (!sanitizedMessages.some((msg) => msg.role === "user")) {
      return jsonError(
        {
          error: {
            code: "bad_request",
            message: "Please enter a message before sending the request.",
            retryable: false,
            phase: null,
          },
          meta: {
            mode,
            modelId: APP_CONFIG.modelId,
            gatewayId: gateway?.id ?? null,
          },
        },
        400,
      );
    }

    // Add system prompt if not present
    if (!sanitizedMessages.some((msg) => msg.role === "system")) {
      sanitizedMessages.unshift({
        role: "system",
        content: APP_CONFIG.systemPrompt,
      });
    }

    const stream = await env.AI.run(
      modelId,
      {
        messages: sanitizedMessages,
        max_tokens: APP_CONFIG.maxTokens,
        stream: true,
      },
      gateway ? { gateway } : undefined,
    );

    return new Response(stream, {
      headers: {
        ...responseHeaders,
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error processing chat request:", error);
    const normalizedError = normalizeError(error, gateway?.id ?? null);
    return jsonError(
      normalizedError,
      getErrorStatus(normalizedError.error.code),
    );
  }
}

function sanitizeMessages(
  messages: ChatMessage[],
  blockedUserContents: string[] = [],
): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const blockedContentSet = new Set(
    blockedUserContents
      .filter((content): content is string => typeof content === "string")
      .map((content) => content.trim())
      .filter((content) => content.length > 0),
  );

  return messages
    .filter((message): message is ChatMessage => {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (!["system", "user", "assistant"].includes(message.role)) {
        return false;
      }

      return typeof message.content === "string";
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter(
      (message) =>
        !(message.role === "user" && blockedContentSet.has(message.content)),
    )
    .filter((message) => message.content.length > 0)
    .slice(-24);
}

function shapeRequestMessages(messages: ChatMessage[]) {
  if (APP_CONFIG.requestContext !== "latest") {
    return messages;
  }

  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return latestUserMessage ? [latestUserMessage] : [];
}

function getResponseHeaders() {
  const gateway = getGatewayConfig();

  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-chatbot-mode": gateway ? "gateway" : "direct",
    "x-chatbot-model": APP_CONFIG.modelId,
    "x-chatbot-gateway": gateway?.id ?? "",
  };
}

function jsonError(payload: ApiErrorPayload, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: getResponseHeaders(),
  });
}

function normalizeError(
  error: unknown,
  gatewayId: string | null,
): ApiErrorPayload {
  const rawMessage = getErrorMessage(error);
  const rawCode = getErrorCode(error);
  const upstreamError = getUpstreamGatewayError(error);
  const upstreamCode =
    typeof upstreamError.code === "number"
      ? String(upstreamError.code)
      : typeof upstreamError.code === "string"
        ? upstreamError.code
        : "";
  const upstreamMessage =
    typeof upstreamError.message === "string" ? upstreamError.message : "";
  const haystack =
    `${rawCode} ${rawMessage} ${upstreamCode} ${upstreamMessage}`.toLowerCase();
  const mode = gatewayId ? "gateway" : "direct";
  const isPromptBlocked =
    upstreamCode === "2016" ||
    (haystack.includes("guardrail") && haystack.includes("prompt")) ||
    haystack.includes("prompt blocked due to security configurations") ||
    (haystack.includes("security") &&
      haystack.includes("prompt blocked") &&
      haystack.includes("configuration"));
  const isResponseBlocked =
    upstreamCode === "2017" ||
    (haystack.includes("guardrail") &&
      (haystack.includes("response") || haystack.includes("output"))) ||
    haystack.includes("response blocked due to security configurations") ||
    haystack.includes("output blocked due to security configurations");

  if (isPromptBlocked) {
    return {
      error: {
        code: "guardrail_prompt_blocked",
        message:
          "Your message was blocked by AI Gateway Guardrails before it reached the model.",
        retryable: false,
        phase: "prompt",
      },
      meta: {
        mode,
        modelId: APP_CONFIG.modelId,
        gatewayId,
      },
    };
  }

  if (isResponseBlocked) {
    return {
      error: {
        code: "guardrail_response_blocked",
        message:
          "The model response was blocked by AI Gateway Guardrails before it could be displayed.",
        retryable: false,
        phase: "response",
      },
      meta: {
        mode,
        modelId: APP_CONFIG.modelId,
        gatewayId,
      },
    };
  }

  if (
    gatewayId &&
    (haystack.includes("gateway") ||
      haystack.includes("authentication") ||
      haystack.includes("unauthorized") ||
      haystack.includes("forbidden") ||
      haystack.includes("invalid url"))
  ) {
    return {
      error: {
        code: "gateway_error",
        message:
          "The request could not be completed through AI Gateway. Check the configured gateway name and settings.",
        retryable: true,
        phase: null,
      },
      meta: {
        mode,
        modelId: APP_CONFIG.modelId,
        gatewayId,
      },
    };
  }

  return {
    error: {
      code: "ai_error",
      message:
        "The assistant could not generate a response right now. Please try again in a moment.",
      retryable: true,
      phase: null,
    },
    meta: {
      mode,
      modelId: APP_CONFIG.modelId,
      gatewayId,
    },
  };
}

function getErrorStatus(code: ApiErrorPayload["error"]["code"]) {
  switch (code) {
    case "bad_request":
      return 400;
    case "guardrail_prompt_blocked":
    case "guardrail_response_blocked":
      return 403;
    case "gateway_error":
      return 502;
    default:
      return 500;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

function getErrorCode(error: unknown) {
  if (isRecord(error) && typeof error.code === "string") {
    return error.code;
  }

  if (isRecord(error) && typeof error.code === "number") {
    return String(error.code);
  }

  return "";
}

function getUpstreamGatewayError(error: unknown) {
  const message = getErrorMessage(error);
  const jsonMatch = message.match(/\{.*\}/s);

  if (!jsonMatch) {
    return { code: null, message: null };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (
      isRecord(parsed) &&
      Array.isArray(parsed.error) &&
      parsed.error.length > 0
    ) {
      const firstError = parsed.error[0];

      if (isRecord(firstError)) {
        return {
          code:
            typeof firstError.code === "number" ||
            typeof firstError.code === "string"
              ? firstError.code
              : null,
          message:
            typeof firstError.message === "string" ? firstError.message : null,
        };
      }
    }
  } catch {
    return { code: null, message: null };
  }

  return { code: null, message: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
