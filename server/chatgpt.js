import express from 'express';

function normalizeMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null;
  }

  const rawRole = typeof message.role === 'string' ? message.role.trim().toLowerCase() : '';
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  const role = rawRole === 'system' ? 'developer' : rawRole;

  if (!role || !content) {
    return null;
  }

  return { role, content };
}

function buildOpenAiInput(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: [
      {
        type: 'input_text',
        text: message.content
      }
    ]
  }));
}

function createHttpError(statusCode, message, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

export async function createChatGptResponse({ model, messages, userId }) {
  const normalizedMessages = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];

  if (normalizedMessages.length === 0) {
    throw createHttpError(400, 'At least one message is required.');
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw createHttpError(
      500,
      'Missing OPENAI_API_KEY. Add it to the server environment before using /api/chatgpt.'
    );
  }

  const selectedModel =
    typeof model === 'string' && model.trim()
      ? model.trim()
      : process.env.OPENAI_MODEL || 'gpt-5.2';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: selectedModel,
      input: buildOpenAiInput(normalizedMessages),
      text: {
        format: {
          type: 'text'
        }
      }
    })
  });

  const requestId = response.headers.get('x-request-id');
  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage =
      raw?.error?.message || `OpenAI API request failed with status ${response.status}.`;

    throw createHttpError(response.status, apiMessage, {
      requestId,
      providerError: raw?.error || null
    });
  }

  return {
    ok: true,
    provider: 'chatgpt',
    model: raw?.model || selectedModel,
    userId,
    receivedMessages: normalizedMessages,
    responseId: raw?.id || null,
    requestId,
    reply: typeof raw?.output_text === 'string' ? raw.output_text : '',
    raw
  };
}

export function createChatGptRouter() {
  const router = express.Router();

  router.post('/', async (req, res) => {
    try {
      const response = await createChatGptResponse({
        model: req.body?.model,
        messages: req.body?.messages,
        userId: req.auth?.userId ?? null
      });

      res.status(200).json(response);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;

      if (statusCode >= 500) {
        console.error('ChatGPT request failed:', error);
      }

      res.status(statusCode).json({
        error: error.message || 'Failed to create ChatGPT response.',
        requestId: error.requestId || null,
        providerError: error.providerError || null
      });
    }
  });

  return router;
}
