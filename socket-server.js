// socket-video-server/server/socket-server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// Configuración
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  "https://baskin.vercel.app", // SIN barra final
  "https://baskin-*.vercel.app", // Para deployments de PR
  "https://baskin-git-*.vercel.app", // Para branches
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
];

// Configuración centralizada de CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (mobile apps, curl, etc.)
    if (!origin) {
      console.log("📨 Request sin origin (permitido)");
      return callback(null, true);
    }

    console.log("🔍 Verificando origin:", origin);

    // Verificar si el origin está en la lista permitida
    const isAllowed = ALLOWED_ORIGINS.some((allowed) => {
      // Si tiene wildcard
      if (allowed.includes("*")) {
        // Crear regex a partir del patrón wildcard
        const pattern = "^" + allowed.replace(/\*/g, ".*") + "$";
        const regex = new RegExp(pattern);
        return regex.test(origin);
      }
      // Comparación exacta
      return origin === allowed;
    });

    if (isAllowed) {
      console.log(`✅ Origin permitido: ${origin}`);
      return callback(null, true);
    } else {
      console.log(`❌ Origin BLOQUEADO: ${origin}`);
      console.log(`   Orígenes permitidos:`, ALLOWED_ORIGINS);
      return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
  ],
  exposedHeaders: ["Content-Length", "X-Request-ID"],
  maxAge: 600, // Cache de preflight por 10 minutos
};

// Crear app Express
const app = express();

// Middleware CORS para HTTP
app.use(cors(corsOptions));

// Middleware adicional para headers CORS manuales (backup)
app.use((req, res, next) => {
  // Headers específicos para Vercel y Railway
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Socket-ID"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log("  Origin:", req.headers.origin || "No origin");
  console.log(
    "  User-Agent:",
    req.headers["user-agent"]?.substring(0, 50) || "No UA"
  );
  next();
});

app.use(express.json({ limit: "50mb" })); // Para imágenes base64 grandes

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar Socket.io con la MISMA configuración CORS
const io = new Server(server, {
  cors: corsOptions,
  transports: ["polling", "websocket"], // Polling primero para mejor compatibilidad
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false,
  perMessageDeflate: false,
  httpCompression: true,
  connectTimeout: 45000,
  upgradeTimeout: 30000,
  allowUpgrades: true,
  rememberUpgrade: true,
  // Configuración adicional para Railway
  serveClient: false,
  adapter: require("socket.io-adapter-memory")(),
  parser: require("socket.io-msgpack-parser"),
});

// ==================== VARIABLES GLOBALES ====================
const sessions = new Map(); // Almacena las sesiones activas

// ==================== ENDPOINTS REST ====================
app.get("/", (req, res) => {
  res.json({
    service: "Video Streaming Socket Server",
    status: "online",
    version: "1.2.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      createSession: "POST /api/session",
      getSession: "GET /api/session/:id",
      health: "GET /health",
      stats: "GET /stats",
      corsTest: "GET /cors-test",
      debugOrigin: "GET /debug-origin",
    },
    sessions: sessions.size,
    allowedOrigins: ALLOWED_ORIGINS,
    environment: process.env.NODE_ENV || "development",
  });
});

// Health check mejorado
app.get("/health", (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
      heapTotal:
        Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
    },
    sessions: sessions.size,
    nodeVersion: process.version,
    platform: process.platform,
    origin: req.headers.origin || "none",
    clientIp: req.ip,
    environment: process.env.NODE_ENV || "development",
  };

  res.json(health);
});

// Test de CORS detallado
app.get("/cors-test", (req, res) => {
  const testResult = {
    success: true,
    message: "CORS test successful",
    yourOrigin: req.headers.origin || "No origin header",
    allowedOrigins: ALLOWED_ORIGINS,
    timestamp: new Date().toISOString(),
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer,
    },
    isOriginAllowed: ALLOWED_ORIGINS.some((allowed) => {
      if (allowed.includes("*")) {
        const pattern = "^" + allowed.replace(/\*/g, ".*") + "$";
        const regex = new RegExp(pattern);
        return regex.test(req.headers.origin || "");
      }
      return allowed === req.headers.origin;
    }),
  };

  console.log("🧪 CORS Test result:", JSON.stringify(testResult, null, 2));
  res.json(testResult);
});

// Debug endpoint para verificar headers
app.get("/debug-origin", (req, res) => {
  const debugInfo = {
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer,
      "user-agent": req.headers["user-agent"],
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "x-real-ip": req.headers["x-real-ip"],
    },
    connection: {
      ip: req.ip,
      ips: req.ips,
      secure: req.secure,
      protocol: req.protocol,
    },
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    serverInfo: {
      environment: process.env.NODE_ENV || "development",
      port: PORT,
      uptime: process.uptime(),
    },
  };

  console.log("🐛 Debug origin request:", debugInfo);
  res.json(debugInfo);
});

// Estadísticas detalladas
app.get("/stats", (req, res) => {
  const stats = {
    totalSessions: sessions.size,
    sessions: [],
    activeMobiles: 0,
    activeViewers: 0,
    totalViewers: 0,
  };

  sessions.forEach((session, id) => {
    stats.sessions.push({
      id,
      mobileConnected: session.mobileConnected,
      viewers: session.viewers,
      createdAt: new Date(session.createdAt).toISOString(),
      lastActivity: new Date(session.lastActivity).toISOString(),
      ageSeconds: Math.round((Date.now() - session.createdAt) / 1000),
      idleSeconds: Math.round((Date.now() - session.lastActivity) / 1000),
    });

    if (session.mobileConnected) stats.activeMobiles++;
    stats.totalViewers += session.viewers;
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
      frameCount: 0,
    };

    // Guardar sesión
    sessions.set(sessionId, session);

    console.log(`✅ Sesión creada: ${sessionId}`);

    res.status(201).json({
      success: true,
      sessionId: sessionId,
      createdAt: session.createdAt,
      createdAtFormatted: new Date(session.createdAt).toISOString(),
      message: "Sesión creada exitosamente",
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        `https://baskin.vercel.app/mobile?session=${sessionId}`
      )}`,
    });
  } catch (error) {
    console.error("❌ Error creando sesión:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Obtener información de sesión
app.get("/api/session/:id", (req, res) => {
  const sessionId = req.params.id.toUpperCase();

  if (!sessions.has(sessionId)) {
    return res.status(404).json({
      success: false,
      error: "Sesión no encontrada",
      sessionId: sessionId,
    });
  }

  const session = sessions.get(sessionId);

  res.json({
    success: true,
    session: {
      id: session.id,
      createdAt: session.createdAt,
      createdAtFormatted: new Date(session.createdAt).toISOString(),
      mobileConnected: session.mobileConnected,
      viewers: session.viewers,
      lastActivity: session.lastActivity,
      lastActivityFormatted: new Date(session.lastActivity).toISOString(),
      ageSeconds: Math.round((Date.now() - session.createdAt) / 1000),
      idleSeconds: Math.round((Date.now() - session.lastActivity) / 1000),
    },
  });
});

// ==================== SOCKET.IO EVENTOS ====================
io.on("connection", (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  console.log(`   Origin: ${socket.handshake.headers.origin}`);
  console.log(`   Transport: ${socket.conn.transport.name}`);
  console.log(`   Query:`, socket.handshake.query);

  // Enviar evento de bienvenida
  socket.emit("welcome", {
    message: "Connected to Socket.io server",
    socketId: socket.id,
    timestamp: Date.now(),
    serverVersion: "1.2.0",
  });

  // 1. UNIRSE A SESIÓN
  socket.on("join-session", (data, callback) => {
    const { sessionId, role } = data;

    console.log(`📥 Join request: ${socket.id} -> ${sessionId} as ${role}`);

    // Validaciones básicas
    if (!sessionId || !role) {
      const error = { message: "sessionId y role son requeridos" };
      socket.emit("error", error);
      if (callback) callback({ success: false, error: error.message });
      return;
    }

    const formattedSessionId = sessionId.toUpperCase().trim();

    if (!sessions.has(formattedSessionId)) {
      const error = { message: "Sesión no encontrada" };
      socket.emit("error", error);
      if (callback) callback({ success: false, error: error.message });
      return;
    }

    const session = sessions.get(formattedSessionId);
    session.lastActivity = Date.now();

    // Unir socket a la room
    socket.join(formattedSessionId);
    socket.sessionId = formattedSessionId;
    socket.role = role;

    if (role === "mobile") {
      // MÓVIL se conecta
      if (session.mobileConnected && session.mobileSocketId) {
        // Ya hay un móvil conectado, desconectarlo
        io.to(session.mobileSocketId).emit("mobile-replaced", {
          message: "Otro móvil se ha conectado a esta sesión",
          newMobileId: socket.id,
        });
        io.sockets.sockets.get(session.mobileSocketId)?.disconnect();
      }

      session.mobileConnected = true;
      session.mobileSocketId = socket.id;

      console.log(
        `📱 Móvil conectado a sesión ${formattedSessionId} (${socket.id})`
      );

      // Notificar al móvil
      const response = {
        success: true,
        role: "mobile",
        sessionId: formattedSessionId,
        message: "Conectado como móvil",
        viewers: session.viewers,
      };
      socket.emit("session-joined", response);

      // Notificar a todos los viewers
      io.to(formattedSessionId).emit("mobile-connected", {
        sessionId: formattedSessionId,
        mobileId: socket.id,
        timestamp: Date.now(),
      });

      if (callback) callback(response);
    } else if (role === "viewer") {
      // VIEWER se conecta
      session.viewers++;
      session.viewerSockets.add(socket.id);

      console.log(
        `👁️ Viewer conectado a sesión ${formattedSessionId} (viewers: ${session.viewers})`
      );

      // Notificar al viewer
      const response = {
        success: true,
        role: "viewer",
        sessionId: formattedSessionId,
        mobileConnected: session.mobileConnected,
        message: "Conectado como viewer",
        viewers: session.viewers,
      };
      socket.emit("session-joined", response);

      // Enviar último frame si existe
      if (session.lastFrame) {
        socket.emit("new-frame", {
          frame: session.lastFrame.data,
          timestamp: session.lastFrame.timestamp,
          metadata: session.lastFrame.metadata,
          sessionId: formattedSessionId,
          isCatchup: true,
        });
      }

      if (callback) callback(response);
    }

    // Enviar información actualizada de la room
    updateRoomInfo(formattedSessionId);
  });

  // 2. RECIBIR FRAME DEL MÓVIL
  socket.on("video-frame", (data, callback) => {
    const { sessionId, frame, metadata } = data;

    // Validaciones
    if (!sessionId || !frame) {
      console.warn(`❌ Frame sin datos: ${socket.id}`);
      if (callback) callback({ success: false, error: "Datos incompletos" });
      return;
    }

    if (!sessions.has(sessionId)) {
      console.warn(`❌ Sesión ${sessionId} no existe`);
      if (callback) callback({ success: false, error: "Sesión no existe" });
      return;
    }

    const session = sessions.get(sessionId);

    // Verificar que sea el móvil quien envía
    if (session.mobileSocketId !== socket.id) {
      console.warn(
        `⚠️ Intento no autorizado: ${socket.id} no es el móvil de ${sessionId}`
      );
      if (callback) callback({ success: false, error: "No autorizado" });
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
      frameSize: Buffer.byteLength(frame, "base64"),
    });

    // Log cada 30 frames
    session.frameCount = (session.frameCount || 0) + 1;
    if (session.frameCount % 30 === 0) {
      console.log(
        `📊 Sesión ${sessionId}: ${session.frameCount} frames enviados`
      );
    }

    if (callback) callback({ success: true, frameCount: session.frameCount });
  });

  // 3. PING/PONG (mantener conexión)
  socket.on("ping", () => {
    socket.emit("pong", {
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
    });
  });

  // 4. HEARTBEAT
  socket.on("heartbeat", (data) => {
    socket.emit("heartbeat-response", {
      timestamp: Date.now(),
      clientData: data,
      serverLoad:
        process.memoryUsage().heapUsed / process.memoryUsage().heapTotal,
    });
  });

  // 5. DESCONEXIÓN
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
          reason: reason,
          timestamp: Date.now(),
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

  // 6. ERROR HANDLING
  socket.on("error", (error) => {
    console.error(`❌ Socket error ${socket.id}:`, error);
    socket.emit("server-error", {
      message: "Error interno del servidor",
      timestamp: Date.now(),
    });
  });

  // 7. LEAVE SESSION
  socket.on("leave-session", () => {
    if (socket.sessionId) {
      const session = sessions.get(socket.sessionId);
      if (session) {
        if (socket.role === "mobile" && session.mobileSocketId === socket.id) {
          session.mobileConnected = false;
          session.mobileSocketId = null;
        } else if (socket.role === "viewer") {
          session.viewers = Math.max(0, session.viewers - 1);
          session.viewerSockets.delete(socket.id);
        }
        socket.leave(socket.sessionId);
        updateRoomInfo(socket.sessionId);
      }
    }
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
    lastActivityFormatted: new Date(session.lastActivity).toISOString(),
    ageSeconds: Math.round((Date.now() - session.createdAt) / 1000),
    timestamp: Date.now(),
  });
}

// ==================== LIMPIAR SESIONES VIEJAS ====================
setInterval(() => {
  const now = Date.now();
  const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hora

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      console.log(`🗑️ Eliminando sesión expirada: ${sessionId}`);

      // Notificar a clientes antes de eliminar
      io.to(sessionId).emit("session-expired", {
        sessionId: sessionId,
        message: "Sesión expirada por inactividad",
        timestamp: now,
      });

      // Desconectar a todos los sockets de esta sesión
      const room = io.sockets.adapter.rooms.get(sessionId);
      if (room) {
        for (const socketId of room) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.leave(sessionId);
          }
        }
      }

      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Cada 5 minutos

// ==================== MANEJO DE ERRORES GLOBALES ====================
process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error);
  // No cerrar el proceso, solo loguear
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 Unhandled Rejection at:", promise, "reason:", reason);
});

// ==================== INICIAR SERVIDOR ====================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
  🚀 SERVIDOR SOCKET.IO INICIADO
  📍 Puerto: ${PORT}
  🌐 URL: http://0.0.0.0:${PORT}
  🌐 URL Externa: https://socket-video-server-production.up.railway.app
  🕐 ${new Date().toLocaleString()}
  📊 Entorno: ${process.env.NODE_ENV || "development"}
  `);
  console.log("✅ Endpoints disponibles:");
  console.log(`   📍 http://localhost:${PORT}/`);
  console.log(`   📍 http://localhost:${PORT}/health`);
  console.log(`   📍 http://localhost:${PORT}/cors-test`);
  console.log(`   📍 http://localhost:${PORT}/debug-origin`);
  console.log(`   📍 http://localhost:${PORT}/stats`);
  console.log(`   📍 http://localhost:${PORT}/api/session`);
  console.log("");
  console.log("✅ Orígenes permitidos:");
  ALLOWED_ORIGINS.forEach((origin) => console.log(`   🌐 ${origin}`));
});

// Keep alive para Railway
setInterval(() => {
  console.log(`💓 Keep alive - Sesiones activas: ${sessions.size}`);
}, 60 * 1000); // Cada minuto
