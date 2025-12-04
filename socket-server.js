const express = require("express");
const http = require("http");
const initializeSocket = require("./socket/socket");

require("dotenv").config();

const app = express();
const cors = require("cors");

app.use(express.json());
app.use(cors({ origin: "*" }));

// ⬅️ AGREGÁ ESTO
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// rutas existentes
app.get("/", (req, res) =>
  res.json({ status: "ok", message: "Signaling server" })
);

const server = http.createServer(app);
initializeSocket(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
