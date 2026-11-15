"use strict";

// ===================================================
// 要素取得
// ===================================================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("startScreen");
const startButton = document.getElementById("startButton");
const clearOverlay = document.getElementById("clearOverlay");

// ===================================================
// 画像アセット
// ===================================================
const bgImage = new Image();
bgImage.src = "bg.png";

const clearImage = new Image();
clearImage.src = "clear.gif";

// ===================================================
// 音響アセット
// ===================================================
const bgm = new Audio("bgm.mp3");
bgm.loop = true;
bgm.volume = 0.5;

const seHitPaddle = new Audio("se_hit_paddle.mp3");
const seHitBrick  = new Audio("se_hit_brick.mp3");
const seHitWall   = new Audio("se_hit_wall.mp3");
const seGameOver  = new Audio("se_gameover.mp3");
const seClear     = new Audio("se_clear.mp3");

const allSE = [seHitPaddle, seHitBrick, seHitWall, seGameOver, seClear];
allSE.forEach((a) => { a.preload = "auto"; });

// SEを頭出しして再生（連続ヒットでも鳴るように）
function playSE(audio) {
  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) { /* 再生失敗は無視 */ }
}

// iOS等でSEが後から鳴らない問題への対策：
// スタートボタンのタップ中に全SEを無音で一度再生して「解錠」しておく
function unlockAudio() {
  allSE.forEach((a) => {
    const prevVolume = a.volume;
    a.volume = 0;
    const p = a.play();
    const restore = () => {
      a.pause();
      a.currentTime = 0;
      a.volume = prevVolume;
    };
    if (p && typeof p.then === "function") {
      p.then(restore).catch(restore);
    } else {
      restore();
    }
  });
}

// ===================================================
// ゲーム状態
// ===================================================
let isGameStarted = false;
let isGameCleared = false;
let isGameOver = false;
let clearHandled = false;

// ボール
let ballRadius;
let x, y, dx, dy;

// パドル
let paddleWidth, paddleHeight, paddleX, paddleY;

// ブロック
const brickRowCount = 5;
const brickColumnCount = 6;
let brickWidth, brickHeight, brickPadding, brickOffsetTop, brickOffsetLeft;
let bricks = [];
let remainingBricks = 0;

const brickColors = ["#ff4d6d", "#ff9f1c", "#ffd60a", "#4cc9f0", "#9b5de5"];

// ===================================================
// 初期化
// ===================================================
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function initGame() {
  resizeCanvas();
  const W = canvas.width;
  const H = canvas.height;

  // パドル
  paddleWidth = W * 0.25;
  paddleHeight = Math.max(12, H * 0.02);
  paddleX = (W - paddleWidth) / 2;
  paddleY = H - paddleHeight - H * 0.08;

  // ボール
  ballRadius = Math.max(6, W * 0.02);
  x = W / 2;
  y = paddleY - ballRadius - 2;
  const speed = Math.max(4, W * 0.011);
  dx = speed * (Math.random() < 0.5 ? -1 : 1) * 0.7;
  dy = -speed;

  // ブロック
  brickPadding = Math.max(3, W * 0.01);
  brickOffsetLeft = brickPadding;
  brickOffsetTop = Math.max(50, H * 0.08);
  brickWidth = (W - brickOffsetLeft * 2 - brickPadding * (brickColumnCount - 1)) / brickColumnCount;
  brickHeight = Math.max(20, H * 0.04);

  bricks = [];
  remainingBricks = 0;
  for (let c = 0; c < brickColumnCount; c++) {
    bricks[c] = [];
    for (let r = 0; r < brickRowCount; r++) {
      bricks[c][r] = { x: 0, y: 0, status: 1 };
      remainingBricks++;
    }
  }
}

// ===================================================
// 入力（パドル操作）
// ===================================================
function movePaddleTo(clientX) {
  paddleX = clientX - paddleWidth / 2;
  if (paddleX < 0) paddleX = 0;
  if (paddleX + paddleWidth > canvas.width) paddleX = canvas.width - paddleWidth;
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  movePaddleTo(e.touches[0].clientX);
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  movePaddleTo(e.touches[0].clientX);
}, { passive: false });

// PCでの動作確認用
canvas.addEventListener("mousemove", (e) => {
  movePaddleTo(e.clientX);
});

// ===================================================
// 衝突判定
// ===================================================
function collisionDetection() {
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < brickRowCount; r++) {
      const b = bricks[c][r];
      if (b.status !== 1) continue;

      if (
        x + ballRadius > b.x &&
        x - ballRadius < b.x + brickWidth &&
        y + ballRadius > b.y &&
        y - ballRadius < b.y + brickHeight
      ) {
        dy = -dy;
        b.status = 0;
        remainingBricks--;
        playSE(seHitBrick);

        // 全ブロック破壊 → クリア
        if (remainingBricks <= 0) {
          isGameCleared = true;
        }
        return; // 1フレームにつき1個まで
      }
    }
  }
}

// ===================================================
// 描画ヘルパー
// ===================================================

// 画像を画面いっぱいにcover表示
function drawImageCover(img) {
  const W = canvas.width;
  const H = canvas.height;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawBackground() {
  if (bgImage.complete && bgImage.naturalWidth > 0) {
    drawImageCover(bgImage);
  } else {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawBricks() {
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < brickRowCount; r++) {
      const b = bricks[c][r];
      if (b.status !== 1) continue; // 壊れたブロックは描かない → 背景が透けて見える

      b.x = brickOffsetLeft + c * (brickWidth + brickPadding);
      b.y = brickOffsetTop + r * (brickHeight + brickPadding);

      ctx.beginPath();
      ctx.rect(b.x, b.y, brickWidth, brickHeight);
      ctx.fillStyle = brickColors[r % brickColors.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.closePath();
    }
  }
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.closePath();
}

function drawPaddle() {
  ctx.beginPath();
  ctx.rect(paddleX, paddleY, paddleWidth, paddleHeight);
  ctx.fillStyle = "#00e5ff";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.closePath();
}

// ===================================================
// クリア / ゲームオーバー処理
// ===================================================
function handleClear() {
  if (clearHandled) return;
  clearHandled = true;

  bgm.pause();
  bgm.currentTime = 0;
  playSE(seClear); // 1回だけ再生

  // GIFをアニメ表示するためのオーバーレイ（canvasのdrawImageは静止画になるため）
  clearOverlay.style.display = "block";
}

function handleGameOver() {
  if (isGameOver) return;
  isGameOver = true;

  bgm.pause();
  bgm.currentTime = 0;
  playSE(seGameOver);

  // SE終了後、または最大3秒後にリロード（どちらか早い方・1回のみ）
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  };
  seGameOver.addEventListener("ended", reload, { once: true });
  setTimeout(reload, 3000);
}

// ===================================================
// メインループ
// ===================================================
function draw() {
  // ---- クリア時：通常描画をスキップしてクリア画像のみ描画し、ループ停止 ----
  if (isGameCleared) {
    handleClear();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (clearImage.complete && clearImage.naturalWidth > 0) {
      drawImageCover(clearImage);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return; // requestAnimationFrame を呼ばない＝完全停止
  }

  // ---- ゲームオーバー時：ループ停止（リロード待ち） ----
  if (isGameOver) return;

  const W = canvas.width;

  // 通常描画（背景 → ブロック → ボール → パドル の順）
  ctx.clearRect(0, 0, W, canvas.height);
  drawBackground();
  drawBricks();
  drawBall();
  drawPaddle();

  // ブロック衝突
  collisionDetection();
  if (isGameCleared) {
    // 次フレームでクリア描画へ
    requestAnimationFrame(draw);
    return;
  }

  // 左右の壁
  if (x + dx > W - ballRadius || x + dx < ballRadius) {
    dx = -dx;
    playSE(seHitWall);
  }

  // 上の壁
  if (y + dy < ballRadius) {
    dy = -dy;
    playSE(seHitWall);
  }
  // パドル
  else if (
    dy > 0 &&
    y + ballRadius >= paddleY &&
    y + ballRadius <= paddleY + paddleHeight + dy &&
    x >= paddleX - ballRadius &&
    x <= paddleX + paddleWidth + ballRadius
  ) {
    // 当たった位置で反射角を変える
    const speed = Math.sqrt(dx * dx + dy * dy);
    const hit = (x - (paddleX + paddleWidth / 2)) / (paddleWidth / 2); // -1〜1
    const clamped = Math.max(-1, Math.min(1, hit));
    const angle = clamped * (Math.PI / 3); // 最大60度
    dx = speed * Math.sin(angle);
    dy = -speed * Math.cos(angle);
    y = paddleY - ballRadius;
    playSE(seHitPaddle);
  }
  // 下に落ちた
  else if (y - ballRadius > canvas.height) {
    handleGameOver();
    return;
  }

  x += dx;
  y += dy;

  requestAnimationFrame(draw);
}

// ===================================================
// ゲーム開始（スタートボタン）
// ===================================================
function startGame() {
  if (isGameStarted) return; // click と touchstart の二重発火を防止
  isGameStarted = true;

  // ユーザー操作の中で音声を解錠 → BGM再生
  unlockAudio();
  const p = bgm.play();
  if (p && typeof p.catch === "function") p.catch(() => {});

  // 画面切り替え
  startScreen.style.display = "none";
  canvas.style.display = "block";

  initGame();
  draw();
}

startButton.addEventListener("click", startGame);
startButton.addEventListener("touchstart", (e) => {
  e.preventDefault(); // 直後に合成clickが発火するのを防ぐ
  startGame();
}, { passive: false });

// 向きの変更・リサイズ時はリロードしてレイアウトを再計算（ゲーム中のみ）
window.addEventListener("orientationchange", () => {
  if (isGameStarted && !isGameCleared) location.reload();
});
