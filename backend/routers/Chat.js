import express from "express";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required",
      });
    }

    const apiKey = process.env.COMET_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "GROQ_API_KEY is not configured in backend .env",
      });
    }

    const isGroq = apiKey.startsWith("gsk_");
    const apiUrl = process.env.COMET_API_URL || (isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.cometapi.com/v1/chat/completions");
    const model = process.env.COMET_MODEL || (isGroq ? "llama-3.3-70b-versatile" : "auto");

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("AI Provider error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "AI provider request failed",
      });
    }

    res.json({
      reply: data.choices?.[0]?.message?.content ?? "",
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: "Failed to get AI response",
    });
  }
});

export default router;
