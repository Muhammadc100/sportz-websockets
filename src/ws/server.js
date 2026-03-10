import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    client.send(JSON.stringify(payload));
  }
}

export function attachWebSocketServer(server) {
  // create a server that will only handle upgrades; auth is done during upgrade
  const wss = new WebSocketServer({
    noServer: true,
    path: "/ws",
    maxPayload: 1024 * 1024,
  });

  // perform Arcjet protection in the HTTP upgrade event before handshake
  server.on('upgrade', async (request, socket, head) => {
    if (new URL(request.url, `http://${request.headers.host}`).pathname !== '/ws') {
      // not our websocket path, let default handlers or close
      socket.destroy();
      return;
    }

    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(request);
        if (decision.isDenied()) {
          // reject at HTTP level with a short response
          const status = decision.reason.isRateLimit() ? 429 : 401;
          const message = decision.reason.isRateLimit() ? 'Rate limit exceeded' : 'Access denied';
          socket.write(
            `HTTP/1.1 ${status} ${message}\r\n` +
            'Connection: close\r\n' +
            '\r\n'
          );
          socket.destroy();
          return;
        }
      } catch (e) {
        console.error('WS upgrade error', e);
        socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on("connection", (socket, req) => {
    // Arcjet check already done during upgrade
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 3000);

  wss.on("close", () => clearInterval(interval));

  function broadcastMatchCreated(match) {
    broadcast(wss, { type: "match_created", data: match });
  }

  return { broadcastMatchCreated };
}
