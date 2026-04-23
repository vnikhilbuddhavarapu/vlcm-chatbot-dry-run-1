/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
  /**
   * Binding for the Workers AI API.
   */
  AI: Ai;

  /**
   * Binding for static assets.
   */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ChatMode = "direct" | "gateway" | "waf";

export type RequestContextMode = "history" | "latest";

export type ApiErrorCode =
  | "bad_request"
  | "pii_blocked"
  | "prompt_injection_blocked"
  | "unsafe_topic_blocked"
  | "guardrail_prompt_blocked"
  | "guardrail_response_blocked"
  | "gateway_error"
  | "ai_error";

export interface PublicAppConfig {
  title: string;
  subtitle: string;
  greeting: string;
  composerPlaceholder: string;
  modelId: string;
  requestContext: RequestContextMode;
  mode: ChatMode;
  gatewayConfigured: boolean;
  gatewayId: string | null;
}

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    phase: "prompt" | "response" | null;
  };
  meta: {
    mode: ChatMode;
    modelId: string;
    gatewayId: string | null;
  };
}
