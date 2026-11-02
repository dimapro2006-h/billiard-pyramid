'use strict';
(() => {
  // ================== Реальні розміри (усе в міліметрах) ==================
  const L = 2540, WD = 1270;         // ігрове поле 2.54 × 1.27 м
  const R = 33.5;                    // куля Ø 67 мм
  const BALL_MASS = 0.27;            // кг; у всіх куль однакова, тому в зіткненнях скорочується
  const CUSH = 45, WOOD = 95, RAIL = CUSH + WOOD;
  const CORNER_MOUTH = 72, MID_MOUTH = 82;     // створи луз (найвужче місце між губками)
  const RJ = 10;                     // радіус заокруглення губок кутової лузи
  const RM = 25;                     // радіус заокруглення губок середньої лузи
  const XS = (CORNER_MOUTH + 2 * RJ) / Math.SQRT2 - RJ; // де борт переходить у губку кутової лузи
  const XM = MID_MOUTH / 2 + RM;     // те саме для середньої (від центру лузи)
  const CUSH_H = 0.27;               // носик борту вище центру кулі (42.5 мм над сукном), у частках R
  const KITCHEN_X = L / 4;           // лінія дому
  const FOOT_X = L * 3 / 4;          // задня позначка (вершина піраміди)

  // ================== Фізичні параметри ==================
  const GRAV = 9810;                 // мм/с²
  const MU_SLIDE = 0.2;              // тертя ковзання куля–сукно
  const MU_ROLL = 0.007;             // опір коченню по сукну — куля рівномірно сповільнюється
  const K_DRAG = 0.105;              // додаткові втрати на великій швидкості (ворс сукна)
  const SPIN_DECAY = 25;             // гальмування бічного гвинта, рад/с²
  const MU_CUSH = 0.18, MU_BALL = 0.06;
  const E_BALL = 0.93, E_CUSH = 0.78;
  const CUSH_BOOST = Math.sqrt(1.3);  // борти на 30% пружніші: віддають на 30% більше енергії
  const DT = 1 / 720;
  const VMIN = 200, VMAX = 7500;     // швидкість удару, мм/с
  const DROP = 0.45 * R;             // наскільки центр кулі має зайти за створ, щоб упасти
  const WIN = 8;
  const powerToSpeed = p => VMIN + (VMAX - VMIN) * Math.pow(p, 1.7);
  const speedToPower = v => Math.pow(Math.max(0, Math.min(1, (v - VMIN) / (VMAX - VMIN))), 1 / 1.7);

  // ================== Геометрія бортів і луз ==================
  // Як на справжньому російському столі: борт закінчується заокругленою губкою.
  // Кутова луза: губки зрізані під 45° і йдуть паралельним каналом шириною 72 мм.
  // Середня: великі заокруглення, сама луза — за лінією борту, канал 82 мм.
  const SEGS = [], CIRCLES = [], CUSHIONS = [], POCKETS = [];
  (function buildTable() {
    const S2 = Math.SQRT1_2;
    const arc = (cx, cy, r, a0, a1) => {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = a0 + (a1 - a0) * i / 10; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      return pts;
    };
    // Базові фігури для верхнього лівого кута (y < 0 — у борт)
    const cC = [XS, -RJ];                                   // центр заокруглення кутової губки
    const cT = [XS - RJ * S2, -RJ + RJ * S2];               // де заокруглення переходить у стінку каналу
    const cE = [cT[0] - (CUSH + cT[1]), -CUSH];             // кінець стінки (уздовж діагоналі)
    const cArc = arc(cC[0], cC[1], RJ, Math.PI * 0.75, Math.PI * 0.5);
    const mC = [L / 2 - XM, -RM];                           // центр заокруглення середньої губки
    const mT = [L / 2 - XM + RM, -RM], mE = [L / 2 - XM + RM, -CUSH];
    const mArc = arc(mC[0], mC[1], RM, Math.PI * 0.5, 0);
    const sw = p => [p[1], p[0]];

    const longPoly = [cE, ...cArc, [L / 2 - XM, 0], ...mArc, mE];
    const shortPoly = [sw(cE), ...cArc.map(sw), [0, WD / 2], [-CUSH, WD / 2]];
    const longSegs = [[cE, cT], [[XS, 0], [L / 2 - XM, 0]], [mT, mE]];
    const shortSegs = [[sw(cE), sw(cT)], [[0, XS], [0, WD / 2]]];

    const tf = [(x, y) => [x, y], (x, y) => [L - x, y], (x, y) => [x, WD - y], (x, y) => [L - x, WD - y]];
    for (const f of tf) {
      const F = p => f(p[0], p[1]);
      CUSHIONS.push(longPoly.map(F), shortPoly.map(F));
      for (const [a, b] of [...longSegs, ...shortSegs]) {
        const A = F(a), B = F(b);
        SEGS.push({ ax: A[0], ay: A[1], bx: B[0], by: B[1] });
      }
      for (const [c, r] of [[cC, RJ], [sw(cC), RJ], [mC, RM]]) { const C = F(c); CIRCLES.push({ x: C[0], y: C[1], r }); }
      const k = (XS - RJ) / 2; // центр створу кутової лузи
      const h = f(-8, -8), m = f(k, k), aim = f(k - 0.6 * R * S2, k - 0.6 * R * S2), corner = f(0, 0);
      const nl = Math.hypot(corner[0] - m[0], corner[1] - m[1]);
      POCKETS.push({ x: h[0], y: h[1], r: 44, mx: m[0], my: m[1], nx: (corner[0] - m[0]) / nl, ny: (corner[1] - m[1]) / nl, ax: aim[0], ay: aim[1], mid: false, cx: corner[0], cy: corner[1], cr: 48 });
    }
    for (const y of [0, WD]) {
      const s = y ? 1 : -1;
      POCKETS.push({ x: L / 2, y: y + s * (RM + 18), r: 42, mx: L / 2, my: y + s * RM, nx: 0, ny: s, ax: L / 2, ay: y + s * (RM + 15), mid: true });
    }
  })();

  // ================== Фізика ==================
  // Осі: x — праворуч, y — вниз по екрану, z — у стіл. ω = (wx, wy, wz).
  // Швидкість точки дотику до сукна: u = v + ω × (0,0,R) = (vx + R·wy, vy − R·wx).
  function newEvents(striker) {
    return { striker, first: -1, cushion: false, pocketed: [] };
  }

  const isMoving = b => b.vx || b.vy || b.wx || b.wy;

  function moveBall(b) {
    const ux = b.vx + R * b.wy, uy = b.vy - R * b.wx;
    const us = Math.hypot(ux, uy);
    if (us > 1) {
      // ковзання: тертя гальмує кулю і закручує її, поки не почне котитися
      const dec = MU_SLIDE * GRAV * DT;
      const f = Math.min(1, us / (3.5 * dec));
      const Fx = -ux / us * dec * f, Fy = -uy / us * dec * f;
      b.vx += Fx; b.vy += Fy;
      b.wx -= Fy * 2.5 / R; b.wy += Fx * 2.5 / R;
    } else if (b.vx || b.vy) {
      // чисте кочення
      const sp = Math.hypot(b.vx, b.vy);
      const ns = sp - (MU_ROLL * GRAV + K_DRAG * sp) * DT;
      if (ns < 8) { b.vx = b.vy = 0; }
      else { const k = ns / sp; b.vx *= k; b.vy *= k; }
      b.wx = b.vy / R; b.wy = -b.vx / R;
    } else {
      b.wx = b.wy = 0;
    }
    if (b.wz) {
      const d = SPIN_DECAY * DT;
      b.wz = Math.abs(b.wz) <= d ? 0 : b.wz - Math.sign(b.wz) * d;
    }
    if (!isMoving(b)) b.wz = 0;
    b.x += b.vx * DT; b.y += b.vy * DT;
  }

  // Δω від імпульсу J, прикладеного в точці r (відносно центру кулі)
  function addSpin(b, rx, ry, rz, jx, jy, jz) {
    const k = 2.5 / (R * R);
    b.wx += (ry * jz - rz * jy) * k;
    b.wy += (rz * jx - rx * jz) * k;
    b.wz += (rx * jy - ry * jx) * k;
  }

  // Тертя в точці дотику r: гасить ковзання, але не більше за μ·N (для кулі ефективна маса 2/7)
  function frictionAt(b, rx, ry, rz, nx, ny, nz, maxJ) {
    let cx = b.vx + b.wy * rz - b.wz * ry;
    let cy = b.vy + b.wz * rx - b.wx * rz;
    let cz = b.wx * ry - b.wy * rx;
    const cn = cx * nx + cy * ny + cz * nz;
    cx -= cn * nx; cy -= cn * ny; cz -= cn * nz;
    const sl = Math.hypot(cx, cy, cz);
    if (sl < 1e-6) return;
    const j = Math.min(maxJ, sl * 2 / 7);
    const jx = -cx / sl * j, jy = -cy / sl * j, jz = -cz / sl * j;
    b.vx += jx; b.vy += jy; // вертикальну складову забирає стіл
    addSpin(b, rx, ry, rz, jx, jy, jz);
  }

  // Удар об борт. n — нормаль від борту до кулі (горизонтальна).
  // Носик борту вищий за центр кулі, тому сила борту йде з нахилом униз (притискає кулю до сукна),
  // а тертя об гуму й сукно під час удару змінює накат/відтяжку та бічний гвинт.
  function cushionHit(b, nx, ny) {
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return 0;
    const s = CUSH_H, c = Math.sqrt(1 - s * s);
    const e = Math.min(0.95, Math.max(0.6, E_CUSH + 0.04 - 0.00004 * -vn) * CUSH_BOOST); // сильніший удар — більше втрат
    const Jh = (1 + e) * -vn;          // горизонтальна складова імпульсу борту
    const Jn = Jh / c;                 // повний імпульс уздовж лінії дотик→центр
    b.vx += nx * Jh; b.vy += ny * Jh;  // через центр кулі — без крутного моменту
    // тертя об гуму борту (точка дотику вище центру)
    frictionAt(b, -nx * R * c, -ny * R * c, -R * s, nx * c, ny * c, s, MU_CUSH * Jn);
    // тертя об сукно: борт додатково притискає кулю до столу
    frictionAt(b, 0, 0, R, 0, 0, -1, MU_SLIDE * Jn * s);
    return -vn;
  }

  function collideSeg(b, s) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    let t = ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s.ax + dx * t, qy = s.ay + dy * t;
    let nx = b.x - qx, ny = b.y - qy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= R * R || d2 === 0) return 0;
    const d = Math.sqrt(d2); nx /= d; ny /= d;
    b.x = qx + nx * R; b.y = qy + ny * R;
    return cushionHit(b, nx, ny);
  }

  function collideCircle(b, c) {
    let nx = b.x - c.x, ny = b.y - c.y;
    const rr = R + c.r, d2 = nx * nx + ny * ny;
    if (d2 >= rr * rr || d2 === 0) return 0;
    const d = Math.sqrt(d2); nx /= d; ny /= d;
    b.x = c.x + nx * rr; b.y = c.y + ny * rr;
    return cushionHit(b, nx, ny);
  }

  function collideBalls(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 >= 4 * R * R) return -1;
    const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
    const ov = (2 * R - d) / 2;
    a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
    const vr = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vr <= 0) return 0;
    const j = vr * (1 + E_BALL) / 2;
    a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
    // тертя між кулями (невеликий «підріз» прицільної кулі від гвинта і різання)
    const tx = -ny, ty = nx;
    const vt = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty + R * (a.wz + b.wz);
    const Jt = -Math.sign(vt) * Math.min(MU_BALL * j, Math.abs(vt) / 7);
    a.vx += tx * Jt; a.vy += ty * Jt; b.vx -= tx * Jt; b.vy -= ty * Jt;
    a.wz += 2.5 * Jt / R; b.wz += 2.5 * Jt / R;
    return vr;
  }

  // Один крок симуляції. fx — звуки/анімації (null у симуляції бота)
  function step(balls, ev, fx) {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.on && (isMoving(b) || b.wz)) moveBall(b);
    }
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (!b.on) continue;
        const vr = collideBalls(a, b);
        if (vr < 0) continue;
        if (ev.first < 0 && (i === ev.striker || j === ev.striker)) ev.first = i === ev.striker ? j : i;
        if (fx && vr > 0) fx.hit(vr);
      }
    }
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.on) continue;
      if (b.x > R + 1 && b.x < L - R - 1 && b.y > R + 1 && b.y < WD - R - 1) continue;
      for (let k = 0; k < SEGS.length + CIRCLES.length; k++) {
        const v = k < SEGS.length ? collideSeg(b, SEGS[k]) : collideCircle(b, CIRCLES[k - SEGS.length]);
        if (v > 0) {
          if (ev.first >= 0) ev.cushion = true;
          if (fx) fx.cushion(v);
        }
      }
      const out = b.x < -2 * R || b.x > L + 2 * R || b.y < -2 * R || b.y > WD + 2 * R;
      for (const p of POCKETS) {
        const depth = (b.x - p.mx) * p.nx + (b.y - p.my) * p.ny;
        const near = (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (p.r + 2 * R) ** 2;
        // виріз у плиті: центр кулі над ним — куля падає (так у кут заходить і куля, що котиться впритул до борту)
        const overCut = p.cr && (b.x - p.cx) ** 2 + (b.y - p.cy) ** 2 < p.cr * p.cr;
        if ((depth > DROP && near) || overCut || (out && near)) {
          b.on = false;
          ev.pocketed.push(i);
          if (fx) fx.pocket(i, p, Math.hypot(b.vx, b.vy));
          b.vx = b.vy = b.wx = b.wy = b.wz = 0;
          break;
        }
      }
    }
  }

  function stopped(balls) {
    for (const b of balls) if (b.on && isMoving(b)) return false;
    return true;
  }

  function isFoul(ev) {
    if (ev.first < 0) return 'Фол: биток не торкнувся жодної кулі';
    if (!ev.pocketed.length && !ev.cushion) return 'Фол: жодна куля не торкнулась борту';
    return '';
  }

  // Удар києм. spin.x — вбік (праворуч +), spin.y — вниз (+ = відтяжка). Максимум — пів радіуса від центру.
  function strike(b, angle, power, spin) {
    const v = powerToSpeed(power);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const a = (spin ? spin.x : 0) * 0.5 * R, h = (spin ? -spin.y : 0) * 0.5 * R;
    b.vx = dx * v; b.vy = dy * v;
    // точка удару p = вбік·a + вгору·h; Δω = (p × J)·5/(2R²)
    const px = -dy * a, py = dx * a, pz = -h, Jx = dx * v, Jy = dy * v, k = 2.5 / (R * R);
    b.wx = -pz * Jy * k; b.wy = pz * Jx * k; b.wz = (px * Jy - py * Jx) * k;
    return v;
  }

  // ================== Стан гри ==================
  const G = {
    mode: 'menu',          // menu | aim | moving | over
    vsBot: false, level: 1,
    names: ['', ''], cur: 0, owned: [[], []],
    balls: [], cue: 0, angle: 0, power: 0,
    spin: { x: 0, y: 0 },
    breakShot: true, ev: null,
    bot: null, gameId: 0,
    sinking: [], kbCharge: false,
  };

  function makeBall(n, x, y) {
    // орієнтація кулі (матриця тіло→світ); номер дивиться вгору
    return { n, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true, m: [1, 0, 0, 0, -1, 0, 0, 0, -1] };
  }

  function newGame() {
    G.gameId++;
    G.balls = [makeBall(0, KITCHEN_X - 150, WD / 2)];
    let num = 1;
    const dx = 2 * R * 0.866 + 0.2, dy = 2 * R + 0.2;
    for (let row = 0; row < 5; row++)
      for (let j = 0; j <= row; j++) {
        const b = makeBall(num++, FOOT_X + row * dx, WD / 2 + (j - row / 2) * dy);
        randomTilt(b);
        G.balls.push(b);
      }
    G.cur = 0; G.owned = [[], []]; G.cue = 0; G.power = 0;
    G.spin = { x: 0, y: 0 }; G.breakShot = true; G.sinking = []; G.bot = null;
    G.angle = 0;
    G.names = G.vsBot ? ['Ви', 'Бот · ' + ['легкий', 'середній', 'сильний'][G.level]] : ['Гравець 1', 'Гравець 2'];
    G.mode = 'aim';
    hideAll();
    updateHUD(); updateSpinUI();
    toast(G.names[0] + ': розбій. Червону кулю можна пересунути в домі');
  }

  const isBotTurn = () => G.vsBot && G.cur === 1;
  const canAct = () => G.mode === 'aim' && !isBotTurn() && !G.bot;

  function shoot() {
    if (G.mode !== 'aim' || G.power < 0.02) { G.power = 0; return; }
    const b = G.balls[G.cue];
    const v = strike(b, G.angle, G.power, G.spin);
    sfx.cue(v);
    G.ev = newEvents(G.cue);
    G.power = 0;
    G.spin = { x: 0, y: 0 }; updateSpinUI();
    G.mode = 'moving';
  }

  function freeAt(x, y, skip) {
    for (let i = 0; i < G.balls.length; i++) {
      const b = G.balls[i];
      if (i === skip || !b.on) continue;
      if ((b.x - x) ** 2 + (b.y - y) ** 2 < (2 * R + 0.5) ** 2) return false;
    }
    return true;
  }

  function respot(i) {
    const b = G.balls[i];
    b.vx = b.vy = b.wx = b.wy = b.wz = 0;
    for (const dir of [1, -1])
      for (let x = FOOT_X; x > R && x < L - R; x += dir * (2 * R + 1))
        if (freeAt(x, WD / 2, i)) { b.x = x; b.y = WD / 2; b.on = true; return; }
    for (let k = 0; k < 500; k++) {
      const x = R + Math.random() * (L - 2 * R), y = R + Math.random() * (WD - 2 * R);
      if (freeAt(x, y, i)) { b.x = x; b.y = y; b.on = true; return; }
    }
  }

  function endShot() {
    const ev = G.ev, me = G.cur;
    const foul = isFoul(ev);
    let keepTurn = false;
    if (foul) {
      // кулі, забиті при фолі, повертаються; суперник забирає зі столу будь-яку кулю на свій вибір
      for (const i of ev.pocketed) respot(i);
      sfx.foul();
      G.breakShot = false;
      G.cur = 1 - me;
      updateHUD();
      return startPenalty(foul);
    } else if (ev.pocketed.length) {
      G.owned[me].push(...ev.pocketed);
      keepTurn = true;
      const svoyak = ev.pocketed.includes(ev.striker);
      const n = ev.pocketed.length;
      toast((svoyak && n === 1 ? 'Свояк!' : n > 1 ? `Забито ${n} кулі!` : 'Забито!') + ' Ще удар');
    }
    G.breakShot = false;
    updateHUD();
    if (G.owned[me].length >= WIN) return gameOver(me);
    if (!keepTurn) {
      G.cur = 1 - G.cur;
      updateHUD();
      toast('Хід: ' + G.names[G.cur]);
    }
    if (!G.balls[G.cue].on) pickDefaultCue();
    G.mode = 'aim';
    if (isBotTurn()) botTurn();
  }

  // ---- Штраф за фол: G.cur (суперник порушника) вибирає кулю зі столу ----
  function startPenalty(foulMsg) {
    G.mode = 'penalty';
    G.penaltyT = performance.now();
    toast(`${foulMsg}. ${G.names[G.cur]}: вибери кулю, яку забереш зі столу`, true, 4500);
    if (isBotTurn()) {
      const id = G.gameId;
      setTimeout(() => { if (id === G.gameId && G.mode === 'penalty') takePenalty(botPickPenalty()); }, 1400);
    }
  }

  function takePenalty(i) {
    const b = G.balls[i];
    if (!b || !b.on || G.mode !== 'penalty') return;
    b.on = false;
    G.owned[G.cur].push(i);
    G.sinking.push({ n: b.n, x: b.x, y: b.y, hx: b.x, hy: b.y, t: 0, m: b.m.slice() });
    sfx.pocket(1500);
    updateHUD();
    if (G.owned[G.cur].length >= WIN) return gameOver(G.cur);
    if (!G.balls[G.cue].on) pickDefaultCue();
    G.mode = 'aim';
    toast(`${G.names[G.cur]} забирає ${b.n ? 'кулю ' + b.n : 'червону кулю'}. Хід: ${G.names[G.cur]}`);
    if (isBotTurn()) botTurn();
  }

  function pickDefaultCue() {
    let best = -1, bd = Infinity;
    G.balls.forEach((b, i) => {
      if (!b.on) return;
      const d = (b.x - L / 2) ** 2 + (b.y - WD / 2) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    G.cue = best;
  }

  function gameOver(w) {
    G.mode = 'over';
    const title = G.vsBot ? (w === 0 ? 'Перемога! 🎉' : 'Переміг бот') : `Переміг ${G.names[w]}! 🎉`;
    document.getElementById('overTitle').textContent = title;
    document.getElementById('overScore').textContent = `${G.names[0]} ${G.owned[0].length} : ${G.owned[1].length} ${G.names[1]}`;
    setTimeout(() => show('over'), 700);
    sfx.win();
  }

  // ================== Бот ==================
  function distPointSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  function simulate(balls, si, angle, power) {
    const bs = balls.map(b => ({ x: b.x, y: b.y, on: b.on, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 }));
    strike(bs[si], angle, power, null);
    const ev = newEvents(si);
    for (let k = 0; k < 720 * 15; k++) {
      step(bs, ev, null);
      if (k % 24 === 0 && stopped(bs)) break;
    }
    return ev;
  }

  // яку швидкість треба мати, щоб прокотитися dist і ще мати vEnd
  function speedNeeded(dist, vEnd) {
    let v = vEnd;
    for (let s = 0; s < dist; s += 10) v += (MU_ROLL * GRAV + K_DRAG * v) / v * 10;
    return v;
  }

  // Усі «чисті» варіанти забити: биток s → куля o → луза, від найлегшого
  function shotCandidates(balls) {
    const on = [];
    balls.forEach((b, i) => b.on && on.push(i));
    const cands = [];
    for (const s of on) {
      const S = balls[s];
      for (const o of on) {
        if (o === s) continue;
        const O = balls[o];
        for (const p of POCKETS) {
          let ux = p.ax - O.x, uy = p.ay - O.y;
          const d2 = Math.hypot(ux, uy); ux /= d2; uy /= d2;
          // куля має заходити в лузу не надто збоку
          if (p.mid ? Math.abs(uy) < 0.6 : ux * p.nx + uy * p.ny < 0.5) continue;
          const gx = O.x - ux * 2 * R, gy = O.y - uy * 2 * R;
          if (gx < R || gx > L - R || gy < R || gy > WD - R) continue;
          let dx = gx - S.x, dy = gy - S.y;
          const d1 = Math.hypot(dx, dy);
          if (d1 < 1) continue;
          dx /= d1; dy /= d1;
          const cos = dx * ux + dy * uy;
          if (cos < 0.35) continue;
          let blocked = false;
          for (const k of on) {
            if (k === s || k === o) continue;
            const B = balls[k];
            if (distPointSeg(B.x, B.y, S.x, S.y, gx, gy) < 2 * R - 1 ||
                distPointSeg(B.x, B.y, O.x, O.y, p.ax, p.ay) < 2 * R - 1) { blocked = true; break; }
          }
          if (blocked) continue;
          const score = cos * cos * 4000 / (d1 * 0.5 + d2 + 400);
          const vo = speedNeeded(d2, 350);
          const vi = vo / (cos * (1 + E_BALL) / 2);
          const v0 = speedNeeded(d1, vi) * 1.08;
          cands.push({ s, angle: Math.atan2(dy, dx), power: Math.max(0.1, Math.min(1, speedToPower(v0))), score });
        }
      }
    }
    cands.sort((a, b) => b.score - a.score);
    return cands;
  }

  // Бот забирає штрафну кулю так, щоб собі залишити найзручніший наступний удар
  function botPickPenalty() {
    let best = -1, bestScore = -1;
    G.balls.forEach((b, i) => {
      if (!b.on) return;
      b.on = false;
      const c = shotCandidates(G.balls);
      const sc = c.length ? c[0].score + Math.min(3, c.length) * 0.5 : 0;
      b.on = true;
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    return best;
  }

  function botPlan() {
    const balls = G.balls;
    if (G.breakShot) {
      const b = balls[0];
      b.x = KITCHEN_X - 120; b.y = WD / 2 + (Math.random() - 0.5) * 120;
      const ang = Math.atan2(WD / 2 - b.y, FOOT_X - b.x) + (Math.random() - 0.5) * 0.006;
      return { s: 0, angle: ang, power: 0.8 + Math.random() * 0.1 };
    }
    const on = [];
    balls.forEach((b, i) => b.on && on.push(i));
    const top = shotCandidates(balls).slice(0, [6, 10, 14][G.level]);
    let best = null, bestVal = -Infinity;
    const tryShot = (c, bonus) => {
      const ev = simulate(balls, c.s, c.angle, c.power);
      const val = isFoul(ev) ? -100 : ev.pocketed.length * 100 + bonus;
      if (val > bestVal) { bestVal = val; best = c; }
    };
    for (const c of top) {
      tryShot(c, c.score);
      if (G.level > 0) tryShot({ ...c, power: Math.min(1, c.power * 1.15) }, c.score - 1);
    }
    if (bestVal < 100) { // забити не вийде — хоча б без фолу
      const pairs = [];
      for (const s of on) for (const o of on) if (s !== o) {
        const d = Math.hypot(balls[o].x - balls[s].x, balls[o].y - balls[s].y);
        pairs.push({ s, o, d });
      }
      pairs.sort((a, b) => a.d - b.d);
      for (const p of pairs.slice(0, 8)) {
        const ang = Math.atan2(balls[p.o].y - balls[p.s].y, balls[p.o].x - balls[p.s].x);
        tryShot({ s: p.s, angle: ang, power: 0.45 }, 1 - p.d / 8000);
      }
    }
    const noise = [0.005, 0.0022, 0.0008][G.level];
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
    return { s: best.s, angle: best.angle + gauss() * noise, power: Math.min(1, best.power * (1 + gauss() * [0.06, 0.03, 0.015][G.level])) };
  }

  function botTurn() {
    const id = G.gameId;
    G.bot = { phase: 'think' };
    setTimeout(() => {
      if (id !== G.gameId || G.mode !== 'aim') return;
      const p = botPlan();
      G.cue = p.s;
      let da = p.angle - G.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      G.bot = { phase: 'turn', t0: performance.now(), a0: G.angle, da, plan: p };
    }, 650);
  }

  function updateBot(now) {
    const B = G.bot;
    if (!B || B.phase === 'think') return;
    if (B.phase === 'turn') {
      const k = Math.min(1, (now - B.t0) / 700);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      G.angle = B.a0 + B.da * e;
      if (k >= 1) { B.phase = 'pull'; B.t0 = now; }
    } else if (B.phase === 'pull') {
      const k = Math.min(1, (now - B.t0) / 600);
      G.power = B.plan.power * k;
      if (k >= 1 && now - B.t0 > 800) { G.bot = null; G.power = B.plan.power; shoot(); }
    }
  }

  // ================== Звук ==================
  const sfx = (() => {
    let ac = null, last = 0;
    const ctx = () => {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
      if (ac && ac.state === 'suspended') ac.resume();
      return ac;
    };
    function tone(freq, dur, vol, type = 'sine', slide = 0) {
      const a = ac; if (!a || vol < 0.01) return;
      const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(Math.min(vol, 0.6), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
    }
    return {
      unlock: ctx,
      hit(v) { const n = performance.now(); if (n - last < 15) return; last = n; tone(2400 + Math.random() * 400, 0.05, v / 7000, 'triangle'); },
      cushion(v) { tone(160, 0.09, v / 12000, 'sine'); },
      cue(v) { ctx(); tone(900, 0.04, 0.15 + v / 20000, 'square', 0.5); },
      pocket(v) { tone(220, 0.25, 0.25 + v / 15000, 'sine', 0.4); setTimeout(() => tone(140, 0.15, 0.15, 'triangle'), 90); },
      foul() { tone(300, 0.3, 0.15, 'sawtooth', 0.6); },
      win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.2, 'triangle'), i * 140)); },
    };
  })();

  const gameFx = {
    hit: v => sfx.hit(v),
    cushion: v => sfx.cushion(v),
    pocket(i, p, v) {
      const b = G.balls[i];
      G.sinking.push({ n: b.n, x: b.x, y: b.y, hx: p.x, hy: p.y, t: 0, m: b.m.slice() });
      sfx.pocket(v);
    },
  };

  // ================== Обертання куль (для анімації кочення) ==================
  function rotateBall(b, dt) {
    const w = Math.hypot(b.wx, b.wy, b.wz);
    if (w < 1e-4) return;
    const ang = w * dt, kx = b.wx / w, ky = b.wy / w, kz = b.wz / w;
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const r = [t * kx * kx + c, t * kx * ky - s * kz, t * kx * kz + s * ky,
               t * kx * ky + s * kz, t * ky * ky + c, t * ky * kz - s * kx,
               t * kx * kz - s * ky, t * ky * kz + s * kx, t * kz * kz + c];
    const m = b.m, o = new Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        o[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
    // ортонормалізація стовпців (щоб похибки не накопичувались)
    let ax = o[0], ay = o[3], az = o[6], l = Math.hypot(ax, ay, az); ax /= l; ay /= l; az /= l;
    let bx = o[1], by = o[4], bz = o[7];
    const d = ax * bx + ay * by + az * bz; bx -= d * ax; by -= d * ay; bz -= d * az;
    l = Math.hypot(bx, by, bz); bx /= l; by /= l; bz /= l;
    b.m = [ax, bx, ay * bz - az * by, ay, by, az * bx - ax * bz, az, bz, ax * by - ay * bx];
  }

  function randomTilt(b) {
    b.wx = (Math.random() - 0.5) * 2; b.wy = (Math.random() - 0.5) * 2; b.wz = (Math.random() - 0.5) * 6;
    rotateBall(b, 0.5);
    b.wx = b.wy = b.wz = 0;
  }

  // ================== Розкладка екрану ==================
  const root = document.getElementById('root');
  const cv = document.getElementById('cv');
  const c2 = cv.getContext('2d');
  const V = { W: 0, H: 0, dpr: 1, rot: false, top: 48, side: 70, s: 1, ox: 0, oy: 0, wheel: 0 };
  const px = n => n / V.s; // пікселі екрану → мм на столі

  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    V.rot = vh > vw;
    V.W = V.rot ? vh : vw; V.H = V.rot ? vw : vh;
    root.style.width = V.W + 'px'; root.style.height = V.H + 'px';
    root.style.transform = V.rot ? `translate(${vw}px,0) rotate(90deg)` : 'none';
    V.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(V.W * V.dpr); cv.height = Math.round(V.H * V.dpr);
    cv.style.width = V.W + 'px'; cv.style.height = V.H + 'px';
    V.top = Math.round(Math.max(34, Math.min(62, V.H * 0.11)));
    V.side = Math.round(Math.max(48, Math.min(96, V.W * 0.08)));
    root.style.setProperty('--top', V.top + 'px');
    root.style.setProperty('--side', V.side + 'px');
    const aw = V.W - 2 * V.side - 8, ah = V.H - V.top - 6;
    V.s = Math.min(aw / (L + 2 * RAIL), ah / (WD + 2 * RAIL));
    V.ox = V.side + 4 + (aw - (L + 2 * RAIL) * V.s) / 2 + RAIL * V.s;
    V.oy = V.top + 2 + (ah - (WD + 2 * RAIL) * V.s) / 2 + RAIL * V.s;
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  const toLocal = e => V.rot ? { x: e.clientY, y: window.innerWidth - e.clientX } : { x: e.clientX, y: e.clientY };
  const toField = p => ({ x: (p.x - V.ox) / V.s, y: (p.y - V.oy) / V.s });

  // ================== Малювання ==================
  // ---------- Процедурні текстури (генеруються один раз) ----------
  const TEX = {};
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // Сукно: дрібний шум + короткі ворсинки
  function makeClothTex(base, amp, fibers) {
    const w = 256, h = 256, c = makeCanvas(w, h), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const id = x.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amp;
      d[i] += n * 0.6; d[i + 1] += n; d[i + 2] += n * 0.7;
    }
    x.putImageData(id, 0, 0);
    x.lineWidth = 0.7;
    for (let k = 0; k < fibers; k++) {
      const light = Math.random() < 0.5;
      x.strokeStyle = light ? `rgba(190,255,215,${0.04 + Math.random() * 0.05})` : `rgba(0,30,15,${0.05 + Math.random() * 0.06})`;
      const px0 = Math.random() * w, py0 = Math.random() * h;
      const a = (Math.random() - 0.5) * 1.2, l = 2 + Math.random() * 4; // ворс лежить переважно вздовж столу
      x.beginPath(); x.moveTo(px0, py0); x.lineTo(px0 + Math.cos(a) * l, py0 + Math.sin(a) * l); x.stroke();
    }
    return c;
  }

  // Дерево: хвилясті волокна + шум
  function makeWoodTex() {
    const w = 1024, h = 192, c = makeCanvas(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3b2117'); g.addColorStop(0.5, '#4a2a1c'); g.addColorStop(1, '#3b2117');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      const y0 = Math.random() * h, amp = 1 + Math.random() * 5;
      const f = (1 + Math.floor(Math.random() * 4)) * Math.PI * 2 / w; // ціле число хвиль — текстура без шва
      const ph = Math.random() * 6.28;
      const dark = Math.random() < 0.6;
      x.strokeStyle = dark ? `rgba(18,7,3,${0.12 + Math.random() * 0.3})` : `rgba(130,78,48,${0.06 + Math.random() * 0.16})`;
      x.lineWidth = 0.4 + Math.random() * 1.8;
      x.beginPath();
      for (let X = 0; X <= w; X += 8) {
        const Y = y0 + Math.sin(X * f + ph) * amp + Math.sin(X * f * 3 + ph * 2) * amp * 0.3;
        X ? x.lineTo(X, Y) : x.moveTo(X, Y);
      }
      x.stroke();
    }
    // сучки
    for (let k = 0; k < 3; k++) {
      const kx = Math.random() * w, ky = Math.random() * h;
      for (let r = 14; r > 2; r -= 3) {
        x.strokeStyle = `rgba(20,8,4,${0.15})`; x.lineWidth = 1;
        x.beginPath(); x.ellipse(kx, ky, r * 2.2, r * 0.7, 0, 0, 7); x.stroke();
      }
    }
    const id = x.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(id, 0, 0);
    return c;
  }

  function texPattern(ctx, tex, pxPerTexel, rotate) {
    const p = ctx.createPattern(tex, 'repeat');
    const k = 1 / (V.s * V.dpr) * pxPerTexel; // один тексель ≈ pxPerTexel пікселів екрану
    let m = new DOMMatrix().scale(k, k);
    if (rotate) m = new DOMMatrix().rotate(90).scale(k, k);
    p.setTransform(m);
    return p;
  }

  function drawTable(ctx) {
    if (!TEX.cloth) {
      TEX.cloth = makeClothTex('#13955f', 22, 2600);
      TEX.cushion = makeClothTex('#0d7d4e', 20, 2000);
      TEX.wood = makeWoodTex();
    }
    // ---- дерев'яна рама ----
    roundRect(ctx, -RAIL, -RAIL, L + 2 * RAIL, WD + 2 * RAIL, 60);
    ctx.fillStyle = texPattern(ctx, TEX.wood, 1.4, false); ctx.fill();
    // короткі борти: волокна вздовж борту
    ctx.save();
    roundRect(ctx, -RAIL, -RAIL, L + 2 * RAIL, WD + 2 * RAIL, 60); ctx.clip();
    ctx.fillStyle = texPattern(ctx, TEX.wood, 1.4, true);
    ctx.beginPath();
    ctx.moveTo(-RAIL, -RAIL); ctx.lineTo(-CUSH, -CUSH); ctx.lineTo(-CUSH, WD + CUSH); ctx.lineTo(-RAIL, WD + RAIL); ctx.closePath();
    ctx.moveTo(L + RAIL, -RAIL); ctx.lineTo(L + CUSH, -CUSH); ctx.lineTo(L + CUSH, WD + CUSH); ctx.lineTo(L + RAIL, WD + RAIL); ctx.closePath();
    ctx.fill();
    // лак: світло зверху, шви на кутах
    const lg = ctx.createLinearGradient(0, -RAIL, 0, WD + RAIL);
    lg.addColorStop(0, 'rgba(255,225,190,.16)'); lg.addColorStop(0.06, 'rgba(255,225,190,0)');
    lg.addColorStop(0.94, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = lg; ctx.fillRect(-RAIL, -RAIL, L + 2 * RAIL, WD + 2 * RAIL);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = px(1);
    ctx.beginPath();
    ctx.moveTo(-RAIL, -RAIL); ctx.lineTo(-CUSH, -CUSH); ctx.moveTo(L + RAIL, -RAIL); ctx.lineTo(L + CUSH, -CUSH);
    ctx.moveTo(-RAIL, WD + RAIL); ctx.lineTo(-CUSH, WD + CUSH); ctx.moveTo(L + RAIL, WD + RAIL); ctx.lineTo(L + CUSH, WD + CUSH);
    ctx.stroke();
    ctx.restore();
    // фаска по зовнішньому краю
    ctx.strokeStyle = 'rgba(255,215,170,.18)'; ctx.lineWidth = 8;
    roundRect(ctx, -RAIL + 8, -RAIL + 8, L + 2 * RAIL - 16, WD + 2 * RAIL - 16, 52); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = px(2);
    roundRect(ctx, -RAIL, -RAIL, L + 2 * RAIL, WD + 2 * RAIL, 60); ctx.stroke();

    // ---- сукно ----
    ctx.fillStyle = texPattern(ctx, TEX.cloth, 1, false);
    ctx.fillRect(-CUSH, -CUSH, L + 2 * CUSH, WD + 2 * CUSH);
    // світло від трьох плафонів лампи над столом
    for (const lx of [L * 0.22, L * 0.5, L * 0.78]) {
      const g = ctx.createRadialGradient(lx, WD / 2, 0, lx, WD / 2, WD * 0.8);
      g.addColorStop(0, 'rgba(255,255,225,.13)'); g.addColorStop(1, 'rgba(255,255,225,0)');
      ctx.fillStyle = g; ctx.fillRect(-CUSH, -CUSH, L + 2 * CUSH, WD + 2 * CUSH);
    }
    const vg = ctx.createRadialGradient(L / 2, WD / 2, WD * 0.4, L / 2, WD / 2, L * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = vg; ctx.fillRect(-CUSH, -CUSH, L + 2 * CUSH, WD + 2 * CUSH);
    // розмітка як на фото: лінія дому, середня, задня і поздовжні
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = px(0.8);
    ctx.beginPath();
    for (const x of [KITCHEN_X, L / 2, FOOT_X]) { ctx.moveTo(x, 0); ctx.lineTo(x, WD); }
    ctx.moveTo(0, WD / 2); ctx.lineTo(KITCHEN_X + 50, WD / 2);
    ctx.moveTo(FOOT_X - 60, WD / 2); ctx.lineTo(L, WD / 2);
    ctx.stroke();
    // тінь від бортів на сукні
    const sh = 28;
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 0, sh, 0, 0, L, sh); edge(0, WD, 0, WD - sh, 0, WD - sh, L, sh);
    edge(0, 0, sh, 0, 0, 0, sh, WD); edge(L, 0, L - sh, 0, L - sh, 0, sh, WD);

    // ---- лузи (отвори з сіткою) — під бортами ----
    for (const h of POCKETS) {
      const hg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
      hg.addColorStop(0, '#000'); hg.addColorStop(0.75, '#070707'); hg.addColorStop(1, '#262626');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, 7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, 7); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = px(0.6);
      ctx.beginPath();
      for (let a = -4; a <= 4; a++) {
        ctx.moveTo(h.x + a * h.r / 4 - h.r, h.y - h.r); ctx.lineTo(h.x + a * h.r / 4 + h.r, h.y + h.r);
        ctx.moveTo(h.x + a * h.r / 4 + h.r, h.y - h.r); ctx.lineTo(h.x + a * h.r / 4 - h.r, h.y + h.r);
      }
      ctx.stroke(); ctx.restore();
    }

    // ---- гумові борти, обтягнуті тим самим сукном ----
    const cushionPath = p => {
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
    };
    ctx.fillStyle = texPattern(ctx, TEX.cushion, 1, false);
    for (const p of CUSHIONS) { cushionPath(p); ctx.fill(); }
    // об'єм борту: темніше до рами
    for (const [x0, y0, x1, y1] of [[0, 0, 0, -CUSH], [0, WD, 0, WD + CUSH], [0, 0, -CUSH, 0], [L, 0, L + CUSH, 0]]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.beginPath();
      for (const p of CUSHIONS) { ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
      ctx.clip();
      if (x1 === x0) ctx.fillRect(-RAIL, Math.min(y0, y1), L + 2 * RAIL, CUSH);
      else ctx.fillRect(Math.min(x0, x1), -RAIL, CUSH, WD + 2 * RAIL);
      ctx.restore();
    }
    // світлий кант на носику борту
    ctx.strokeStyle = 'rgba(200,255,220,.22)'; ctx.lineWidth = px(1.2);
    ctx.beginPath();
    for (const s of SEGS) { ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = px(1);
    for (const p of CUSHIONS) { cushionPath(p); ctx.stroke(); }

    // ---- латунні накладки біля луз ----
    ctx.lineCap = 'round';
    for (const h of POCKETS) {
      const base = Math.atan2(h.ny, h.nx), a0 = base - Math.PI * 0.55, a1 = base + Math.PI * 0.55;
      ctx.strokeStyle = '#5e4a2c'; ctx.lineWidth = 17;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 12, a0, a1); ctx.stroke();
      const bg = ctx.createLinearGradient(h.x - h.r, h.y - h.r, h.x + h.r, h.y + h.r);
      bg.addColorStop(0, '#f6e2a8'); bg.addColorStop(0.5, '#c9a65e'); bg.addColorStop(1, '#8e6f37');
      ctx.strokeStyle = bg; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 12, a0, a1); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // Стіл не змінюється — малюємо його один раз у кеш і далі тільки копіюємо
  let tableCache = null;
  function getTableCache() {
    const k = V.s * V.dpr;
    if (tableCache && tableCache.k === k) return tableCache.c;
    const c = makeCanvas(Math.ceil((L + 2 * RAIL) * k), Math.ceil((WD + 2 * RAIL) * k));
    const x = c.getContext('2d');
    x.setTransform(k, 0, 0, k, RAIL * k, RAIL * k);
    drawTable(x);
    tableCache = { c, k };
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawBall(ctx, b, x, y, scale = 1) {
    const r = R * scale, m = b.m;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x + r * 0.18, y + r * 0.26, r, r * 0.92, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
    ctx.fillStyle = b.n === 0 ? '#c8141a' : '#f1efe6';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    // номери на двох протилежних боках кулі — вони обертаються разом із кулею
    for (const sg of [1, -1]) {
      const pz = sg * m[8];
      if (pz > 0.05) continue; // ця сторона дивиться в стіл
      ctx.save();
      ctx.translate(x + sg * m[2] * r, y + sg * m[5] * r);
      ctx.transform(m[0], m[3], -sg * m[1], -sg * m[4], 0, 0);
      ctx.globalAlpha = Math.min(1, -pz * 4 + 0.2);
      if (b.n === 0) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, 7); ctx.fill();
      } else {
        ctx.strokeStyle = '#555'; ctx.lineWidth = r * 0.06;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, 7); ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.font = `bold ${r * 0.5}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.n, 0, r * 0.03);
        if (b.n === 6 || b.n === 9) ctx.fillRect(-r * 0.16, r * 0.26, r * 0.32, r * 0.05);
      }
      ctx.restore();
    }
    // об'єм: відблиск і тінь по краю
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.02);
    g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(0.18, 'rgba(255,255,255,.12)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  }

  function rayCast(si, ang) {
    const s = G.balls[si], dx = Math.cos(ang), dy = Math.sin(ang);
    let tBest = Infinity, hit = -1;
    G.balls.forEach((b, j) => {
      if (j === si || !b.on) return;
      const fx = s.x - b.x, fy = s.y - b.y;
      const bq = fx * dx + fy * dy, c = fx * fx + fy * fy - 4 * R * R;
      const disc = bq * bq - c;
      if (disc < 0) return;
      const t = -bq - Math.sqrt(disc);
      if (t > 0.01 && t < tBest) { tBest = t; hit = j; }
    });
    let tw = Infinity;
    if (dx > 0) tw = Math.min(tw, (L - R - s.x) / dx);
    if (dx < 0) tw = Math.min(tw, (R - s.x) / dx);
    if (dy > 0) tw = Math.min(tw, (WD - R - s.y) / dy);
    if (dy < 0) tw = Math.min(tw, (R - s.y) / dy);
    if (tw < tBest) { tBest = Math.max(0, tw); hit = -1; }
    return { hit, dist: tBest, gx: s.x + dx * tBest, gy: s.y + dy * tBest, dx, dy };
  }

  // Скільки гвинта кочення (Rω/v уздовж удару) залишиться в битка на момент зіткнення
  function spinRatioAt(v0, ratio0, dist) {
    const g = MU_SLIDE * GRAV, u0 = v0 * (1 - ratio0);
    if (Math.abs(u0) < 1) return ratio0;
    const sg = Math.sign(u0), ts = Math.abs(u0) / (3.5 * g);
    if (dist >= v0 * ts - 0.5 * sg * g * ts * ts) return 1; // встигне перейти в чисте кочення
    const t = sg > 0 ? (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * g * dist))) / g : (-v0 + Math.sqrt(v0 * v0 + 2 * g * dist)) / g;
    const v = v0 - sg * g * t, u = u0 - sg * 3.5 * g * t;
    return (v - u) / v;
  }

  function drawAim(ctx) {
    const s = G.balls[G.cue];
    if (!s || !s.on) return;
    const rc = rayCast(G.cue, G.angle);
    ctx.strokeStyle = 'rgba(220,255,230,.85)'; ctx.lineWidth = px(1.3);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(rc.gx, rc.gy); ctx.stroke();
    ctx.beginPath(); ctx.arc(rc.gx, rc.gy, R, 0, 7); ctx.stroke();
    if (rc.hit < 0) return;
    const o = G.balls[rc.hit];
    const nx = (o.x - rc.gx) / (2 * R), ny = (o.y - rc.gy) / (2 * R);
    const cos = Math.max(0, rc.dx * nx + rc.dy * ny);
    const LEN = 175; // короткі лінії відскоку
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + nx * LEN * cos, o.y + ny * LEN * cos); ctx.stroke();
    // куди піде биток: дотична складова + гвинт кочення (накат/відтяжка)
    const ratio = spinRatioAt(powerToSpeed(G.power || 0.4), -G.spin.y * 1.25, rc.dist);
    const fx = (rc.dx - nx * cos) * 5 / 7 + rc.dx * ratio * 2 / 7;
    const fy = (rc.dy - ny * cos) * 5 / 7 + rc.dy * ratio * 2 / 7;
    const fl = Math.hypot(fx, fy);
    if (fl > 0.02) {
      ctx.strokeStyle = 'rgba(255,230,150,.75)';
      ctx.setLineDash([px(4), px(3)]);
      ctx.beginPath(); ctx.moveTo(rc.gx, rc.gy); ctx.lineTo(rc.gx + fx / fl * LEN * Math.min(1, fl * 1.3), rc.gy + fy / fl * LEN * Math.min(1, fl * 1.3)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawCue(ctx) {
    const s = G.balls[G.cue];
    if (!s || !s.on) return;
    const dx = Math.cos(G.angle), dy = Math.sin(G.angle);
    const back = R + 12 + G.power * 260;
    const len = 1450;
    ctx.save();
    ctx.translate(s.x - dx * back, s.y - dy * back);
    ctx.rotate(G.angle + Math.PI);
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 6;
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, '#3b6fb0'); g.addColorStop(0.008, '#3b6fb0');
    g.addColorStop(0.009, '#f4f4f0'); g.addColorStop(0.02, '#f4f4f0');
    g.addColorStop(0.021, '#e9d1a0'); g.addColorStop(0.6, '#c9934e');
    g.addColorStop(0.62, '#2a1608'); g.addColorStop(0.75, '#3e7d54'); g.addColorStop(0.77, '#2a1608'); g.addColorStop(1, '#1b0d05');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(len, -15); ctx.lineTo(len, 15); ctx.lineTo(0, 6.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawPowerBar(ctx) {
    const x0 = 0, w = V.side;
    const top = V.top + V.side + 6, bot = V.H - 14, h = bot - top;
    const tw = Math.max(14, w * 0.3), tx = x0 + (w - tw) / 2;
    ctx.fillStyle = '#2a0e0c';
    roundRect(ctx, tx - 6, top - 6, tw + 12, h + 12, 10); ctx.fill();
    ctx.fillStyle = '#120403';
    roundRect(ctx, tx, top, tw, h, 6); ctx.fill();
    const p = G.power;
    if (p > 0) {
      const pg = ctx.createLinearGradient(0, top, 0, bot);
      pg.addColorStop(0, '#36d16b'); pg.addColorStop(0.5, '#f2d23a'); pg.addColorStop(1, '#ec3b2c');
      ctx.fillStyle = pg;
      roundRect(ctx, tx, top, tw, h * p, 6); ctx.fill();
    }
    ctx.save();
    roundRect(ctx, tx, top, tw, h, 6); ctx.clip();
    const tipY = top + 6 + p * h * 0.85, cx = tx + tw / 2;
    const cg = ctx.createLinearGradient(0, tipY, 0, tipY + h);
    cg.addColorStop(0, '#f4f4ff'); cg.addColorStop(0.02, '#f4f4ff'); cg.addColorStop(0.021, '#e7cf9e'); cg.addColorStop(1, '#b67a3c');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(cx - tw * 0.16, tipY); ctx.lineTo(cx + tw * 0.16, tipY); ctx.lineTo(cx + tw * 0.32, tipY + h); ctx.lineTo(cx - tw * 0.32, tipY + h); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (p > 0) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = `600 ${Math.round(w * 0.19)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((powerToSpeed(p) / 1000).toFixed(1) + ' м/с', x0 + w / 2, Math.min(bot - 10, tipY + h * 0.05 + 14));
    }
  }

  function drawWheel(ctx) {
    const w = V.side * 0.62, x = V.W - V.side + (V.side - w) / 2;
    const top = V.oy + 20, h = WD * V.s * 0.9, bot = top + h;
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, x - 4, top - 4, w + 8, h + 8, 8); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#5e5e5e'); g.addColorStop(0.3, '#d9d9d9'); g.addColorStop(0.55, '#f2f2f2'); g.addColorStop(1, '#6a6a6a');
    ctx.save();
    roundRect(ctx, x, top, w, h, 5); ctx.clip();
    ctx.fillStyle = g; ctx.fillRect(x, top, w, h);
    const sp = 11, off = ((V.wheel % sp) + sp) % sp;
    const idx = Math.floor(V.wheel / sp);
    for (let y = top - sp + off, k = 0; y < bot + sp; y += sp, k++) {
      const big = ((k - idx) % 5 + 5) % 5 === 0;
      const yy = Math.round(y) + 0.5;
      const rel = (y - top) / h * 2 - 1;
      ctx.strokeStyle = `rgba(20,20,20,${0.85 - Math.abs(rel) * 0.5})`;
      ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x + (big ? 2 : w * 0.18), yy); ctx.lineTo(x + w - (big ? 2 : w * 0.18), yy); ctx.stroke();
    }
    const sh = ctx.createLinearGradient(0, top, 0, bot);
    sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(0.2, 'rgba(0,0,0,0)'); sh.addColorStop(0.8, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = sh; ctx.fillRect(x, top, w, h);
    ctx.restore();
  }

  function draw() {
    const ctx = c2, d = V.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const bg = ctx.createRadialGradient(V.W / 2, V.H / 2, 50, V.W / 2, V.H / 2, V.W * 0.7);
    bg.addColorStop(0, '#163a3a'); bg.addColorStop(1, '#081818');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, V.W, V.H);

    ctx.drawImage(getTableCache(), V.ox - RAIL * V.s, V.oy - RAIL * V.s, (L + 2 * RAIL) * V.s, (WD + 2 * RAIL) * V.s);
    ctx.setTransform(d * V.s, 0, 0, d * V.s, d * V.ox, d * V.oy);
    if (G.breakShot && G.mode === 'aim') {
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(0, 0, KITCHEN_X, WD);
    }
    for (const k of G.sinking) {
      const t = Math.min(1, k.t / 0.22);
      drawBall(ctx, k, k.x + (k.hx - k.x) * t, k.y + (k.hy - k.y) * t, 1 - t * 0.6);
    }
    const aiming = G.mode === 'aim' && G.balls.length;
    if (aiming && (canAct() || (G.bot && G.bot.phase !== 'think'))) drawAim(ctx);
    const choosing = G.mode === 'penalty';
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    G.balls.forEach((b, i) => {
      if (!b.on) return;
      if (choosing && !isBotTurn()) {
        ctx.strokeStyle = `rgba(255,90,70,${0.45 + 0.5 * pulse})`; ctx.lineWidth = px(2);
        ctx.beginPath(); ctx.arc(b.x, b.y, R + px(3 + pulse * 2), 0, 7); ctx.stroke();
      }
      if (aiming && i === G.cue && !isBotTurn()) {
        ctx.strokeStyle = 'rgba(255,240,120,.9)'; ctx.lineWidth = px(2);
        ctx.beginPath(); ctx.arc(b.x, b.y, R + px(3), 0, 7); ctx.stroke();
      }
      drawBall(ctx, b, b.x, b.y);
    });
    if (aiming && !(G.bot && G.bot.phase === 'think')) drawCue(ctx);

    ctx.setTransform(d, 0, 0, d, 0, 0);
    drawPowerBar(ctx);
    drawWheel(ctx);
  }

  // ================== Головний цикл ==================
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.mode === 'moving') {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 60) { step(G.balls, G.ev, gameFx); acc -= DT; n++; }
      for (const b of G.balls) if (b.on) rotateBall(b, n * DT);
      if (stopped(G.balls)) { acc = 0; endShot(); }
    }
    for (const k of G.sinking) k.t += dt;
    G.sinking = G.sinking.filter(k => k.t < 0.25);
    if (G.kbCharge && canAct()) G.power = Math.min(1, G.power + dt * 0.6);
    updateBot(now);
    draw();
    requestAnimationFrame(frame);
  }

  // ================== Керування ==================
  const drags = new Map();
  function ballAt(f) {
    let hit = -1, hd = Math.max(1.6 * R, px(16));
    G.balls.forEach((b, i) => {
      if (!b.on) return;
      const d = Math.hypot(f.x - b.x, f.y - b.y);
      if (d < hd) { hd = d; hit = i; }
    });
    return hit;
  }

  cv.addEventListener('pointerdown', e => {
    sfx.unlock();
    if (G.mode === 'penalty' && !isBotTurn()) {
      const i = ballAt(toField(toLocal(e)));
      if (i >= 0) takePenalty(i);
      return;
    }
    if (!canAct()) return;
    const p = toLocal(e);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
    if (p.x < V.side && p.y > V.top + V.side) {
      drags.set(e.pointerId, { type: 'power', y0: p.y });
      return;
    }
    if (p.x > V.W - V.side) {
      drags.set(e.pointerId, { type: 'wheel', y: p.y });
      return;
    }
    const f = toField(p);
    const cue = G.balls[G.cue];
    const grab = Math.max(1.6 * R, px(16));
    if (G.breakShot && Math.hypot(f.x - cue.x, f.y - cue.y) < grab * 1.3) {
      drags.set(e.pointerId, { type: 'place', dx: cue.x - f.x, dy: cue.y - f.y });
      return;
    }
    if (!G.breakShot) {
      const hit = ballAt(f);
      if (hit >= 0 && hit !== G.cue) {
        drags.set(e.pointerId, { type: 'select', ball: hit, x: p.x, y: p.y, a: fingerAngle(f) });
        return;
      }
    }
    // дотик сам по собі приціл не змінює — лише проведення пальцем
    drags.set(e.pointerId, { type: 'swipe', x: p.x, y: p.y, a: fingerAngle(f) });
  });

  function fingerAngle(f) {
    const c = G.balls[G.cue];
    return Math.hypot(f.x - c.x, f.y - c.y) > R ? Math.atan2(f.y - c.y, f.x - c.x) : null;
  }
  // Проведення обертає кий навколо битка на кут, який палець описав відносно нього (без стрибків)
  function aimDrag(d, f) {
    const a = fingerAngle(f);
    if (a !== null && d.a !== null) {
      let da = a - d.a;
      if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      G.angle += da;
    }
    d.a = a;
  }

  cv.addEventListener('pointermove', e => {
    const d = drags.get(e.pointerId);
    if (!d || !canAct()) return;
    const p = toLocal(e);
    if (d.type === 'power') {
      const h = V.H - 14 - (V.top + V.side + 6);
      G.power = Math.max(0, Math.min(1, (p.y - d.y0) / (h * 0.85)));
    } else if (d.type === 'wheel') {
      const dy = p.y - d.y; d.y = p.y;
      V.wheel += dy;
      G.angle += dy * 0.0004; // ≈0.02° на піксель — для тонкого наведення в тісні лузи
    } else if (d.type === 'place') {
      const f = toField(p), b = G.balls[G.cue];
      const nx = Math.max(R, Math.min(KITCHEN_X, f.x + d.dx)), ny = Math.max(R, Math.min(WD - R, f.y + d.dy));
      if (freeAt(nx, ny, G.cue)) { b.x = nx; b.y = ny; }
    } else if (d.type === 'select') {
      if (Math.hypot(p.x - d.x, p.y - d.y) > 10) { d.type = 'aim'; aimDrag(d, toField(p)); }
    } else if (d.type === 'swipe') {
      if (Math.hypot(p.x - d.x, p.y - d.y) > 6) { d.type = 'aim'; aimDrag(d, toField(p)); }
    } else if (d.type === 'aim') {
      aimDrag(d, toField(p));
    }
  });

  const endDrag = e => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    drags.delete(e.pointerId);
    if (!canAct()) return;
    if (d.type === 'power') shoot();
    else if (d.type === 'select' && e.type === 'pointerup') {
      G.cue = d.ball;
      sfx.hit(1500);
    }
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!canAct()) return;
    const k = e.shiftKey ? 0.0001 : 0.0006;
    G.angle += Math.sign(e.deltaY) * k * Math.min(10, Math.abs(e.deltaY) / 10 + 1);
    V.wheel += Math.sign(e.deltaY) * 4;
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (!canAct()) return;
    const k = e.shiftKey ? 0.0003 : 0.004;
    if (e.key === 'ArrowLeft') { G.angle -= k; V.wheel -= 6; e.preventDefault(); }
    if (e.key === 'ArrowRight') { G.angle += k; V.wheel += 6; e.preventDefault(); }
    if (e.code === 'Space' && !e.repeat) { sfx.unlock(); G.kbCharge = true; G.power = 0; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' && G.kbCharge) { G.kbCharge = false; shoot(); }
  });

  // ================== Інтерфейс (DOM) ==================
  const $ = id => document.getElementById(id);
  const overlays = ['menu', 'pause', 'rules', 'spinPanel', 'over'];
  let rulesBack = 'menu';
  function show(id) { overlays.forEach(o => $(o).classList.toggle('hidden', o !== id)); }
  function hideAll() { overlays.forEach(o => $(o).classList.add('hidden')); }

  function updateHUD() {
    [0, 1].forEach(i => {
      const el = $('p' + (i + 1));
      el.querySelector('.name').textContent = G.names[i];
      el.classList.toggle('active', G.cur === i && G.mode !== 'menu');
      const dots = el.querySelector('.dots');
      dots.innerHTML = '';
      for (let k = 0; k < WIN; k++) {
        const d = document.createElement('i');
        if (k < G.owned[i].length) d.className = 'on';
        dots.appendChild(d);
      }
    });
  }

  let toastTimer = 0;
  function toast(msg, bad, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function updateSpinUI() {
    const pos = (el) => { el.style.left = (50 + G.spin.x * 40) + '%'; el.style.top = (50 + G.spin.y * 40) + '%'; };
    pos($('btnSpin').querySelector('i'));
    pos($('spinPad').querySelector('i'));
  }
  // крапка на маленькій кулі має зсув на свій розмір
  $('btnSpin').querySelector('i').style.margin = '-11% 0 0 -11%';

  function goFullscreen() {
    if (!('ontouchstart' in window)) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen() : null;
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { });
    } catch (e) { }
  }

  document.querySelectorAll('.levels button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.levels button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    G.level = +b.dataset.level;
  }));
  $('btnBot').onclick = () => { sfx.unlock(); goFullscreen(); G.vsBot = true; newGame(); };
  $('btnFriend').onclick = () => { sfx.unlock(); goFullscreen(); G.vsBot = false; newGame(); };
  $('btnRules').onclick = () => { rulesBack = 'menu'; show('rules'); };
  $('btnRules2').onclick = () => { rulesBack = 'pause'; show('rules'); };
  $('btnRulesClose').onclick = () => show(rulesBack);
  $('btnMenu').onclick = () => { if (G.mode !== 'menu') show('pause'); };
  $('btnResume').onclick = hideAll;
  $('btnRestart').onclick = newGame;
  $('btnAgain').onclick = newGame;
  const toMenu = () => { G.gameId++; G.mode = 'menu'; G.bot = null; updateHUD(); show('menu'); };
  $('btnToMenu').onclick = toMenu;
  $('btnOverMenu').onclick = toMenu;

  $('btnSpin').onclick = () => { if (canAct()) show('spinPanel'); };
  $('btnSpinOk').onclick = hideAll;
  $('btnSpinReset').onclick = () => { G.spin = { x: 0, y: 0 }; updateSpinUI(); };
  const pad = $('spinPad');
  const setSpin = e => {
    const r = pad.getBoundingClientRect();
    // getBoundingClientRect дає екранні координати — при повороті міняємо осі
    let x, y;
    if (V.rot) { x = (e.clientY - r.top) / r.height * 2 - 1; y = 1 - (e.clientX - r.left) / r.width * 2; }
    else { x = (e.clientX - r.left) / r.width * 2 - 1; y = (e.clientY - r.top) / r.height * 2 - 1; }
    const len = Math.hypot(x, y), max = 0.8;
    if (len > max) { x *= max / len; y *= max / len; }
    G.spin = { x: x / max, y: y / max };
    updateSpinUI();
  };
  pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); setSpin(e); });
  pad.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') setSpin(e); });
  $('spinPanel').addEventListener('pointerdown', e => { if (e.target.id === 'spinPanel') hideAll(); });

  // ================== Старт ==================
  layout();
  G.vsBot = false; newGame(); G.mode = 'menu'; show('menu'); updateHUD();
  requestAnimationFrame(frame);
  window.__game = G; // для налагодження
  window.__dbg = { step, stopped, endShot, botPlan, shoot, strike, drawBall, drawTable, rotateBall, V, R };
})();
