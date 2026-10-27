import { useState } from "react";
import axios from "axios";
import "./Chatbot.css";

export default function Chatbot() {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hello! 👋 How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;

    const message = input.trim();

    setMessages((prev) => [
      ...prev,
      { role: "user", text: message },
    ]);

    setInput("");
    try {
      const response = await axios.post("http://localhost:5000/api/chat", { message });

      setMessages((prev) => [
        ...prev,
        { role: "bot", text: response.data.reply },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: error.response?.data?.error || "Error communicating with AI service. Please check backend.",
        },
      ]);
    }
  };

  return (
    <div className="chatbot">
      <div className="chat-header">
        <div className="bot-avatar">🤖</div>
        <div>
          <h2>AI Assistant</h2>
          <p>Online • Ready to help</p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.role}`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          type="text"
          placeholder="Ask me anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />

        <button onClick={handleSend}>
          Send ➤
        </button>
      </div>
    </div>
  );
}
