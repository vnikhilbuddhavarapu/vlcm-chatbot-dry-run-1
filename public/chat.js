/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const appTitle = document.getElementById("app-title");
const appSubtitle = document.getElementById("app-subtitle");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const statusBanner = document.getElementById("status-banner");
const statusTitle = document.getElementById("status-title");
const statusMessage = document.getElementById("status-message");
const statusDismiss = document.getElementById("status-dismiss");

// Chat state
let appConfig = {
	title: "Chatbot",
	subtitle: "Ask anything.",
	greeting: "Hi! How can I help you today?",
	composerPlaceholder: "Type a message…",
	modelId: "@cf/moonshotai/kimi-k2.5",
	requestContext: "latest",
	mode: "direct",
	gatewayConfigured: false,
	gatewayId: null,
};
let chatHistory = [];
const blockedUserContents = [];
let isProcessing = false;

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);
statusDismiss.addEventListener("click", hideStatus);

initialize();

async function initialize() {
	applyConfig(appConfig);
	addMessageToChat("assistant", appConfig.greeting, { persist: false });

	try {
		const response = await fetch("/api/config");

		if (!response.ok) {
			throw new Error("Failed to load app configuration");
		}

		const config = await response.json();
		appConfig = {
			...appConfig,
			...config,
		};
		applyConfig(appConfig);
		chatMessages.innerHTML = "";
		chatHistory = [];
		addMessageToChat("assistant", appConfig.greeting, { persist: false });
	} catch (error) {
		console.error("Failed to load config:", error);
		showStatus({
			tone: "warning",
			title: "Temporary setup issue",
			message:
				"The chat loaded with its built-in defaults because configuration could not be fetched.",
		});
	}
}

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
	const message = userInput.value.trim();

	// Don't send empty messages
	if (message === "" || isProcessing) return;

	// Disable input while processing
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Clear input
	userInput.value = "";
	userInput.style.height = "auto";

	// Show typing indicator
	typingIndicator.classList.add("visible");
	hideStatus();

	addMessageToChat("user", message, { persist: false });
	const requestMessages = getRequestMessages(message);

	try {
		// Create new assistant response element
		const assistantMessage = addMessageToChat("assistant", "", { persist: false });
		assistantMessage.textEl.classList.add("empty");

		// Scroll to bottom
		scrollChatToBottom();

		// Send request to API
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: requestMessages,
				blockedUserContents,
			}),
		});
		updateModeFromHeaders(response.headers);

		// Handle errors
		if (!response.ok) {
			const payload = await parseApiError(response);
			assistantMessage.rowEl.remove();
			handleApiError(payload, message);
			return;
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		// Process streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let buffer = "";
		const flushAssistantText = () => {
			assistantMessage.textEl.textContent = responseText;
			assistantMessage.textEl.classList.toggle("empty", responseText.length === 0);
			scrollChatToBottom();
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				// Process any remaining complete events in buffer
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					if (data === "[DONE]") {
						break;
					}
					try {
						const jsonData = JSON.parse(data);
						// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
						let content = "";
						if (
							typeof jsonData.response === "string" &&
							jsonData.response.length > 0
						) {
							content = jsonData.response;
						} else if (jsonData.choices?.[0]?.delta?.content) {
							content = jsonData.choices[0].delta.content;
						}
						if (content) {
							responseText += content;
							flushAssistantText();
						}
					} catch (e) {
						console.error("Error parsing SSE data as JSON:", e, data);
					}
				}
				break;
			}

			// Decode chunk
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}
				try {
					const jsonData = JSON.parse(data);
					// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
					let content = "";
					if (
						typeof jsonData.response === "string" &&
						jsonData.response.length > 0
					) {
						content = jsonData.response;
					} else if (jsonData.choices?.[0]?.delta?.content) {
						content = jsonData.choices[0].delta.content;
					}
					if (content) {
						responseText += content;
						flushAssistantText();
					}
				} catch (e) {
					console.error("Error parsing SSE data as JSON:", e, data);
				}
			}
			if (sawDone) {
				break;
			}
		}

		// Add completed response to chat history
		if (responseText.length > 0) {
			chatHistory.push({ role: "user", content: message });
			chatHistory.push({ role: "assistant", content: responseText });
			assistantMessage.textEl.classList.remove("empty");
		} else {
			assistantMessage.rowEl.remove();
			addMessageToChat(
				"notice",
				"The assistant finished without returning visible text.",
				{ persist: false, tone: "danger" },
			);
		}
	} catch (error) {
		console.error("Error:", error);
		showStatus({
			tone: "danger",
			title: "Request failed",
			message:
				"The assistant could not complete your request right now. Please try again in a moment.",
		});
		addMessageToChat(
			"notice",
			"The assistant could not complete your request right now. Please try again in a moment.",
			{ persist: false },
		);
	} finally {
		// Hide typing indicator
		typingIndicator.classList.remove("visible");

		// Re-enable input
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content, options = {}) {
	const persist = options.persist ?? false;
	const tone = options.tone ?? "neutral";
	const rowEl = document.createElement("div");
	rowEl.className = `message-row ${role}`;
	if (role === "notice") {
		rowEl.dataset.tone = tone;
	}

	if (role !== "notice") {
		const avatarEl = document.createElement("div");
		avatarEl.className = "message-avatar";
		avatarEl.textContent = role === "user" ? "YOU" : "AI";
		rowEl.appendChild(avatarEl);
	}

	const cardEl = document.createElement("div");
	cardEl.className = "message-card";

	const metaEl = document.createElement("div");
	metaEl.className = "message-meta";

	const labelEl = document.createElement("span");
	labelEl.textContent =
		role === "user"
			? "You"
			: role === "assistant"
				? "Assistant"
				: "Status";

	const timestampEl = document.createElement("span");
	timestampEl.textContent = new Date().toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});

	metaEl.append(labelEl, timestampEl);

	const textEl = document.createElement("div");
	textEl.className = "message-text";
	textEl.textContent = content;

	cardEl.append(metaEl, textEl);
	rowEl.appendChild(cardEl);
	chatMessages.appendChild(rowEl);

	if (persist && (role === "user" || role === "assistant")) {
		chatHistory.push({ role, content });
	}

	scrollChatToBottom();

	return { rowEl, cardEl, textEl };
}

function getRequestMessages(message) {
	if (appConfig.requestContext === "latest") {
		return [{ role: "user", content: message }];
	}

	return [...getRequestHistory(), { role: "user", content: message }];
}

function getRequestHistory() {
	return chatHistory.filter(
		(entry) =>
			!(
				entry.role === "user" &&
				blockedUserContents.includes(entry.content)
			),
	);
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}

function applyConfig(config) {
	appTitle.textContent = config.title;
	appSubtitle.textContent = config.subtitle;
	userInput.placeholder = config.composerPlaceholder;
}

function updateModeFromHeaders(headers) {
	const mode = headers.get("x-chatbot-mode");
	const gatewayId = headers.get("x-chatbot-gateway") || null;

	if (mode === "direct" || mode === "gateway") {
		appConfig.mode = mode;
		appConfig.gatewayId = gatewayId || null;
	}
}

function showStatus({ tone, title, message }) {
	statusBanner.dataset.tone = tone;
	statusTitle.textContent = title;
	statusMessage.textContent = message;
	statusBanner.hidden = false;
}

function hideStatus() {
	statusBanner.hidden = true;
	statusBanner.dataset.tone = "";
	statusTitle.textContent = "";
	statusMessage.textContent = "";
}

async function parseApiError(response) {
	try {
		const payload = await response.json();
		if (payload && payload.error) {
			return payload;
		}
	} catch (error) {
		console.error("Failed to parse API error payload:", error);
	}

	return {
		error: {
			code: "ai_error",
			message: "The assistant could not complete the request.",
			retryable: true,
			phase: null,
		},
		meta: {
			mode: appConfig.mode,
			modelId: appConfig.modelId,
			gatewayId: appConfig.gatewayId,
		},
	};
}

function handleApiError(payload, userMessage) {
	const code = payload?.error?.code;
	const mode = payload?.meta?.mode || appConfig.mode;
	const gatewayId = payload?.meta?.gatewayId || appConfig.gatewayId;

	if (mode === "direct" || mode === "gateway" || mode === "waf") {
		appConfig.mode = mode;
		appConfig.gatewayId = gatewayId || null;
	}

	switch (code) {
		case "pii_blocked":
			hideStatus();
			addMessageToChat(
				"notice",
				payload?.error?.message ||
					"This message was blocked because it may contain sensitive personal information.",
				{ persist: false, tone: "danger" },
			);
			break;
		case "prompt_injection_blocked":
			rememberBlockedUser(userMessage);
			hideStatus();
			addMessageToChat(
				"notice",
				payload?.error?.message ||
					"This message was blocked because it looks like a prompt injection attempt.",
				{ persist: false, tone: "danger" },
			);
			break;
		case "unsafe_topic_blocked":
			hideStatus();
			addMessageToChat(
				"notice",
				payload?.error?.message ||
					"This message was blocked because it matches an unsafe topic policy.",
				{ persist: false, tone: "danger" },
			);
			break;
		case "guardrail_prompt_blocked":
			rememberBlockedUser(userMessage);
			hideStatus();
			addMessageToChat(
				"notice",
				"This message was blocked by the chat's safety settings.",
				{ persist: false, tone: "danger" },
			);
			break;
		case "guardrail_response_blocked":
			hideStatus();
			addMessageToChat(
				"notice",
				"The response was blocked by the chat's safety settings.",
				{ persist: false, tone: "danger" },
			);
			break;
		case "gateway_error":
			showStatus({
				tone: "danger",
				title: "Connection issue",
				message:
					"The chat could not complete this request right now. Please try again.",
			});
			addMessageToChat(
				"notice",
				"The chat could not complete this request right now. Please try again.",
				{ persist: false, tone: "danger" },
			);
			break;
		default:
			showStatus({
				tone: "danger",
				title: "Assistant unavailable",
				message:
					payload.error.message ||
					"The assistant could not complete your request right now. Please try again shortly.",
			});
			addMessageToChat(
				"notice",
				payload.error.message ||
					"The assistant could not complete your request right now. Please try again shortly.",
				{ persist: false, tone: "danger" },
			);
	}
}

function rememberBlockedUser(text) {
	if (!text || blockedUserContents.includes(text)) {
		return;
	}

	blockedUserContents.push(text);

	if (blockedUserContents.length > 20) {
		blockedUserContents.shift();
	}
}

function scrollChatToBottom() {
	chatMessages.scrollTo({
		top: chatMessages.scrollHeight,
		behavior: "smooth",
	});
}
