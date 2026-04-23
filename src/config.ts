export const APP_CONFIG = {
  title: "Chatbot",
  subtitle: "Ask anything.",
  greeting: "Hi! How can I help you today?",
  composerPlaceholder: "Type a message…",
  modelId: "@cf/zai-org/glm-4.7-flash",
  requestContext: "latest",
  systemPrompt:
    "You are a helpful, concise, and trustworthy assistant. Provide accurate answers, keep the tone warm, friendly, and professional, and say clearly when you are uncertain.",
  maxTokens: 4096,
  gateway: {
    id: "",
    skipCache: false,
    cacheTtl: 3600,
  },
} as const;

export function getGatewayConfig() {
  const gatewayId = APP_CONFIG.gateway.id.trim();

  if (!gatewayId) {
    return null;
  }

  return {
    id: gatewayId,
    skipCache: APP_CONFIG.gateway.skipCache,
    cacheTtl: APP_CONFIG.gateway.cacheTtl,
  };
}

export function getPublicConfig() {
  const gateway = getGatewayConfig();

  return {
    title: APP_CONFIG.title,
    subtitle: APP_CONFIG.subtitle,
    greeting: APP_CONFIG.greeting,
    composerPlaceholder: APP_CONFIG.composerPlaceholder,
    modelId: APP_CONFIG.modelId,
    requestContext: APP_CONFIG.requestContext,
    mode: gateway ? "gateway" : "direct",
    gatewayConfigured: Boolean(gateway),
    gatewayId: gateway?.id ?? null,
  };
}
