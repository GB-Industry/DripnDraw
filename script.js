class RainWindow {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // 서리 및 지우기 레이어 처리를 위한 메모리 전용(Offscreen) 캔버스
    this.frostCanvas = document.createElement('canvas');
    this.frostCtx = this.frostCanvas.getContext('2d');

    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this.currentTool = 'finger';
    this.brushRadius = 28;

    this.clearedPills = [];
    this.frostDelayMs = 8000;
    this.fadeDurationMs = 3500;

    this.staticDrops = [];
    this.movingDrops = [];

    // 카페 야경 고화질 이미지
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
    this.generateDrops();
    this.startAnimationLoop();
  }

  resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.canvas.width = w;
    this.canvas.height = h;

    this.frostCanvas.width = w;
    this.frostCanvas.height = h;

    this.generateDrops();
  }

  generateDrops() {
    this.staticDrops = [];
    this.movingDrops = [];

    const cellSize = 16;
    const cols = Math.ceil(this.canvas.width / cellSize);
    const rows = Math.ceil(this.canvas.height / cellSize);

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = (c + Math.random()) * cellSize;
        const y = (r + Math.random()) * cellSize;

        const rand = Math.random();
        let radius, maxAlpha;

        if (rand < 0.65) {
          radius = Math.random() * 1.0 + 0.6;
          maxAlpha = Math.random() * 0.35 + 0.25;
        } else if (rand < 0.92) {
          radius = Math.random() * 2.0 + 1.4;
          maxAlpha = Math.random() * 0.45 + 0.35;
        } else {
          radius = Math.random() * 3.0 + 2.5;
          maxAlpha = Math.random() * 0.5 + 0.4;
        }

        this.staticDrops.push({
          x, y, r: radius, alpha: maxAlpha,
          rx: radius * (Math.random() * 0.35 + 0.85),
          ry: radius * (Math.random() * 0.35 + 0.85),
          isFading: false
        });
      }
    }

    for (let i = 0; i < 28; i++) {
      this.movingDrops.push(this.createMovingDrop());
    }
  }

  createMovingDrop() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height - this.canvas.height,
      r: Math.random() * 3.2 + 3.2,
      speed: Math.random() * 2.5 + 1.4,
      trail: [],
      isWaiting: false,
      waitTimer: 0,
      maxWait: Math.random() * 50 + 10
    };
  }

  startAnimationLoop() {
    const render = (timestamp) => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // 1. 선명한 배경 이미지 그리기 (항상 맨 밑바탕에 유지)
      this.drawNightBackground();

      // 2. 오프스크린 캔버스에 서리 레이어를 만들고 손자국 뚫기
      this.renderFrostOffscreen(timestamp);

      // 3. 서리 레이어를 메인 캔버스 위에 합성
      this.ctx.drawImage(this.frostCanvas, 0, 0);

      // 4. 최상단 물방울 렌더링
      this.updateAndDrawStaticDrops();
      this.updateAndDrawMovingDrops();

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }

  // 선명한 창밖 카페 야경 배경
  drawNightBackground() {
    if (this.bgLoaded) {
      const scale = Math.max(this.canvas.width / this.bgImage.width, this.canvas.height / this.bgImage.height);
      const x = (this.canvas.width / 2) - (this.bgImage.width / 2) * scale;
      const y = (this.canvas.height / 2) - (this.bgImage.height / 2) * scale;

      this.ctx.drawImage(this.bgImage, x, y, this.bgImage.width * scale, this.bgImage.height * scale);
    } else {
      const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      grad.addColorStop(0, '#0a1118');
      grad.addColorStop(0.5, '#121e2b');
      grad.addColorStop(1, '#080d14');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // 별도 서리 전용 오프스크린 연산 (배경을 훼손하지 않음)
  // 1. 오프스크린 서리 레이어 연산 (시간 지나도 지워지지 않고 자국 유지)
  renderFrostOffscreen(now) {
    const fCtx = this.frostCtx;
    const w = this.frostCanvas.width;
    const h = this.frostCanvas.height;

    fCtx.clearRect(0, 0, w, h);

    // 뽀얀 유리창 서리 필름
    fCtx.save();
    fCtx.fillStyle = 'rgba(175, 198, 215, 0.78)';
    fCtx.fillRect(0, 0, w, h);

    // 오프스크린 서리 레이어에 destination-out 처리
    fCtx.globalCompositeOperation = 'destination-out';

    let len = this.clearedPills.length;
    for (let i = len - 1; i >= 0; i--) {
      const pill = this.clearedPills[i];

      // 고정 투명도 적용 (자동 타이머 연산 제거)
      // 0.85로 설정하여 닦아낸 곳에 15% 정도의 옅은 서리 잔여 자국 유지
      const maxEraseAlpha = 0.85;

      const grad = fCtx.createRadialGradient(
        pill.x, pill.y, 0,
        pill.x, pill.y, pill.radius
      );
      grad.addColorStop(0, `rgba(0, 0, 0, ${maxEraseAlpha})`);
      grad.addColorStop(0.6, `rgba(0, 0, 0, ${maxEraseAlpha * 0.75})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      fCtx.beginPath();
      fCtx.arc(pill.x, pill.y, pill.radius, 0, Math.PI * 2);
      fCtx.fillStyle = grad;
      fCtx.fill();
    }
    fCtx.restore();
  }

  // 2. Erase 연산에서 시간 기록 단순화
  erase(x, y, isMove = false) {
    const radius = this.brushRadius;

    const triggerFadeInRadius = (cx, cy) => {
      const minX = cx - radius;
      const maxX = cx + radius;
      const minY = cy - radius;
      const maxY = cy + radius;

      const len = this.staticDrops.length;
      for (let i = 0; i < len; i++) {
        const drop = this.staticDrops[i];
        if (drop.isFading) continue;

        if (drop.x >= minX && drop.x <= maxX && drop.y >= minY && drop.y <= maxY) {
          const dx = drop.x - cx;
          const dy = drop.y - cy;
          if (dx * dx + dy * dy <= radius * radius) {
            drop.isFading = true;
          }
        }
      }
    };

    const addPill = (px, py) => {
      // 시간 기록 없이 좌표와 반지름만 저장
      this.clearedPills.push({ x: px, y: py, radius });
      triggerFadeInRadius(px, py);
    };

    if (isMove) {
      const dist = Math.hypot(x - this.lastX, y - this.lastY);
      const steps = Math.ceil(dist / 3);
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

  // 2. Breath(입김) 도구 연산 (닦아낸 자국을 지우고 다시 서리를 차오르게 함)
  steamRefrost(x, y) {
    const steamRadius = 50;
    const len = this.clearedPills.length;

    for (let i = len - 1; i >= 0; i--) {
      const pill = this.clearedPills[i];
      const dx = pill.x - x;
      const dy = pill.y - y;

      // 입김 범위 내에 있는 닦은 자국 기록을 제거하여 서리 복원
      if (dx * dx + dy * dy <= steamRadius * steamRadius) {
        this.clearedPills[i] = this.clearedPills[this.clearedPills.length - 1];
        this.clearedPills.pop();
      }
    }
  }

  updateAndDrawStaticDrops() {
    const len = this.staticDrops.length;
    for (let i = len - 1; i >= 0; i--) {
      const drop = this.staticDrops[i];

      if (drop.isFading) {
        drop.alpha -= 0.02;
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
      this.ctx.fillStyle = `rgba(255, 255, 255, ${a * 1.2})`;
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
        if (Math.random() < 0.015) {
          drop.isWaiting = true;
        } else {
          drop.x += (Math.random() - 0.5) * 0.5;
          drop.y += drop.speed;

          drop.trail.push({
            x: drop.x + (Math.random() - 0.5) * 1.2,
            y: drop.y - drop.r * 0.5,
            r: Math.random() * (drop.r * 0.4) + drop.r * 0.2,
            alpha: 0.45
          });
        }
      }

      const tLen = drop.trail.length;
      for (let i = tLen - 1; i >= 0; i--) {
        const t = drop.trail[i];
        t.alpha -= 0.0018;

        if (t.alpha <= 0) {
          drop.trail[i] = drop.trail[drop.trail.length - 1];
          drop.trail.pop();
          continue;
        }

        this.ctx.beginPath();
        this.ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(220, 235, 245, ${t.alpha * 0.4})`;
        this.ctx.fill();
      }

      this.ctx.beginPath();
      this.ctx.ellipse(drop.x, drop.y, drop.r * 0.8, drop.r * 1.2, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(210, 230, 245, 0.3)';
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(drop.x - drop.r * 0.25, drop.y - drop.r * 0.3, drop.r * 0.35, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      this.ctx.fill();

      if (drop.y > this.canvas.height + 20) {
        const remainingTrail = drop.trail;
        Object.assign(drop, this.createMovingDrop(), { y: -10, trail: remainingTrail });
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

  // 1. 손가락 닦아내기: 생성된 시간(time)을 함께 저장
  erase(x, y, isMove = false) {
    const radius = this.brushRadius;
    const now = performance.now();

    const triggerFadeInRadius = (cx, cy) => {
      const minX = cx - radius;
      const maxX = cx + radius;
      const minY = cy - radius;
      const maxY = cy + radius;

      const len = this.staticDrops.length;
      for (let i = 0; i < len; i++) {
        const drop = this.staticDrops[i];
        if (drop.isFading) continue;

        if (drop.x >= minX && drop.x <= maxX && drop.y >= minY && drop.y <= maxY) {
          const dx = drop.x - cx;
          const dy = drop.y - cy;
          if (dx * dx + dy * dy <= radius * radius) {
            drop.isFading = true;
          }
        }
      }
    };

    const addPill = (px, py) => {
      // 그려진 시점의 타임스탬프(now) 저장
      this.clearedPills.push({ x: px, y: py, radius, time: now });
      triggerFadeInRadius(px, py);
    };

    if (isMove) {
      const dist = Math.hypot(x - this.lastX, y - this.lastY);
      const steps = Math.ceil(dist / 3);
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

  // 2. 오프스크린 서리 렌더링: 시간 경과에 따라 서리가 스멀스멀 복원되는 연산
  renderFrostOffscreen(now) {
    const fCtx = this.frostCtx;
    const w = this.frostCanvas.width;
    const h = this.frostCanvas.height;

    fCtx.clearRect(0, 0, w, h);

    // 뽀얀 유리창 서리 필름
    fCtx.save();
    fCtx.fillStyle = 'rgba(175, 198, 215, 0.78)';
    fCtx.fillRect(0, 0, w, h);

    // 오프스크린 서리 레이어에 destination-out 처리
    fCtx.globalCompositeOperation = 'destination-out';

    // 타이머 설정 (밀리초 단위)
    const holdTimeMs = 6000;    // 닦고 나서 선명함이 유지되는 시간 (6초)
    const fadeDurationMs = 14000; // 서리가 완전히 차오르기까지 걸리는 시간 (14초)

    let len = this.clearedPills.length;
    for (let i = len - 1; i >= 0; i--) {
      const pill = this.clearedPills[i];
      const elapsed = now - pill.time;

      let maxEraseAlpha = 0.85; // 기본 닦임 강도 (15% 잔여 자국)

      // 6초가 지난 시점부터 천천히 서리가 차오름
      if (elapsed > holdTimeMs) {
        const fadeProgress = (elapsed - holdTimeMs) / fadeDurationMs;
        maxEraseAlpha = 0.85 * (1 - Math.min(1, fadeProgress));
      }

      // 서리가 완전히 다 차오르면 배열에서 제거하여 성능 최적화
      if (maxEraseAlpha <= 0) {
        this.clearedPills[i] = this.clearedPills[this.clearedPills.length - 1];
        this.clearedPills.pop();
        continue;
      }

      const grad = fCtx.createRadialGradient(
        pill.x, pill.y, 0,
        pill.x, pill.y, pill.radius
      );
      grad.addColorStop(0, `rgba(0, 0, 0, ${maxEraseAlpha})`);
      grad.addColorStop(0.6, `rgba(0, 0, 0, ${maxEraseAlpha * 0.75})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      fCtx.beginPath();
      fCtx.arc(pill.x, pill.y, pill.radius, 0, Math.PI * 2);
      fCtx.fillStyle = grad;
      fCtx.fill();
    }
    fCtx.restore();
  }

  // Breath(입김): 스치면 즉시 서리가 다시 차오르는 원래 로직으로 복원
  steamRefrost(x, y) {
    const steamRadius = 50; 
    const len = this.clearedPills.length;

    for (let i = len - 1; i >= 0; i--) {
      const pill = this.clearedPills[i];
      const dx = pill.x - x;
      const dy = pill.y - y;

      // 지정한 범위(50px) 내의 닦인 자국을 한 번에 제거하여 서리 복원
      if (dx * dx + dy * dy <= steamRadius * steamRadius) {
        this.clearedPills[i] = this.clearedPills[this.clearedPills.length - 1];
        this.clearedPills.pop();
      }
    }
  }

  startDrawing(e) {
    if (e.target.closest('.menu-container')) return;

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
    
    // bindUIEvents() 내부 하단에 추가
    const exportBtn = document.getElementById('btn-export');
const flashOverlay = document.getElementById('flash-overlay');

if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    // 1. 밝은 플래시 연출 시작
    if (flashOverlay) {
      flashOverlay.classList.add('flash');
      
      // 더 여유 있게 정점을 유지한 후 천천히 꺼짐
      setTimeout(() => {
        flashOverlay.classList.remove('flash');
      }, 180);
    }

    // 2. 가장 밝아진 타이밍에 이미지 저장
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
  // 1. 박스 클릭 시 파일 탐색기 창 열기
  dropBox.addEventListener('click', () => {
    fileInput.click();
  });

  // 2. 파일 탐색기에서 파일을 직접 선택했을 때
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      this.handleImageFile(files[0], dropText);
    }
  });

  // 3. 브라우저 기본 파일 열기 기본 동작 방지
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  // 4. 드래그 진입/체류 시 시각 효과
  ['dragenter', 'dragover'].forEach(eventName => {
    dropBox.addEventListener(eventName, () => {
      dropBox.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropBox.addEventListener(eventName, () => {
      dropBox.classList.remove('drag-over');
    }, false);
  });

  // 5. 드래그 앤 드롭으로 파일을 떨어뜨렸을 때
  dropBox.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      this.handleImageFile(files[0], dropText);
    }
  });
}
  }
  // 1. 이미지 파일 처리 최적화 (유효성 검사 및 로드 통합)
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

      this.drawBackground?.();
      URL.revokeObjectURL(imageUrl);
    };

    img.onerror = () => {
      alert('이미지를 불러오는 데 실패했습니다.');
      URL.revokeObjectURL(imageUrl);
    };

    img.src = imageUrl;
  }

  // 2. 화면 비율 맞춤 렌더링 최적화 (연산 간소화)
  drawBackground() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (!this.bgLoaded || !this.bgImage) {
      this.ctx.fillStyle = '#0d131a';
      this.ctx.fillRect(0, 0, this.width, this.height);
      return;
    }

    const imgRatio = this.bgImage.width / this.bgImage.height;
    const canvasRatio = this.width / this.height;
    let w = this.width, h = this.height, x = 0, y = 0;

    // ⭐ Cover (잘라서 꽉 채우기) 대신 Contain (전체가 다 보이게 맞추기) 적용
    if (imgRatio > canvasRatio) {
      // 이미지가 더 가로로 긴 경우 -> 가로에 맞추고 세로 여백은 위아래로 분배
      h = w / imgRatio;
      y = (this.height - h) / 2;
    } else {
      // 이미지가 더 세로로 긴 경우 -> 세로에 맞추고 가로 여백은 양옆으로 분배
      w = h * imgRatio;
      x = (this.width - w) / 2;
    }

    // 1단계: 빈 공간(여백)을 채울 깔끔한 배경색 지정 (예: 어두운 감성 배경색)
    this.ctx.fillStyle = '#0d131a';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 2단계: 그림이 잘리지 않도록 전체 비율에 맞춰 그리기
    this.ctx.drawImage(this.bgImage, x, y, w, h);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  new RainWindow('frost-canvas');
});