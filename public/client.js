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
      case "android-available": // ★ Android準備完了通知を受信
        statusElement.textContent =
          "Status: Android client available. Initializing connection...";
        // ★ PeerConnectionの準備を開始
        startPeerConnection();
        // PeerConnectionが準備できたことを示す（Offerを待機）
        if (peerConnection) {
          statusElement.textContent =
            "Status: Ready. Waiting for offer from Android...";
        } else {
          statusElement.textContent = "Status: Error initializing WebRTC.";
        }
        // ボタンは有効にするが、Offer/Answer開始のトリガーではなくなる
        connectButton.disabled = false;
        break;

      case "offer": // ★ Offerを受信
        // PeerConnectionが準備できているか確認
        if (!peerConnection) {
          console.warn(
            "Offer received, but PeerConnection is not ready. Attempting to initialize now."
          );
          startPeerConnection(); // 念のため初期化試行
          if (!peerConnection) {
            console.error(
              "Failed to initialize PeerConnection before handling offer."
            );
            statusElement.textContent =
              "Error: WebRTC connection not ready to receive offer.";
            return; // Offerを処理できない
          }
        }
        // ★ handleOffer を呼び出す (data.sdp は Offer SDP 文字列)
        handleOffer(data.sdp);
        break;

      case "answer":
        // Android側がOfferを出すので、クライアントがAnswerを受信することはないはず
        console.warn("Received unexpected Answer message.");
        // handleAnswer(data.sdp); // 必要なら残す
        break;

      case "candidate":
        // PeerConnectionが準備できていないとCandidateも処理できない
        if (!peerConnection) {
          console.warn("Candidate received, but PeerConnection is not ready.");
          // ここで startPeerConnection を呼ぶのは手遅れの場合が多い
          return;
        }
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
async function handleOffer(offerSdpString) {
  // 引数はSDP文字列そのもの
  // PeerConnectionがなければ開始 (二重チェック)
  if (!peerConnection) {
    console.log(
      "handleOffer called but PeerConnection not ready, starting now."
    );
    startPeerConnection();
    if (!peerConnection) {
      console.error("Failed to initialize PeerConnection in handleOffer.");
      return;
    }
  }

  console.log(
    "Received Offer String:",
    offerSdpString.substring(0, 100) + "..."
  ); // 全部はログに出さない方が良い場合も
  statusElement.textContent = "Status: Offer received. Creating answer...";

  try {
    // Offer SDPオブジェクトを作成
    const offerDescription = { type: "offer", sdp: offerSdpString };
    console.log("Setting remote description (Offer)...");
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(offerDescription)
    );

    console.log("Creating Answer...");
    const answer = await peerConnection.createAnswer();
    console.log("Setting local description (Answer)...");
    await peerConnection.setLocalDescription(answer);

    console.log("Sending Answer:", answer);
    // ★ AnswerをAndroid側の期待するフォーマットで送信
    sendMessage({
      type: "answer",
      sdp: { type: answer.type, sdp: answer.sdp },
    });

    statusElement.textContent =
      "Status: Answer sent. Negotiating connection...";
  } catch (error) {
    console.error("Error handling offer:", error);
    statusElement.textContent = "Error handling offer: " + error.message;
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
  console.log(
    "Connect button clicked (currently does nothing for connection initiation)."
  );
  // statusElement.textContent = "Status: Attempting to connect to Android...";
  // startPeerConnection();
  // connectButton.disabled = true;
};

// WebRTC接続を開始
function startPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection({ iceServers });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      // ログメッセージも修正すると分かりやすいです
      console.log(
        "Sending ICE Candidate (using sdpMLineIndex/sdpMid keys):",
        event.candidate
      );
      sendMessage({
        type: "candidate",
        candidate: {
          // 送信するオブジェクト
          // ★★★ 修正点: キー名を "sdpMLineIndex" と "sdpMid" に修正 ★★★
          sdpMLineIndex: event.candidate.sdpMLineIndex, // "label" ではなく "sdpMLineIndex"
          sdpMid: event.candidate.sdpMid, // "id" ではなく "sdpMid"
          candidate: event.candidate.candidate, // "candidate" はそのまま
          // "type": "candidate" は通常このネストされたオブジェクト内には不要
        },
      });
    }
  };

  peerConnection.ontrack = (event) => {
    console.log("Remote track received:", event.streams[0]);
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      statusElement.textContent =
        "Status: Connected! Video streaming (attempting play)."; // ステータス変更

      // ★★★ 再生を明示的に試みる ★★★
      const playPromise = remoteVideo.play();
      if (playPromise !== undefined) {
        playPromise
          .then((_) => {
            // 自動再生が開始された
            console.log("Video playback started successfully.");
            statusElement.textContent = "Status: Connected! Video streaming.";
          })
          .catch((error) => {
            // 自動再生が失敗した (ユーザー操作が必要な場合など)
            console.error("Video playback failed:", error);
            statusElement.textContent =
              "Status: Connected! Click video to play (autoplay failed).";
            // 必要であれば、ユーザーに再生を促すUIを表示する
          });
      }
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
