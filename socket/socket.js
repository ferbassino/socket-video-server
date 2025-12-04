// socket/socket.js
const { Server } = require("socket.io");

module.exports = function initializeSocket(server) {
  const io = new Server(server, {
    cors: { origin: "*" },
    transports: ["websocket"], // Railway soporta websockets
  });

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    socket.on("join-room", ({ roomId, role }) => {
      if (!roomId) return;
      socket.join(roomId);
      socket.data.role = role || "mobile";
      console.log(`${socket.id} joined room ${roomId} as ${socket.data.role}`);

      // avisar a los demás en la sala
      socket
        .to(roomId)
        .emit("peer-joined", { id: socket.id, role: socket.data.role });
    });

    // Mobile -> Viewer : offer
    socket.on("offer", ({ roomId, to, sdp }) => {
      if (to) {
        io.to(to).emit("offer", { from: socket.id, sdp });
      } else {
        socket.to(roomId).emit("offer", { from: socket.id, sdp });
      }
    });

    // Viewer -> Mobile : answer
    socket.on("answer", ({ roomId, to, sdp }) => {
      if (to) {
        io.to(to).emit("answer", { from: socket.id, sdp });
      } else {
        socket.to(roomId).emit("answer", { from: socket.id, sdp });
      }
    });

    // ICE candidate (both ways)
    socket.on("ice-candidate", ({ roomId, to, candidate }) => {
      if (to) {
        io.to(to).emit("ice-candidate", { from: socket.id, candidate });
      } else {
        socket.to(roomId).emit("ice-candidate", { from: socket.id, candidate });
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
      io.emit("peer-left", { id: socket.id });
    });
  });

  console.log("Socket.IO initialized");
  return io;
};
