// socket-video-server/server/socket-server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// Configuración
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://localhost:5173", // ← AÑADE ESTA LÍNEA (HTTPS)
  "http://localhost:5174", // ← También para posibles otros puertos
  "https://localhost:5174",
  "http://localhost:3000",
  "https://localhost:3000",
  "https://*.vercel.app",
  "https://*.onrender.com",
  "https://*.up.railway.app",
  "https://socket-video-server-production.up.railway.app",
  "https://socket-video-server.up.railway.app",
  "https://tu-frontend-en-railway.app", // ← Si tu frontend también está en Railway
];
// Crear app Express
const app = express();
app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (como mobile apps o curl)
      if (!origin) return callback(null, true);

      // Verificar si el origin está en la lista permitida
      if (
        ALLOWED_ORIGINS.some((allowed) => {
          if (allowed.includes("*")) {
            return origin.endsWith(allowed.replace("*.", ""));
          }
          return origin === allowed;
        })
      ) {
        return callback(null, true);
      }

      console.log("❌ CORS bloqueado para origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" })); // Para imágenes base64 grandes

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar Socket.io
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (
        ALLOWED_ORIGINS.some((allowed) => {
          if (allowed.includes("*")) {
            return origin.endsWith(allowed.replace("*.", ""));
          }
          return origin === allowed;
        })
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// ==================== VARIABLES GLOBALES ====================
const sessions = new Map(); // Almacena las sesiones activas

// ==================== ENDPOINTS REST ====================
app.get("/", (req, res) => {
  res.json({
    service: "Video Streaming Socket Server",
    status: "online",
    version: "1.0.0",
    endpoints: {
      createSession: "POST /api/session",
      getSession: "GET /api/session/:id",
      health: "GET /health",
      stats: "GET /stats",
    },
    sessions: sessions.size,
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sessions: sessions.size,
  });
});

// Estadísticas
app.get("/stats", (req, res) => {
  const stats = {
    totalSessions: sessions.size,
    sessions: [],
    activeMobiles: 0,
    activeViewers: 0,
  };

  sessions.forEach((session, id) => {
    stats.sessions.push({
      id,
      mobileConnected: session.mobileConnected,
      viewers: session.viewers,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    });

    if (session.mobileConnected) stats.activeMobiles++;
    stats.activeViewers += session.viewers;
  });

  res.json(stats);
});

// Crear nueva sesión
app.post("/api/session", (req, res) => {
  try {
    // Generar ID único
    const sessionId = generateSessionId();

    // Crear objeto de sesión
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      mobileConnected: false,
      viewers: 0,
      frames: [],
      mobileSocketId: null,
      viewerSockets: new Set(),
    };

    // Guardar sesión
    sessions.set(sessionId, session);

    console.log(`✅ Sesión creada: ${sessionId}`);

    res.status(201).json({
      success: true,
      sessionId: sessionId,
      createdAt: session.createdAt,
      message: "Sesión creada exitosamente",
    });
  } catch (error) {
    console.error("❌ Error creando sesión:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

// Obtener información de sesión
app.get("/api/session/:id", (req, res) => {
  const sessionId = req.params.id;

  if (!sessions.has(sessionId)) {
    return res.status(404).json({
      success: false,
      error: "Sesión no encontrada",
    });
  }

  const session = sessions.get(sessionId);

  res.json({
    success: true,
    session: {
      id: session.id,
      createdAt: session.createdAt,
      mobileConnected: session.mobileConnected,
      viewers: session.viewers,
      lastActivity: session.lastActivity,
    },
  });
});

// ==================== SOCKET.IO EVENTOS ====================
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  // 1. UNIRSE A SESIÓN
  socket.on("join-session", (data) => {
    const { sessionId, role } = data;

    console.log(`📥 Join request: ${socket.id} -> ${sessionId} as ${role}`);

    // Validaciones básicas
    if (!sessionId || !role) {
      socket.emit("error", { message: "sessionId y role son requeridos" });
      return;
    }

    if (!sessions.has(sessionId)) {
      socket.emit("error", { message: "Sesión no encontrada" });
      return;
    }

    const session = sessions.get(sessionId);
    session.lastActivity = Date.now();

    // Unir socket a la room
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.role = role;

    if (role === "mobile") {
      // MÓVIL se conecta
      session.mobileConnected = true;
      session.mobileSocketId = socket.id;

      console.log(`📱 Móvil conectado a sesión ${sessionId} (${socket.id})`);

      // Notificar al móvil
      socket.emit("session-joined", {
        success: true,
        role: "mobile",
        sessionId: sessionId,
        message: "Conectado como móvil",
      });

      // Notificar a todos los viewers
      io.to(sessionId).emit("mobile-connected", {
        sessionId: sessionId,
        mobileId: socket.id,
      });
    } else if (role === "viewer") {
      // VIEWER se conecta
      session.viewers++;
      session.viewerSockets.add(socket.id);

      console.log(
        `👁️ Viewer conectado a sesión ${sessionId} (viewers: ${session.viewers})`
      );

      // Notificar al viewer
      socket.emit("session-joined", {
        success: true,
        role: "viewer",
        sessionId: sessionId,
        mobileConnected: session.mobileConnected,
        message: "Conectado como viewer",
      });
    }

    // Enviar información actualizada de la room
    updateRoomInfo(sessionId);
  });

  // 2. RECIBIR FRAME DEL MÓVIL
  socket.on("video-frame", (data) => {
    const { sessionId, frame, metadata } = data;

    // Validaciones
    if (!sessionId || !frame) {
      console.warn(`❌ Frame sin datos: ${socket.id}`);
      return;
    }

    if (!sessions.has(sessionId)) {
      console.warn(`❌ Sesión ${sessionId} no existe`);
      return;
    }

    const session = sessions.get(sessionId);

    // Verificar que sea el móvil quien envía
    if (session.mobileSocketId !== socket.id) {
      console.warn(
        `⚠️ Intento no autorizado: ${socket.id} no es el móvil de ${sessionId}`
      );
      return;
    }

    session.lastActivity = Date.now();

    // Guardar último frame (para nuevos viewers)
    session.lastFrame = {
      data: frame,
      timestamp: Date.now(),
      metadata: metadata || {},
    };

    // Enviar a TODOS los viewers de esta sesión (excepto al emisor)
    socket.to(sessionId).emit("new-frame", {
      frame: frame,
      timestamp: Date.now(),
      metadata: metadata || {},
      sessionId: sessionId,
    });

    // Log cada 30 frames
    session.frameCount = (session.frameCount || 0) + 1;
    if (session.frameCount % 30 === 0) {
      console.log(
        `📊 Sesión ${sessionId}: ${session.frameCount} frames enviados`
      );
    }
  });

  // 3. PING/PONG (mantener conexión)
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: Date.now() });
  });

  // 4. DESCONEXIÓN
  socket.on("disconnect", (reason) => {
    console.log(`🔌 Cliente desconectado: ${socket.id} (${reason})`);

    // Buscar en qué sesión estaba
    for (const [sessionId, session] of sessions.entries()) {
      if (session.mobileSocketId === socket.id) {
        // Móvil desconectado
        session.mobileConnected = false;
        session.mobileSocketId = null;
        console.log(`📱 Móvil desconectado de sesión ${sessionId}`);

        // Notificar a viewers
        io.to(sessionId).emit("mobile-disconnected", {
          sessionId: sessionId,
          message: "El móvil se desconectó",
        });
        break;
      } else if (session.viewerSockets.has(socket.id)) {
        // Viewer desconectado
        session.viewers = Math.max(0, session.viewers - 1);
        session.viewerSockets.delete(socket.id);
        console.log(
          `👁️ Viewer desconectado de ${sessionId} (restantes: ${session.viewers})`
        );
        break;
      }
    }

    // Actualizar rooms
    if (socket.sessionId) {
      updateRoomInfo(socket.sessionId);
    }
  });

  // 5. ERROR HANDLING
  socket.on("error", (error) => {
    console.error(`❌ Socket error ${socket.id}:`, error);
  });
});

// ==================== FUNCIONES AUXILIARES ====================
function generateSessionId() {
  // Generar ID tipo "ABC-123"
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Sin I, O para evitar confusión
  const numbers = "123456789";

  let id = "";
  for (let i = 0; i < 3; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  id += "-";
  for (let i = 0; i < 3; i++) {
    id += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }

  return id;
}

function updateRoomInfo(sessionId) {
  if (!sessions.has(sessionId)) return;

  const session = sessions.get(sessionId);

  io.to(sessionId).emit("room-info", {
    sessionId: sessionId,
    mobileConnected: session.mobileConnected,
    viewers: session.viewers,
    lastActivity: session.lastActivity,
  });
}

// ==================== LIMPIAR SESIONES VIEJAS ====================
setInterval(() => {
  const now = Date.now();
  const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hora

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      console.log(`🗑️ Eliminando sesión expirada: ${sessionId}`);
      sessions.delete(sessionId);

      // Notificar a clientes
      io.to(sessionId).emit("session-expired", {
        sessionId: sessionId,
        message: "Sesión expirada por inactividad",
      });
    }
  }
}, 5 * 60 * 1000); // Cada 5 minutos

// ==================== INICIAR SERVIDOR ====================
server.listen(PORT, () => {
  console.log(`
  🚀 SERVIDOR SOCKET.IO INICIADO
  📍 Puerto: ${PORT}
  🌐 URL: http://localhost:${PORT}
  🕐 ${new Date().toLocaleString()}
  `);
  console.log("✅ Endpoints disponibles:");
  console.log(`   📍 http://localhost:${PORT}/`);
  console.log(`   📍 http://localhost:${PORT}/health`);
  console.log(`   📍 http://localhost:${PORT}/stats`);
  console.log(`   📍 http://localhost:${PORT}/api/session`);
});
