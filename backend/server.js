import 'dotenv/config';
import express from "express";
import { WebSocketServer } from "ws";
import Chat from "./routers/Chat.js";
import { connectDB } from "./config/db.js";

connectDB();

const app = express();
const port = process.env.PORT || 5000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use("/api/chat", Chat);

const server = app.listen(port, () => {
  console.log(`server is working on ${port}`);
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    console.log("data from client %s: ", data);
    ws.send("thanks baby!");
  });
});
