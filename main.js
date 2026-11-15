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
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const bgImage     = loadImage("bg.png");      // 画面全体の背景
const hiddenImage = loadImage("hidden.png");  // ブロックの裏に隠れるイラスト
const ballImage   = loadImage("ball.png");    // ボール
const paddleImage = loadImage("paddle.png");  // パドル

function isReady(img) {
  return img.complete && img.naturalWidth > 0;
}

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

// iOS Safari の再生制限対策：
// スタートボタンのタップ中に、全Audioを無音で一度再生してすぐ止める
function unlockAudio() {
  [bgm, ...allSE].forEach((a) => {
    const prevVolume = a.volume;
    a.volume = 0;
    const restore = () => {
      a.pause();
      a.currentTime = 0;
      a.volume = prevVolume;
    };
    try {
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(restore).catch(restore);
      } else {
        restore();
      }
    } catch (e) {
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
function updatePaddleSize() {
  // パドル画像の縦横比を維持（画像未読込時は仮サイズ）
  paddleWidth = canvas.width * 0.25;
  if (isReady(paddleImage)) {
    paddleHeight = paddleWidth * (paddleImage.naturalHeight / paddleImage.naturalWidth);
  } else {
    paddleHeight = Math.max(12, canvas.height * 0.02);
  }
  paddleY = canvas.height - paddleHeight - canvas.height * 0.08;
}

function initGame() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const W = canvas.width;
  const H = canvas.height;

  // パドル
  updatePaddleSize();
  paddleX = (W - paddleWidth) / 2;

  // ボール
  ballRadius = Math.max(8, W * 0.025);
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
      bricks[c][r] = {
        x: brickOffsetLeft + c * (brickWidth + brickPadding),
        y: brickOffsetTop + r * (brickHeight + brickPadding),
        status: 1,
      };
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
// 描画
// ===================================================

// 画像を画面いっぱいにcover表示（縦横比維持・はみ出しは切り取り）
function drawImageCover(img) {
  const W = canvas.width;
  const H = canvas.height;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// 1. 画面全体の背景
function drawBackground() {
  if (isReady(bgImage)) {
    drawImageCover(bgImage);
  } else {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// 2. 隠しイラスト：ブロック群全体の領域と同じ位置・サイズで描画
function drawHiddenImage() {
  const areaX = brickOffsetLeft;
  const areaY = brickOffsetTop;
  const areaW = brickColumnCount * brickWidth + (brickColumnCount - 1) * brickPadding;
  const areaH = brickRowCount * brickHeight + (brickRowCount - 1) * brickPadding;

  if (isReady(hiddenImage)) {
    ctx.drawImage(hiddenImage, areaX, areaY, areaW, areaH);
  }
}

// 3. ブロック（status=1のみ描画。status=0は描かず奥のhidden.pngを見せる）
function drawBricks() {
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < brickRowCount; r++) {
      const b = bricks[c][r];
      if (b.status !== 1) continue;

      ctx.fillStyle = brickColors[r % brickColors.length];
      ctx.fillRect(b.x, b.y, brickWidth, brickHeight);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, brickWidth, brickHeight);
    }
  }
}

// 4. ボール（当たり判定の中心と画像の中心を一致させる）
function drawBall() {
  if (isReady(ballImage)) {
    ctx.drawImage(
      ballImage,
      x - ballRadius,
      y - ballRadius,
      ballRadius * 2,
      ballRadius * 2
    );
  } else {
    // 画像が読み込めなかった場合の代替表示
    ctx.beginPath();
    ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.closePath();
  }
}

// 5. パドル
function drawPaddle() {
  if (isReady(paddleImage)) {
    ctx.drawImage(paddleImage, paddleX, paddleY, paddleWidth, paddleHeight);
  } else {
    // 画像が読み込めなかった場合の代替表示
    ctx.fillStyle = "#00e5ff";
    ctx.fillRect(paddleX, paddleY, paddleWidth, paddleHeight);
  }
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

  // Canvas上のGIFは静止画になるため、HTMLのimg要素を重ねて表示
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
  // クリア済み・ゲームオーバー済みならループ停止
  if (isGameCleared) {
    handleClear();
    return;
  }
  if (isGameOver) return;

  const W = canvas.width;
  const H = canvas.height;

  updatePaddleSize();
  if (paddleX + paddleWidth > W) paddleX = W - paddleWidth;

  // 描画（奥 → 手前）
  ctx.clearRect(0, 0, W, H);
  drawBackground();   // 1. bg.png
  drawHiddenImage();  // 2. hidden.png
  drawBricks();       // 3. ブロック
  drawBall();         // 4. ball.png
  drawPaddle();       // 5. paddle.png

  // ブロックとの衝突（全破壊でクリア）
  collisionDetection();
  if (isGameCleared) {
    handleClear();
    return; // draw ループ停止
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
  else if (y - ballRadius > H) {
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

  // ユーザー操作の中で全Audioを解錠 → BGM再生
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
  e.preventDefault(); // 直後の合成clickを防ぐ
  startGame();
}, { passive: false });

// 画面の向きが変わったらレイアウト再計算のためリロード（ゲーム中のみ）
window.addEventListener("orientationchange", () => {
  if (isGameStarted && !isGameCleared) location.reload();
});