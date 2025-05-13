const os = require("os");
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const WebSocket = require("ws");
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// 静的ファイル (HTML, JSクライアント) を提供するための設定
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

let androidClientSocket = null;
let pcClientSocket = null;

wss.on("connection", (ws) => {
  console.log("A user connected via WebSocket");

  // JSONメッセージを処理
  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error("Invalid JSON message:", e);
      return;
    }

    console.log("Received message type:", data.type);

    switch (data.type) {
      case "android-ready":
        console.log("Android client identified");
        androidClientSocket = ws;
        // PCクライアントが既に待機していれば通知
        if (pcClientSocket) {
          pcClientSocket.send(JSON.stringify({ type: "android-available" }));
        }
        break;

      case "pc-ready":
        console.log("PC client identified");
        pcClientSocket = ws;
        // Androidクライアントが既に待機していれば通知
        if (androidClientSocket) {
          pcClientSocket.send(JSON.stringify({ type: "android-available" }));
        }
        break;

      case "offer":
        console.log(
          "Offer received, forwarding to",
          ws === androidClientSocket ? "PC" : "Android"
        );
        // console.log("Received offer SDP:", JSON.stringify(data.sdp, null, 2)); // 受信したオファーのSDPをコンソールに出力
        const offerTarget =
          ws === androidClientSocket ? pcClientSocket : androidClientSocket;
        if (offerTarget) {
          offerTarget.send(JSON.stringify({ type: "offer", sdp: data.sdp }));
        } else {
          console.log("Target client not ready for offer.");
        }
        break;

      case "answer":
        console.log(
          "Answer received, forwarding to",
          ws === pcClientSocket ? "Android" : "PC"
        );
        const answerTarget =
          ws === pcClientSocket ? androidClientSocket : pcClientSocket;
        if (answerTarget) {
          answerTarget.send(JSON.stringify({ type: "answer", sdp: data.sdp }));
        } else {
          console.log("Target client not ready for answer.");
        }
        break;

      case "candidate":
        const sourceClient = ws === androidClientSocket ? "Android" : "PC";
        const targetClient =
          ws === androidClientSocket ? pcClientSocket : androidClientSocket;
        const targetClientName = ws === androidClientSocket ? "PC" : "Android";

        console.log(
          `Candidate message received from ${sourceClient}, forwarding to ${targetClientName}`
        );

        if (targetClient) {
          // ★★★ 修正点: 受信した data.candidate オブジェクトをそのまま中継する ★★★
          // 以前の再構成ロジックは完全に削除し、単純な中継に徹する
          if (data.candidate && typeof data.candidate === "object") {
            // data.candidate が存在し、オブジェクトであることを確認
            targetClient.send(
              JSON.stringify({
                type: "candidate",
                candidate: data.candidate, // ★ 受信した candidate オブジェクトをそのまま渡す
              })
            );
            // 送信する内容をログに出力して確認
            console.log(
              `Forwarded candidate object from ${sourceClient} to ${targetClientName}:`,
              JSON.stringify(data.candidate)
            );
          } else {
            // 受信したメッセージ形式が予期せぬものだった場合のエラーログ
            console.error(
              `Received candidate message from ${sourceClient} is missing 'candidate' field or it's not an object:`,
              JSON.stringify(data)
            );
          }
        } else {
          console.log(
            `Target client ${targetClientName} not ready for candidate.`
          );
        }
        break;

      default:
        console.log("Unknown message type:", data.type);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    if (ws === androidClientSocket) {
      androidClientSocket = null;
      console.log("Android client disconnected.");
      if (pcClientSocket) {
        pcClientSocket.send(JSON.stringify({ type: "client-disconnected" }));
      }
    }
    if (ws === pcClientSocket) {
      pcClientSocket = null;
      console.log("PC client disconnected.");
      if (androidClientSocket) {
        androidClientSocket.send(
          JSON.stringify({ type: "client-disconnected" })
        );
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const networkInterfaces = os.networkInterfaces();
  let listeningIP = "localhost";
  let specificIPLogged = false;

  console.log(`Server listening on port ${PORT}.`);
  console.log(`WebSocket server available at ws://<your-ip-address>:${PORT}`);

  // 外部からアクセス可能なIPv4アドレスを探して表示
  for (const interfaceName in networkInterfaces) {
    const Tifaces = networkInterfaces[interfaceName];
    if (Tifaces) {
      for (const iface of Tifaces) {
        if (iface.family === "IPv4" && !iface.internal) {
          listeningIP = iface.address;
          console.log(
            `  => Accessible on your network at: http://${listeningIP}:${PORT} (for browser)`
          );
          console.log(
            `  => Android app should connect to: ws://${listeningIP}:${PORT}`
          );
          specificIPLogged = true;
          break;
        }
      }
    }
    if (specificIPLogged) break;
  }

  if (!specificIPLogged) {
    console.log(
      `  Could not automatically determine a specific network IP. Please use your PC's current local IP address.`
    );
    console.log(
      `  Ensure server is listening on 0.0.0.0 to accept external connections.`
    );
  }
  console.log(
    `  (Also listening on http://localhost:${PORT} for local access and ws://localhost:${PORT} for WebSocket)`
  );
});
