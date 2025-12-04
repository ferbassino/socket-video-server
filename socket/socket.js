const { Server } = require("socket.io");

module.exports = function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log(`🔌 [SERVER] Nuevo socket: ${socket.id}`);

    socket.on("join-room", ({ roomId, role }) => {
      if (!roomId) {
        console.log(`❌ [SERVER] ${socket.id} sin roomId`);
        return;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.role = role;

      console.log(`📍 [SERVER] ${socket.id} → room ${roomId} como ${role}`);

      // Obtener todos los sockets en la sala
      const room = io.sockets.adapter.rooms.get(roomId);
      const clientsInRoom = room ? Array.from(room) : [];
      const otherClients = clientsInRoom.filter((id) => id !== socket.id);

      console.log(`👥 [SERVER] Otros en ${roomId}: ${otherClients.length}`);

      // ===== LÓGICA MEJORADA =====
      if (role === "sender") {
        // MÓVIL
        console.log(`📱 [SERVER] Móvil ${socket.id} conectado`);

        // 1. Notificar a TODOS los VIEWERS en la sala
        otherClients.forEach((otherId) => {
          const otherSocket = io.sockets.sockets.get(otherId);
          if (otherSocket && otherSocket.data.role === "viewer") {
            console.log(
              `🔔 [SERVER] Notificando viewer ${otherId} sobre nuevo móvil`
            );
            otherSocket.emit("sender-connected", {
              senderId: socket.id,
              timestamp: new Date().toISOString(),
            });
          }
        });

        // 2. Si hay VIEWERS ya conectados, también notificar al móvil sobre ellos
        // (Para que el móvil pueda iniciar WebRTC inmediatamente)
        const existingViewers = otherClients.filter((id) => {
          const s = io.sockets.sockets.get(id);
          return s && s.data.role === "viewer";
        });

        if (existingViewers.length > 0) {
          console.log(
            `📡 [SERVER] Hay ${existingViewers.length} viewer(s) esperando`
          );
          // Notificar al móvil sobre el PRIMER viewer (para simplificar)
          socket.emit("viewer-connected", {
            viewerId: existingViewers[0],
            timestamp: new Date().toISOString(),
          });
        }
      } else if (role === "viewer") {
        // PC/VIEWER
        console.log(`🖥️ [SERVER] Viewer ${socket.id} conectado`);

        // 1. Notificar a TODOS los SENDERS en la sala
        otherClients.forEach((otherId) => {
          const otherSocket = io.sockets.sockets.get(otherId);
          if (otherSocket && otherSocket.data.role === "sender") {
            console.log(
              `🔔 [SERVER] Notificando móvil ${otherId} sobre nuevo viewer`
            );
            otherSocket.emit("viewer-connected", {
              viewerId: socket.id,
              timestamp: new Date().toISOString(),
            });
          }
        });

        // 2. Si hay SENDERS ya conectados, también notificar al viewer
        const existingSenders = otherClients.filter((id) => {
          const s = io.sockets.sockets.get(id);
          return s && s.data.role === "sender";
        });

        if (existingSenders.length > 0) {
          console.log(
            `📱 [SERVER] Hay ${existingSenders.length} móvil(es) esperando`
          );
          // Notificar al viewer sobre el PRIMER sender
          socket.emit("sender-connected", {
            senderId: existingSenders[0],
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // WebRTC Signaling
    socket.on("offer", ({ to, sdp }) => {
      console.log(`📤 [SERVER] OFFER: ${socket.id} → ${to}`);
      io.to(to).emit("offer", {
        from: socket.id,
        sdp,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("answer", ({ to, sdp }) => {
      console.log(`📥 [SERVER] ANSWER: ${socket.id} → ${to}`);
      io.to(to).emit("answer", {
        from: socket.id,
        sdp,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      console.log(`🧊 [SERVER] ICE: ${socket.id} → ${to}`);
      io.to(to).emit("ice-candidate", {
        from: socket.id,
        candidate,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `❌ [SERVER] Desconectado: ${socket.id} (${
          socket.data.role || "unknown"
        }) - ${reason}`
      );

      if (socket.data.roomId) {
        // Notificar a otros en la sala
        socket.to(socket.data.roomId).emit("peer-disconnected", {
          peerId: socket.id,
          role: socket.data.role,
          reason: reason,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Heartbeat para mantener conexión activa
    socket.on("ping", () => {
      socket.emit("pong", {
        timestamp: new Date().toISOString(),
        serverTime: Date.now(),
      });
    });

    // Log de errores
    socket.on("error", (error) => {
      console.error(`⚠️ [SERVER] Error en socket ${socket.id}:`, error);
    });
  });

  console.log("✅ Socket.IO server inicializado y listo");
  return io;
};
