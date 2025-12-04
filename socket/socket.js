// socket/socket.js
const { Server } = require("socket.io");

module.exports = function initializeSocket(server) {
  const io = new Server(server, {
    cors: { origin: "*" },
    transports: ["websocket"],
  });

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    socket.on("join-room", ({ roomId, role }) => {
      if (!roomId) return;
      socket.join(roomId);
      socket.data.role = role;

      console.log(`${socket.id} joined room ${roomId} as ${role}`);

      // 🔥 SI entra un móvil → avisamos a los viewers
      if (role === "sender") {
        socket.to(roomId).emit("peer-joined", {
          id: socket.id,
          role: "sender",
        });
      }

      // 🔥 SI entra un viewer → avisamos al móvil
      if (role === "viewer") {
        socket.to(roomId).emit("viewer-ready", {
          viewerId: socket.id,
        });
      }
    });

    // Mobile -> Viewer : OFFER
    socket.on("offer", ({ roomId, to, sdp }) => {
      io.to(to).emit("offer", { from: socket.id, sdp });
    });

    // Viewer -> Mobile : ANSWER
    socket.on("answer", ({ roomId, to, sdp }) => {
      io.to(to).emit("answer", { from: socket.id, sdp });
    });

    // ICE intercambiado
    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    socket.on("disconnect", () => {
      io.emit("peer-left", { id: socket.id });
      console.log("❌ Disconnected:", socket.id);
    });
  });

  console.log("Socket.IO initialized");
  return io;
};
