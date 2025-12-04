// index.js
const express = require("express");
const http = require("http");
const initializeSocket = require("./socket/socket");

require("dotenv").config();

const app = express();
const cors = require("cors");

// middlewares básicos
app.use(express.json());
app.use(cors({ origin: "*" }));

// rutas existentes (mantén las tuyas)
app.get("/", (req, res) =>
  res.json({ status: "ok", message: "Signaling server" })
);

// crea servidor HTTP y arranca socket.io
const server = http.createServer(app);
initializeSocket(server);

// puerto (Railway provee process.env.PORT)
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
