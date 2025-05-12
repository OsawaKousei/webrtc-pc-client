const remoteVideo = document.getElementById("remoteVideo");
const connectButton = document.getElementById("connectButton");
const statusElement = document.getElementById("status");

let peerConnection;
const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

// WebSocketの設定
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}`);
let socketReady = false;

statusElement.textContent = "Status: Connecting to signaling server...";

// WebSocket接続イベント
socket.onopen = () => {
  console.log("WebSocket connected");
  socketReady = true;
  statusElement.textContent =
    "Status: Connected to signaling server. Waiting for Android client...";

  // PCクライアントが準備完了したことをサーバーに通知
  sendMessage({ type: "pc-ready" });
};

// WebSocketメッセージ受信イベント
socket.onmessage = (event) => {
  console.log("Received message:", event.data);

  try {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "android-available":
        statusElement.textContent =
          "Status: Android client available. Ready to connect.";
        connectButton.disabled = false;
        break;

      case "offer":
        handleOffer(data.sdp);
        break;

      case "answer":
        handleAnswer(data.sdp);
        break;

      case "candidate":
        handleCandidate(data.candidate);
        break;

      case "client-disconnected":
        statusElement.textContent = "Status: Android client disconnected.";
        connectButton.disabled = true;
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }
        remoteVideo.srcObject = null;
        break;

      default:
        console.log("Unknown message type:", data.type);
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
};

// WebSocketエラーイベント
socket.onerror = (error) => {
  console.error("WebSocket error:", error);
  statusElement.textContent = "Status: Connection error with signaling server.";
  connectButton.disabled = true;
};

// WebSocket切断イベント
socket.onclose = () => {
  console.log("WebSocket disconnected");
  socketReady = false;
  statusElement.textContent = "Status: Disconnected from signaling server.";
  connectButton.disabled = true;
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
};

// メッセージ送信用ヘルパー関数
function sendMessage(message) {
  if (socketReady) {
    socket.send(JSON.stringify(message));
  } else {
    console.error("Socket not ready, can't send message");
  }
}

// Offerを処理する
async function handleOffer(offerSdp) {
  if (!peerConnection) {
    startPeerConnection();
  }

  console.log("Received Offer:", offerSdp);
  statusElement.textContent = "Status: Offer received. Creating answer...";

  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(offerSdp)
    );
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log("Sending Answer:", answer);
    sendMessage({
      type: "answer",
      sdp: { type: answer.type, sdp: answer.sdp },
    });

    statusElement.textContent =
      "Status: Answer sent. Waiting for connection...";
  } catch (error) {
    console.error("Error handling offer:", error);
    statusElement.textContent = "Error: " + error.message;
  }
}

// Answerを処理する
async function handleAnswer(answerSdp) {
  if (!peerConnection) {
    console.error("No peer connection to handle answer");
    return;
  }

  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answerSdp)
    );
  } catch (error) {
    console.error("Error handling answer:", error);
  }
}

// ICE Candidateを処理する
async function handleCandidate(candidate) {
  if (!peerConnection) {
    console.error("No peer connection to handle ICE candidate");
    return;
  }

  try {
    console.log("Received ICE Candidate:", candidate);
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error("Error adding received ICE candidate:", error);
  }
}

// 接続ボタンクリック処理
connectButton.onclick = () => {
  statusElement.textContent = "Status: Attempting to connect to Android...";
  startPeerConnection();
  connectButton.disabled = true;
};

// WebRTC接続を開始
function startPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection({ iceServers });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE Candidate:", event.candidate);
      sendMessage({
        type: "candidate",
        candidate: {
          type: "candidate",
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate,
        },
      });
    }
  };

  peerConnection.ontrack = (event) => {
    console.log("Remote track received:", event.streams[0]);
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      statusElement.textContent = "Status: Connected! Video streaming.";
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE Connection State:", peerConnection.iceConnectionState);
    if (
      peerConnection.iceConnectionState === "failed" ||
      peerConnection.iceConnectionState === "disconnected" ||
      peerConnection.iceConnectionState === "closed"
    ) {
      // statusElement.textContent = 'Status: Connection lost.';
      // 必要に応じて再接続処理など
    }
  };
}

// 初期状態ではボタンを無効化
connectButton.disabled = true;
