class RainWindow {
  constructor(canvasId) {
    this.canvas = document.getElementById('frost-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.fadePills = []; // 다시 서리가 차오를 영역 관리

    // 서리 레이어 전용 오프스크린 캔버스
    this.frostCanvas = document.createElement('canvas');
    this.frostCtx = this.frostCanvas.getContext('2d');

    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this.currentTool = 'finger';
    this.brushRadius = 28;

    this.staticDrops = [];
    this.movingDrops = [];

    // 배경 이미지 로드
    this.bgImage = new Image();
    this.bgImage.crossOrigin = 'Anonymous';
    this.bgImage.src = './background2.png';
    this.bgLoaded = false;

    this.bgImage.onload = () => {
      this.bgLoaded = true;
    };

    this.init();
  }

  init() {
    this.resizeCanvas();
    this.bindEvents();
    this.bindUIEvents();
    this.startAnimationLoop();
  }

  resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // 고해상도 과부하 방지

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.frostCanvas.width = w * dpr;
    this.frostCanvas.height = h * dpr;

    this.ctx.scale(dpr, dpr);
    this.frostCtx.scale(dpr, dpr);

    // 캔버스 크기 변경 시 서리 기본 바탕 생성
    this.resetFrostLayer();
    this.generateDrops();
  }
  

  // 기본 서리 바탕 1회 채우기
  resetFrostLayer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fCtx = this.frostCtx;

    fCtx.save();
    fCtx.clearRect(0, 0, w, h);
    fCtx.fillStyle = 'rgba(175, 198, 215, 0.78)';
    fCtx.fillRect(0, 0, w, h);
    fCtx.restore();
  }

  generateDrops() {
    this.staticDrops = [];
    this.movingDrops = [];

    const w = window.innerWidth;
    const h = window.innerHeight;

    // 정적 물방울 개수 최적화 (격자 크기 확대)
    const cellSize = 28;
    const cols = Math.ceil(w / cellSize);
    const rows = Math.ceil(h / cellSize);

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (Math.random() > 0.6) continue; // 물방울 밀도 조절로 렌더링 경량화

        const x = (c + Math.random()) * cellSize;
        const y = (r + Math.random()) * cellSize;
        const radius = Math.random() * 1.8 + 0.8;

        this.staticDrops.push({
          x, y, r: radius,
          alpha: Math.random() * 0.4 + 0.3,
          rx: radius * (Math.random() * 0.3 + 0.85),
          ry: radius * (Math.random() * 0.3 + 0.85),
          isFading: false
        });
      }
    }

    // 흘러내리는 물방울 수 축소 (28개 -> 12개)
    for (let i = 0; i < 12; i++) {
      this.movingDrops.push(this.createMovingDrop());
    }
  }

  createMovingDrop() {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight - window.innerHeight,
      r: Math.random() * 2.5 + 2.5,
      speed: Math.random() * 2.0 + 1.2,
      trail: [],
      isWaiting: false,
      waitTimer: 0,
      maxWait: Math.random() * 40 + 10
    };
  }

  startAnimationLoop() {
    const render = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      this.ctx.clearRect(0, 0, w, h);
      // 서리 자동 복원 처리
      this.updateRefrost();

      // 1. 배경 연산
      this.drawNightBackground();

      // 2. 오프스크린 캔버스에 기록되어 있는 서리 레이어 합성
      this.ctx.drawImage(this.frostCanvas, 0, 0, w, h);

      // 3. 최상단 물방울만 매 프레임 업데이트
      this.updateAndDrawStaticDrops();
      this.updateAndDrawMovingDrops();

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }

  drawNightBackground() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (this.bgLoaded) {
      const scale = Math.max(w / this.bgImage.width, h / this.bgImage.height);
      const x = (w / 2) - (this.bgImage.width / 2) * scale;
      const y = (h / 2) - (this.bgImage.height / 2) * scale;

      this.ctx.drawImage(this.bgImage, x, y, this.bgImage.width * scale, this.bgImage.height * scale);
    } else {
      this.ctx.fillStyle = '#0d131a';
      this.ctx.fillRect(0, 0, w, h);
    }
  }

  // 💡 [최적화 핵심] 매 프레임 재연산 대신, 손으로 문지를 때만 서리 오프스크린에 바로 구멍 뚫기
  erase(x, y, isMove = false) {
  const radius = this.brushRadius;
  const now = Date.now();

  const addPill = (cx, cy) => {
    // 뚫린 자국 정보 저장 (생성 시간 now)
    this.fadePills.push({
      x: cx,
      y: cy,
      radius: radius,
      time: now
    });

    // 주변 static 물방울 투명화 처리
    const len = this.staticDrops.length;
    for (let i = 0; i < len; i++) {
      const drop = this.staticDrops[i];
      if (!drop.isFading && Math.hypot(drop.x - cx, drop.y - cy) <= radius) {
        drop.isFading = true;
      }
    }
  };

  if (isMove) {
    const dist = Math.hypot(x - this.lastX, y - this.lastY);
    const steps = Math.ceil(dist / 4);
    for (let i = 0; i < steps; i++) {
      const currX = this.lastX + (x - this.lastX) * (i / steps);
      const currY = this.lastY + (y - this.lastY) * (i / steps);
      addPill(currX, currY);
    }
  } else {
    addPill(x, y);
  }

  this.lastX = x;
  this.lastY = y;
}

updateRefrost() {
  const fCtx = this.frostCtx;
  const w = window.innerWidth;
  const h = window.innerHeight;

  // 1. 오프스크린 캔버스를 기본 서리 바탕으로 초기화
  fCtx.save();
  fCtx.globalCompositeOperation = 'source-over';
  fCtx.clearRect(0, 0, w, h);
  fCtx.fillStyle = 'rgba(175, 198, 215, 0.78)';
  fCtx.fillRect(0, 0, w, h);

  if (this.fadePills.length === 0) {
    fCtx.restore();
    return;
  }

  const now = Date.now();
  const holdTime = 5000;     // 5초 유지
  const fadeDuration = 8000; // 8초 동안 자연스럽게 구멍이 좁혀지며 사라짐

  // 2. destination-out 모드로 유효한 자국들만 뚫어주기
  fCtx.globalCompositeOperation = 'destination-out';

  for (let i = this.fadePills.length - 1; i >= 0; i--) {
    const pill = this.fadePills[i];
    const elapsed = now - pill.time;

    let alpha = 1.0;
    let currentRadius = pill.radius;

    if (elapsed > holdTime) {
      const progress = (elapsed - holdTime) / fadeDuration;

      if (progress >= 1) {
        // 수명이 다한 자국은 제거
        this.fadePills.splice(i, 1);
        continue;
      }

      // 시간이 지날수록 알파값과 반지름을 줄여 자연스럽게 서리가 차오르는 효과
      alpha = 1.0 - progress;
      currentRadius = pill.radius * (1.0 - progress * 0.3);
    }

    const grad = fCtx.createRadialGradient(
      pill.x, pill.y, 0,
      pill.x, pill.y, currentRadius
    );
    grad.addColorStop(0, `rgba(0, 0, 0, ${0.95 * alpha})`);
    grad.addColorStop(0.7, `rgba(0, 0, 0, ${0.8 * alpha})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fCtx.fillStyle = grad;
    fCtx.beginPath();
    fCtx.arc(pill.x, pill.y, currentRadius, 0, Math.PI * 2);
    fCtx.fill();
  }

  fCtx.restore();
}

  // 입김 도구: 닦아낸 영역에 다시 뽀얀 서리 복원하기
  steamRefrost(x, y) {
    const radius = 45;
    const fCtx = this.frostCtx;

    fCtx.save();
    fCtx.globalCompositeOperation = 'source-over';

    const grad = fCtx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, 'rgba(175, 198, 215, 0.25)');
    grad.addColorStop(0.8, 'rgba(175, 198, 215, 0.1)');
    grad.addColorStop(1, 'rgba(175, 198, 215, 0)');

    fCtx.fillStyle = grad;
    fCtx.beginPath();
    fCtx.arc(x, y, radius, 0, Math.PI * 2);
    fCtx.fill();
    fCtx.restore();
  }

  updateAndDrawStaticDrops() {
    const len = this.staticDrops.length;
    for (let i = len - 1; i >= 0; i--) {
      const drop = this.staticDrops[i];

      if (drop.isFading) {
        drop.alpha -= 0.03;
        if (drop.alpha <= 0) {
          this.staticDrops[i] = this.staticDrops[this.staticDrops.length - 1];
          this.staticDrops.pop();
          continue;
        }
      }

      const a = drop.alpha;
      this.ctx.beginPath();
      this.ctx.ellipse(drop.x, drop.y, drop.rx, drop.ry, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(10, 20, 30, ${a * 0.35})`;
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(drop.x - drop.r * 0.25, drop.y - drop.r * 0.25, drop.r * 0.3, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${a * 1.1})`;
      this.ctx.fill();
    }
  }

  updateAndDrawMovingDrops() {
    const len = this.movingDrops.length;
    for (let d = 0; d < len; d++) {
      const drop = this.movingDrops[d];

      if (drop.isWaiting) {
        drop.waitTimer++;
        if (drop.waitTimer > drop.maxWait) {
          drop.isWaiting = false;
          drop.waitTimer = 0;
        }
      } else {
        drop.x += (Math.random() - 0.5) * 0.4;
        drop.y += drop.speed;

        if (Math.random() < 0.3) {
          drop.trail.push({
            x: drop.x,
            y: drop.y - drop.r * 0.5,
            r: drop.r * 0.3,
            alpha: 0.35
          });
        }
      }

      // 궤적 연산
      for (let i = drop.trail.length - 1; i >= 0; i--) {
        const t = drop.trail[i];
        t.alpha -= 0.005;

        if (t.alpha <= 0) {
          drop.trail.splice(i, 1);
          continue;
        }

        this.ctx.beginPath();
        this.ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(220, 235, 245, ${t.alpha})`;
        this.ctx.fill();
      }

      // 메인 물방울
      this.ctx.beginPath();
      this.ctx.ellipse(drop.x, drop.y, drop.r * 0.8, drop.r * 1.2, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(210, 230, 245, 0.35)';
      this.ctx.fill();

      if (drop.y > window.innerHeight + 20) {
        Object.assign(drop, this.createMovingDrop(), { y: -10, trail: [] });
      }
    }
  }

  handleAction(x, y, isMove = false) {
    if (this.currentTool === 'finger') {
      this.erase(x, y, isMove);
    } else if (this.currentTool === 'breath') {
      this.steamRefrost(x, y);
    }
  }

  startDrawing(e) {
    const dropdownMenu = document.getElementById('dropdown-menu');
    const isMenuOpen = dropdownMenu && !dropdownMenu.classList.contains('hidden');

    if (isMenuOpen || e.target.closest('.hamburger-btn')) return;

    this.isDrawing = true;
    const { x, y } = this.getCoordinates(e);
    this.lastX = x;
    this.lastY = y;
    this.handleAction(x, y);
  }

  draw(e) {
    if (!this.isDrawing) return;
    const { x, y } = this.getCoordinates(e);
    this.handleAction(x, y, true);
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  getCoordinates(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    window.addEventListener('mouseup', () => this.stopDrawing());

    this.canvas.addEventListener('touchstart', (e) => this.startDrawing(e), { passive: true });
    this.canvas.addEventListener('touchmove', (e) => this.draw(e), { passive: true });
    window.addEventListener('touchend', () => this.stopDrawing());

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  bindUIEvents() {
    const menuToggle = document.getElementById('menu-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');

    if (menuToggle && dropdownMenu) {
      menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('open');
        dropdownMenu.classList.toggle('hidden');
      });
    }

    const toolFinger = document.getElementById('tool-finger');
    const toolBreath = document.getElementById('tool-breath');
    const fingerOptions = document.getElementById('finger-options');
    const breathOptions = document.getElementById('breath-options');

    if (toolFinger && toolBreath) {
      toolFinger.addEventListener('click', () => {
        this.currentTool = 'finger';
        toolFinger.classList.add('active');
        toolBreath.classList.remove('active');
        fingerOptions.classList.remove('hidden');
        breathOptions.classList.add('hidden');
      });

      toolBreath.addEventListener('click', () => {
        this.currentTool = 'breath';
        toolBreath.classList.add('active');
        toolFinger.classList.remove('active');
        breathOptions.classList.remove('hidden');
        fingerOptions.classList.add('hidden');
      });
    }

    const brushSizeInput = document.getElementById('brush-size');
    if (brushSizeInput) {
      brushSizeInput.addEventListener('input', (e) => {
        this.brushRadius = parseInt(e.target.value, 10);
      });
    }

    const exportBtn = document.getElementById('btn-export');
    const flashOverlay = document.getElementById('flash-overlay');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (flashOverlay) {
          flashOverlay.classList.add('flash');
          setTimeout(() => flashOverlay.classList.remove('flash'), 180);
        }

        setTimeout(() => {
          const imageURI = this.canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = `DripnDraw-${Date.now()}.png`;
          link.href = imageURI;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, 120);
      });
    }

    const dropBox = document.getElementById('bg-drop-zone');
    const fileInput = document.getElementById('bg-file-input');
    const dropText = document.getElementById('drop-text');

    if (dropBox && fileInput) {
      dropBox.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) this.handleImageFile(files[0], dropText);
      });

      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropBox.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropBox.addEventListener(eventName, () => dropBox.classList.add('drag-over'), false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropBox.addEventListener(eventName, () => dropBox.classList.remove('drag-over'), false);
      });

      dropBox.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) this.handleImageFile(files[0], dropText);
      });
    }
  }

  handleImageFile(file, textElement) {
    if (!file || !file.type.startsWith('image/')) {
      alert('이미지 파일만 배경으로 지정할 수 있습니다.');
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      this.bgImage = img;
      this.bgLoaded = true;

      if (textElement) {
        const name = file.name;
        textElement.textContent = `✅ ${name.length > 15 ? name.slice(0, 12) + '...' : name}`;
      }
      URL.revokeObjectURL(imageUrl);
    };

    img.onerror = () => {
      alert('이미지를 불러오는 데 실패했습니다.');
      URL.revokeObjectURL(imageUrl);
    };

    img.src = imageUrl;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new RainWindow('frost-canvas');
});