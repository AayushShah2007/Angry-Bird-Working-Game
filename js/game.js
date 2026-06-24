(function () {
    'use strict';

    // Show JS errors on screen for debugging
    window.addEventListener('error', function(e) {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;top:0;left:0;width:100%;padding:20px;background:#900;color:#fff;font:14px monospace;z-index:9999;white-space:pre-wrap';
        d.textContent = e.message || e;
        document.body.appendChild(d);
    });



    if (typeof Matter === 'undefined') {
        document.body.innerHTML = '<div style="color:#e74c3c;padding:40px;font:20px sans-serif">Failed to load game engine. Check your internet and refresh.</div>';
        return;
    }
    const { Engine, World, Bodies, Body, Composite, Events, Vector } = Matter;

    // ===== ASSET URLS =====
    const ASSETS = {
        bg: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Background/BackGround%201.png',
        cat: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Catapult/Catapult.png',
        bird: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/White%20Bird/Frame-1.png',
        pink: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Monster/Pink%20Monster/Frame-1.png',
        pink2: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Monster/Pink%20Monster/Frame-2.png',
        yell: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Monster/Yellow%20Monster/Frame-1.png',
        yell2: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Monster/Yellow%20Monster/Frame-2.png',
        crate: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Wooden%20Crate/Wooden%20Crate.png',
        cloud: 'https://raw.githubusercontent.com/Laeeq-Khan/Angry-Bird-Assets/master/Cloud/Cloud.png',
        mapBg: 'https://public-files.gumroad.com/rerl2oghdx6nr4er1r63kqktjfdd',
        explosion: 'https://res.cloudinary.com/dol86wsz1/image/upload/v1770154425/summer_art/kenney/2d/explosion-pack/simpleExplosion00.png',
    };

    // ===== CONFIG =====
    const W = 1600, H = 700, GY = 620;
    const CAT_W = 70, CAT_H = 130;
    const SX = 220, SY = GY - CAT_H + 20;
    const FL = { x: SX - 12, y: SY + 18 };
    const FR = { x: SX + 12, y: SY + 18 };
    const SC = { x: SX, y: SY + 28 };
    const BR = 18, PR = 22;
    const MAX_PULL = 260;
    const POWER = 0.22;
    const GRAV = 0.8;
    const GRAV_EFF = GRAV * 0.001 * Math.pow(1000/60, 2); // ≈ 0.2778 (Matter.js effective gravity per frame)
    const PIG_HP = 80, CRATE_HP = 60;

    // ===== STATE =====
    const S = {
        score: 0, lvl: 0,
        birds: [], curBird: null, curIdx: -1,
        pigs: [], crates: [],
        drag: false, dragPos: null, launched: false, canDrag: true,
        won: false, lost: false, wlTmr: null,
        trail: [], tick: 0, checkTmr: null,
        clouds: [],
        cloudReveal: null,
        loaded: 0, total: 0, ready: false,
        screen: 'menu',
        particles: [],
        scorePopups: [],
        levelProgress: 0,
        explodeMode: false,
        explodeUses: 0,
        explodeMaxUses: 0,
        explosion: null,
        shake: { x: 0, y: 0, intensity: 0, decay: 0.85 },
    };

    // ===== DOM =====
    const cv = document.getElementById('gameCanvas');
    const cx = cv.getContext('2d');
    const elScore = document.getElementById('score-display');
    const elBirds = document.getElementById('birds-remaining');
    const elMsg = document.getElementById('level-info');
    const elUI = document.getElementById('ui-overlay');
    const cont = document.getElementById('gameContainer');
    const completeOverlay = document.getElementById('complete-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const completeScore = document.getElementById('complete-score');
    const gameoverScore = document.getElementById('gameover-score');
    const btnNextLevel = document.getElementById('btn-next-level');
    const btnMenu = document.getElementById('btn-menu');
    const btnRetry = document.getElementById('btn-retry');
    const btnMenuGo = document.getElementById('btn-menu-go');
    const btnExplode = document.getElementById('btn-explode');
    const armIndicator = document.getElementById('arm-indicator');
    let lw = 0, lh = 0;

    // ===== IMAGES =====
    const Img = {};

    // ===== MATTER =====
    let eng, world, gnd, lwall, rwall, ceil;

    // ===== LEVEL MAP NODE POSITIONS =====
    const mapLevels = [
        { x: 200, y: 550 },
        { x: 380, y: 460 },
        { x: 330, y: 330 },
        { x: 520, y: 280 },
        { x: 700, y: 330 },
        { x: 680, y: 200 },
        { x: 870, y: 170 },
        { x: 1050, y: 230 },
        { x: 1200, y: 150 },
        { x: 1400, y: 200 },
    ];
    // Mobile map: (ratio-based 0-1, scaled to canvas in drawMap)
    const mapLevelsMobile = [
        { x: 0.50, y: 0.85 },
        { x: 0.15, y: 0.74 },
        { x: 0.78, y: 0.64 },
        { x: 0.30, y: 0.54 },
        { x: 0.65, y: 0.44 },
        { x: 0.20, y: 0.35 },
        { x: 0.80, y: 0.26 },
        { x: 0.35, y: 0.17 },
        { x: 0.70, y: 0.09 },
        { x: 0.50, y: 0.02 },
    ];
    function isMobile() { return window.innerWidth <= 768; }

    // ===== LEVELS (4-Level Tower Architectures) =====
    // Building blocks (50×50 crates on a 55px grid):
    //   ground: [x,50,50]
    //   raised: [x,50,50,true]
    //   3rd:    [x,50,50,98,true]
    //   4th:    [x,50,50,148,true]
    //   pig on ground: [x,type,true]
    //   pig on 4th:   [x,type,true,202]
    const LV = [
        {
            name: 'Level 1 — The Keep',
            pigs: [[1050,'pink',true,202]],
            crates: [[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[995,50,50,true],[1105,50,50,true],[1050,50,50,true],[1050,50,50,98,true],[1050,50,50,148,true]],
            birds: 3
        },
        {
            name: 'Level 2 — Twin Palace',
            pigs: [[940,'pink',true,202],[1105,'yellow',true,202]],
            crates: [[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[885,50,50,true],[940,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1160,50,50,true],[1215,50,50,true],[940,50,50,98,true],[1105,50,50,98,true],[940,50,50,148,true],[1105,50,50,148,true]],
            birds: 4
        },
        {
            name: 'Level 3 — Castle Gate',
            pigs: [[830,'pink',true,202],[940,'pink',true],[1050,'yellow',true,202],[1160,'pink',true],[1270,'yellow',true,202]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[830,50,50,true],[885,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1215,50,50,true],[1270,50,50,true],[830,50,50,98,true],[1050,50,50,98,true],[1270,50,50,98,true],[830,50,50,148,true],[1050,50,50,148,true],[1270,50,50,148,true]],
            birds: 5
        },
        {
            name: 'Level 4 — Courtyard Palace',
            pigs: [[885,'pink',true,202],[995,'pink',true],[1050,'yellow',true,202],[1160,'pink',true],[1215,'pink',true,202],[1325,'yellow',true]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[1325,50,50],[1380,50,50],[830,50,50,true],[885,50,50,true],[940,50,50,true],[1050,50,50,true],[1105,50,50,true],[1215,50,50,true],[1270,50,50,true],[1380,50,50,true],[885,50,50,98,true],[1050,50,50,98,true],[1215,50,50,98,true],[885,50,50,148,true],[1050,50,50,148,true],[1215,50,50,148,true]],
            birds: 6
        },
        {
            name: 'Level 5 — Tower Palace',
            pigs: [[830,'pink',true],[885,'pink',true,202],[1160,'yellow',true,202],[1325,'pink',true,202],[1380,'yellow',true]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[1325,50,50],[1380,50,50],[885,50,50,true],[940,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1160,50,50,true],[1215,50,50,true],[1270,50,50,true],[1325,50,50,true],[885,50,50,98,true],[1160,50,50,98,true],[1325,50,50,98,true],[885,50,50,148,true],[1160,50,50,148,true],[1325,50,50,148,true]],
            birds: 6
        },
        {
            name: 'Level 6 — Grand Palace',
            pigs: [[830,'pink',true,202],[940,'pink',true,202],[1050,'yellow',true,202],[1160,'pink',true,202],[1270,'yellow',true,202],[1380,'pink',true,202]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[1325,50,50],[1380,50,50],[830,50,50,true],[885,50,50,true],[940,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1160,50,50,true],[1215,50,50,true],[1270,50,50,true],[1325,50,50,true],[1380,50,50,true],[830,50,50,98,true],[940,50,50,98,true],[1050,50,50,98,true],[1160,50,50,98,true],[1270,50,50,98,true],[1380,50,50,98,true],[830,50,50,148,true],[940,50,50,148,true],[1050,50,50,148,true],[1160,50,50,148,true],[1270,50,50,148,true],[1380,50,50,148,true]],
            birds: 8
        },
        {
            name: 'Level 7 — Step Palace',
            pigs: [[940,'pink',true,202],[1105,'yellow',true,202],[1270,'pink',true,202]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[1325,50,50],[1380,50,50],[830,50,50,true],[885,50,50,true],[940,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1160,50,50,true],[1215,50,50,true],[1270,50,50,true],[1325,50,50,true],[1380,50,50,true],[940,50,50,98,true],[1105,50,50,98,true],[1270,50,50,98,true],[940,50,50,148,true],[1105,50,50,148,true],[1270,50,50,148,true]],
            birds: 5
        },
        {
            name: 'Level 8 — Spire Palace',
            pigs: [[830,'pink',true,202],[940,'pink',true,202],[1050,'yellow',true,202],[1160,'pink',true,202],[1270,'yellow',true,202],[1380,'pink',true,202],[1490,'yellow',true,202]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[1325,50,50],[1380,50,50],[1435,50,50],[1490,50,50],[1545,50,50],[830,50,50,true],[885,50,50,true],[940,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1160,50,50,true],[1215,50,50,true],[1270,50,50,true],[1325,50,50,true],[1380,50,50,true],[1435,50,50,true],[1490,50,50,true],[1545,50,50,true],[830,50,50,98,true],[940,50,50,98,true],[1050,50,50,98,true],[1160,50,50,98,true],[1270,50,50,98,true],[1380,50,50,98,true],[1490,50,50,98,true],[830,50,50,148,true],[940,50,50,148,true],[1050,50,50,148,true],[1160,50,50,148,true],[1270,50,50,148,true],[1380,50,50,148,true],[1490,50,50,148,true]],
            birds: 9
        },
        {
            name: 'Level 9 — Royal Palace',
            pigs: [[885,'pink',true,202],[995,'yellow',true,202],[1105,'pink',true,202],[1215,'yellow',true,202],[1325,'pink',true,202],[1435,'yellow',true,202]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[1325,50,50],[1380,50,50],[1435,50,50],[830,50,50,true],[885,50,50,true],[940,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1160,50,50,true],[1215,50,50,true],[1270,50,50,true],[1325,50,50,true],[1380,50,50,true],[1435,50,50,true],[885,50,50,98,true],[995,50,50,98,true],[1105,50,50,98,true],[1215,50,50,98,true],[1325,50,50,98,true],[1435,50,50,98,true],[885,50,50,148,true],[995,50,50,148,true],[1105,50,50,148,true],[1215,50,50,148,true],[1325,50,50,148,true],[1435,50,50,148,true]],
            birds: 9
        },
        {
            name: 'Level 10 — Imperial Palace',
            pigs: [[885,'pink',true,202],[995,'yellow',true,202],[1105,'pink',true,202],[1215,'yellow',true,202],[1325,'pink',true,202],[1435,'yellow',true,202],[1545,'pink',true,202]],
            crates: [[830,50,50],[885,50,50],[940,50,50],[995,50,50],[1050,50,50],[1105,50,50],[1160,50,50],[1215,50,50],[1270,50,50],[1325,50,50],[1380,50,50],[1435,50,50],[1490,50,50],[1545,50,50],[830,50,50,true],[885,50,50,true],[940,50,50,true],[995,50,50,true],[1050,50,50,true],[1105,50,50,true],[1160,50,50,true],[1215,50,50,true],[1270,50,50,true],[1325,50,50,true],[1380,50,50,true],[1435,50,50,true],[1490,50,50,true],[1545,50,50,true],[885,50,50,98,true],[995,50,50,98,true],[1105,50,50,98,true],[1215,50,50,98,true],[1325,50,50,98,true],[1435,50,50,98,true],[1545,50,50,98,true],[885,50,50,148,true],[995,50,50,148,true],[1105,50,50,148,true],[1215,50,50,148,true],[1325,50,50,148,true],[1435,50,50,148,true],[1545,50,50,148,true]],
            birds: 10
        },
    ];

    // ===== PARSE LEVEL =====
    function parseLV(idx) {
        const l = LV[idx];
        const pigs = l.pigs.map(p => ({
            x: p[0], y: GY - PR - 4,
            type: p[1], raised: p[2] || false, raised2: typeof p[3] === 'number' ? p[3] : (p[3] || false)
        }));
        const crates = l.crates.map(c => ({
            x: c[0], y: (c[4] ? GY - c[2]/2 - c[3] - 4 : (c[3] ? GY - c[2]/2 - 52 : GY - c[2]/2 - 4)),
            w: c[1], h: c[2]
        }));
        pigs.forEach(p => {
            if (typeof p.raised2 === 'number') p.y = GY - PR - p.raised2;
            else if (p.raised2) p.y = GY - PR - 56;
            else if (p.raised) p.y = GY - PR - 54;
        });
        return { name: l.name, pigs, crates, birds: l.birds };
    }

    // ===== LOADING =====
    function load() {
        const saved = localStorage.getItem('ab_progress');
        if (saved) S.levelProgress = parseInt(saved) || 0;
        const items = [
            ['bg',ASSETS.bg],['cat',ASSETS.cat],['bird',ASSETS.bird],
            ['pink',ASSETS.pink],['pink2',ASSETS.pink2],
            ['yell',ASSETS.yell],['yell2',ASSETS.yell2],
            ['crate',ASSETS.crate],['cloud',ASSETS.cloud],
            ['mapBg',ASSETS.mapBg],
            ['explosion',ASSETS.explosion],
        ];
        S.total = items.length;
        items.forEach(([k,u]) => {
            const i = new Image();
            let done = false;
            i.onload = i.onerror = () => {
                if (done) return;
                done = true;
                S.loaded++;
                if (S.loaded >= S.total) { S.ready = true; start(); }
            };
            i.src = u;
            Img[k] = i;
        });
        // Fallback: force-start after 8s even if images hang
        setTimeout(() => { if (!S.ready) { S.ready = true; start(); } }, 8000);
    }

    // ===== CANVAS =====
    function fit(f) {
        const r = cont.getBoundingClientRect();
        const cw = r.width, ch = r.height;
        let cssW, cssH, pxW, pxH;
        if (isMobile()) {
            // Full screen on mobile — match pixel resolution to CSS
            cssW = cw; cssH = ch;
            pxW = Math.floor(cw); pxH = Math.floor(ch);
        } else {
            // Maintain 1600:700 aspect ratio with letterboxing
            const aspect = W / H;
            if (cw / ch > aspect) {
                cssH = ch; cssW = ch * aspect;
            } else {
                cssW = cw; cssH = cw / aspect;
            }
            pxW = W; pxH = H;
        }
        cssW = Math.floor(cssW); cssH = Math.floor(cssH);
        if (!f && cssW === lw && cssH === lh) return;
        lw = cssW; lh = cssH;
        cv.style.width = cssW + 'px';
        cv.style.height = cssH + 'px';
        cv.width = pxW; cv.height = pxH;
    }

    function wp(cx, cy) {
        const r = cv.getBoundingClientRect();
        let x = (cx - r.left) * (cv.width / r.width);
        let y = (cy - r.top) * (cv.height / r.height);
        // On mobile gameplay, invert the uniform-scale centered transform
        if (isMobile() && S.screen === 'playing') {
            const sc = Math.min(cv.width / W, cv.height / H);
            const ox = (cv.width - W * sc) / 2;
            const oy = (cv.height - H * sc) / 2;
            x = (x - ox) / sc;
            y = (y - oy) / sc;
        }
        return { x, y };
    }

    // ===== PHYSICS =====
    function initPhys() {
        eng = Engine.create({ gravity: { x: 0, y: GRAV } });
        world = eng.world;
        gnd = Bodies.rectangle(W/2, GY+25, W+200, 50, { isStatic: true, friction: 0.9 });
        lwall = Bodies.rectangle(-25, H/2, 50, H, { isStatic: true });
        rwall = Bodies.rectangle(W+25, H/2, 50, H, { isStatic: true });
        ceil = Bodies.rectangle(W/2, -25, W+200, 50, { isStatic: true });
        Composite.add(world, [gnd, lwall, rwall, ceil]);
    }

    // ===== OBJECTS =====
    function mkPig(x, y, t) {
        const p = t === 'pink';
        const b = Bodies.circle(x, y, PR, {
            restitution: 0.25, friction: 0.4, density: 0.003, frictionAir: 0.01,
            gameData: { type:'pig', hp: PIG_HP, img: p?Img.pink:Img.yell, img2: p?Img.pink2:Img.yell2 }
        });
        Composite.add(world, b);
        return b;
    }

    function mkCrate(x, y, w, h) {
        const b = Bodies.rectangle(x, y, w, h, {
            restitution: 0.08, friction: 0.6, density: 0.005,
            gameData: { type:'crate', hp: CRATE_HP, img: Img.crate }
        });
        Composite.add(world, b);
        return b;
    }

    function mkBird() {
        const b = Bodies.circle(0, -300, BR, {
            restitution: 0.35, friction: 0.06, frictionAir: 0.01, density: 0.004,
            gameData: { type:'bird', launched: false, img: Img.bird }
        });
        Composite.add(world, b);
        return b;
    }

    // ===== PARTICLE SYSTEM =====
    function spawnParticles(x, y, type, count) {
        for (let i = 0; i < count; i++) {
            S.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * (type === 'wood' ? 10 : 8),
                vy: -Math.random() * (type === 'wood' ? 10 : 7) - 2,
                life: 30 + Math.random() * 20,
                maxLife: 50,
                size: type === 'wood' ? 3 + Math.random() * 6 : 2 + Math.random() * 4,
                type,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.3,
            });
        }
    }

    function spawnScorePopup(x, y, pts) {
        S.scorePopups.push({ x, y, pts, life: 40, maxLife: 40 });
    }

    function drawParticles() {
        for (let i = S.particles.length - 1; i >= 0; i--) {
            const p = S.particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.15;
            p.vx *= 0.98;
            p.life--;
            p.rotation += p.rotSpeed;
            if (p.life <= 0) { S.particles.splice(i, 1); continue; }
            const a = p.life / p.maxLife;
            cx.save();
            cx.translate(p.x, p.y);
            cx.rotate(p.rotation);
            cx.globalAlpha = a;
            if (p.type === 'wood') {
                cx.fillStyle = '#8B5E3C';
                cx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
                cx.strokeStyle = '#6B3E1C';
                cx.lineWidth = 1;
                cx.strokeRect(-p.size/2, -p.size/4, p.size, p.size/2);
            } else if (p.type === 'fire') {
                cx.fillStyle = p.life > p.maxLife * 0.5 ? '#FFD700' : '#FF4500';
                cx.beginPath();
                cx.arc(0, 0, p.size/2 * a, 0, Math.PI * 2);
                cx.fill();
                cx.fillStyle = 'rgba(255,255,200,' + (a * 0.5) + ')';
                cx.beginPath();
                cx.arc(0, 0, p.size/4 * a, 0, Math.PI * 2);
                cx.fill();
            } else if (p.type === 'smoke') {
                const gray = Math.floor(80 + 80 * (1 - a));
                cx.fillStyle = 'rgba(' + gray + ',' + gray + ',' + gray + ',' + (a * 0.4) + ')';
                cx.beginPath();
                cx.arc(0, 0, p.size/2 * (1 + 0.5 * (1 - a)), 0, Math.PI * 2);
                cx.fill();
            } else if (p.type === 'debris') {
                cx.fillStyle = '#555';
                cx.fillRect(-p.size/2, -p.size/4, p.size, p.size/3);
            } else {
                cx.fillStyle = p.life > p.maxLife * 0.5 ? '#FFD700' : '#FF6B6B';
                cx.beginPath();
                cx.arc(0, 0, p.size/2 * a, 0, Math.PI * 2);
                cx.fill();
            }
            cx.restore();
        }
        for (let i = S.scorePopups.length - 1; i >= 0; i--) {
            const p = S.scorePopups[i];
            p.y -= 1.5;
            p.life--;
            const a = p.life / p.maxLife;
            cx.save();
            cx.globalAlpha = a;
            cx.fillStyle = '#FFD700';
            cx.font = 'bold 20px Arial';
            cx.textAlign = 'center';
            cx.textBaseline = 'middle';
            cx.fillText('+' + p.pts, p.x, p.y);
            cx.restore();
            if (p.life <= 0) S.scorePopups.splice(i, 1);
        }
    }

    // ===== LEVEL =====
    function loadLV(n) {
        const l = parseLV(n);
        S.lvl = n; S.pigs = []; S.crates = []; S.birds = [];
        S.curBird = null; S.curIdx = -1;
        S.launched = false; S.canDrag = true; S.drag = false;
        S.won = false; S.lost = false; S.trail = []; S.tick = 0;
        S.particles = []; S.scorePopups = []; S.score = 0;
        clearTimeout(S.checkTmr); clearTimeout(S.wlTmr); S.wlTmr = null; S.won = false; S.lost = false;
        l.pigs.forEach(p => S.pigs.push(mkPig(p.x, p.y, p.type)));
        l.crates.forEach(c => S.crates.push(mkCrate(c.x, c.y, c.w, c.h)));
        for (let i = 0; i < l.birds; i++) S.birds.push(mkBird());
        nextBird();
        updUI();
        showMsg(l.name);
        elUI.classList.remove('hidden');
        elUI.style.display = '';
        // Explode button: levels 4-6 (1 use), levels 8-10 (2 uses)
        S.explodeMode = false;
        S.explodeUses = 0;
        S.explosion = null;
        S.shake = { x: 0, y: 0, intensity: 0, decay: 0.85 };
        let canExplode = false;
        if (n >= 3 && n <= 5) { canExplode = true; S.explodeMaxUses = 1; }
        else if (n >= 7 && n <= 9) { canExplode = true; S.explodeMaxUses = 2; }
        else { S.explodeMaxUses = 0; }
        btnExplode.classList.toggle('hidden', !canExplode);
        btnExplode.disabled = false;
        btnExplode.textContent = '💥 EXPLODE';
        btnExplode.classList.remove('used');
        btnExplode.classList.remove('armed');
        armIndicator.classList.remove('active');
        updateExplodeBtn();
        startCloudReveal();
    }

    function nextBird() {
        if (S.screen !== 'playing') return;
        S.curIdx++;
        if (S.curIdx >= S.birds.length) { S.canDrag = false; checkWL(); return; }
        const b = S.birds[S.curIdx];
        S.curBird = b; b.gameData.launched = false;
        Body.setPosition(b, SC);
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0);
        Body.setAngle(b, 0);
        S.launched = false; S.canDrag = true; S.drag = false; S.trail = [];
        updUI();
    }

    // ===== HOLD BIRD BEFORE ENGINE UPDATE =====
    function holdBird() {
        if (!S.curBird || S.launched || S.curBird.gameData.launched) return;
        if (S.drag && S.dragPos) {
            Body.setPosition(S.curBird, S.dragPos);
            Body.setVelocity(S.curBird, { x: 0, y: 0 });
            return;
        }
        Body.setVelocity(S.curBird, { x: 0, y: 0 });
        Body.setPosition(S.curBird, SC);
    }

    // ===== SLINGSHOT DRAG =====
    function onGrab(pos) {
        if (!S.canDrag || S.won || S.lost || !S.curBird || S.curBird.gameData.launched) return;
        if (dist(pos, S.curBird.position) < 75) S.drag = true;
    }

    function onDrag(pos) {
        if (!S.drag || !S.curBird) return;
        let dx = pos.x - SC.x;
        let dy = pos.y - SC.y;
        if (dx > 0) dx = 0;
        if (dy < -20) dy = -20;
        const d = Math.sqrt(dx*dx + dy*dy);
        const clamp = Math.min(d, MAX_PULL);
        const ang = Math.atan2(dy, dx);
        S.dragPos = {
            x: SC.x + Math.cos(ang) * clamp,
            y: SC.y + Math.sin(ang) * clamp,
        };
        Body.setPosition(S.curBird, S.dragPos);
        Body.setVelocity(S.curBird, { x: 0, y: 0 });
    }

    function onRelease() {
        if (!S.drag) return;
        S.drag = false;
        S.dragPos = null;
        if (!S.curBird) { S.canDrag = true; return; }
        const dx = SC.x - S.curBird.position.x;
        const dy = SC.y - S.curBird.position.y;
        const pull = Math.sqrt(dx*dx + dy*dy);
        if (pull < 30) {
            Body.setVelocity(S.curBird, { x: 0, y: 0 });
            Body.setPosition(S.curBird, SC);
            S.canDrag = true;
            return;
        }
        S.launched = true; S.canDrag = false;
        S.curBird.gameData.launched = true;
        Body.setVelocity(S.curBird, { x: 0, y: 0 });
        Body.setAngularVelocity(S.curBird, 0);
        S.curBird.isSleeping = false;
        Body.setVelocity(S.curBird, {
            x: dx * POWER,
            y: dy * POWER,
        });
        if (S.curBird.position.y > GY - BR - 2) {
            Body.setPosition(S.curBird, {
                x: S.curBird.position.x,
                y: GY - BR - 2
            });
        }
        S.trail = []; S.tick = 0;
        clearTimeout(S.checkTmr);
        S.checkTmr = setTimeout(chkBird, 2000);
    }

    function chkBird() {
        if (S.screen !== 'playing' || S.won || S.lost) return;
        const b = S.curBird;
        if (!b || !b.gameData || !b.gameData.launched) { advBird(); return; }
        const v = b.velocity;
        const sp = Math.sqrt(v.x*v.x + v.y*v.y);
        const off = b.position.x > W + 200 || b.position.y > H + 200 || b.position.x < -300 || b.position.y < -600;
        if (off || sp < 0.25) advBird();
        else S.checkTmr = setTimeout(chkBird, 1200);
    }

    function advBird() {
        clearTimeout(S.checkTmr);
        if (S.screen !== 'playing' || S.won || S.lost) return;
        if (S.curIdx < S.birds.length - 1) setTimeout(nextBird, 600);
        else { S.canDrag = false; checkWL(); }
    }

    // ===== COLLISIONS (manual proximity check — guaranteed to fire) =====
    function triggerExplosion(x, y) {
        S.explosion = {
            x, y,
            radius: 20, maxRadius: 200,
            progress: 0,
            flash: 1,
            phase: 'flash'
        };
        // Screen shake!
        S.shake = { x: 0, y: 0, intensity: 12, decay: 0.88 };
        const dmgRadius = 140;
        [S.pigs, S.crates].forEach(arr => {
            for (let i = arr.length - 1; i >= 0; i--) {
                const t = arr[i];
                if (t.gameData.destroyed) continue;
                const dx = t.position.x - x, dy = t.position.y - y;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d < dmgRadius) {
                    const dmg = Math.floor(200 * (1 - d / dmgRadius));
                    t.gameData.hp -= dmg;
                    if (t.gameData.hp <= 0) {
                        destroyTarget(t, dmg);
                    }
                }
            }
        });
        // Spawn fire + smoke + debris particles
        for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 12;
            const type = i < 50 ? 'fire' : (i < 65 ? 'smoke' : 'debris');
            const sz = type === 'fire' ? 4 + Math.random() * 14 : (type === 'smoke' ? 8 + Math.random() * 18 : 2 + Math.random() * 6);
            S.particles.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 3,
                life: type === 'smoke' ? 35 + Math.random() * 20 : 15 + Math.random() * 25,
                maxLife: type === 'smoke' ? 55 : 40,
                size: sz,
                type: type,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.4,
            });
        }
        S.explodeMode = false;
        S.explodeUses++;
        armIndicator.classList.remove('active');
        btnExplode.classList.remove('armed');
        updateExplodeBtn();
    }

    function updateExplodeBtn() {
        const remaining = S.explodeMaxUses - S.explodeUses;
        if (remaining <= 0) {
            btnExplode.textContent = '✅ USED';
            btnExplode.classList.add('used');
            btnExplode.disabled = true;
        } else {
            btnExplode.textContent = '💥 EXPLODE (' + remaining + ')';
            btnExplode.classList.remove('used');
            btnExplode.disabled = false;
        }
    }

    function checkCollisions() {
        if (S.screen !== 'playing') return;
        // Find the launched bird(s) still in flight
        const launchedBirds = S.birds.filter(b => b && b.gameData && b.gameData.launched && !b.gameData.destroyed);
        for (const bird of launchedBirds) {
            const bv = bird.velocity;
            const sp = Math.sqrt(bv.x * bv.x + bv.y * bv.y);
            if (sp < 0.2) continue; // too slow to register
            // Check pigs
            for (const pig of S.pigs) {
                if (pig.gameData.destroyed) continue;
                const dx = bird.position.x - pig.position.x;
                const dy = bird.position.y - pig.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < BR + PR) {
                    if (S.explodeMode && S.explodeUses < S.explodeMaxUses) triggerExplosion(bird.position.x, bird.position.y);
                    hitTarget(pig, bv, 100);
                }
            }
            // Check crates
            for (const crate of S.crates) {
                if (crate.gameData.destroyed) continue;
                const dx = bird.position.x - crate.position.x;
                const dy = bird.position.y - crate.position.y;
                const hw = (crate.bounds.max.x - crate.bounds.min.x) / 2;
                const hh = (crate.bounds.max.y - crate.bounds.min.y) / 2;
                const ox = Math.max(0, Math.abs(dx) - hw);
                const oy = Math.max(0, Math.abs(dy) - hh);
                if (ox * ox + oy * oy < BR * BR) {
                    if (S.explodeMode && S.explodeUses < S.explodeMaxUses) triggerExplosion(bird.position.x, bird.position.y);
                    hitTarget(crate, bv, 20);
                }
            }
        }
        // pig ↔ crate / crate ↔ crate / pig ↔ pig collisions (use distance)
        for (let i = 0; i < S.pigs.length; i++) {
            for (let j = 0; j < S.crates.length; j++) {
                const pig = S.pigs[i], crate = S.crates[j];
                if (pig.gameData.destroyed || crate.gameData.destroyed) continue;
                const dx = pig.position.x - crate.position.x;
                const dy = pig.position.y - crate.position.y;
                const hw = (crate.bounds.max.x - crate.bounds.min.x) / 2;
                const hh = (crate.bounds.max.y - crate.bounds.min.y) / 2;
                const ox = Math.max(0, Math.abs(dx) - hw);
                const oy = Math.max(0, Math.abs(dy) - hh);
                if (ox * ox + oy * oy < PR * PR) {
                    hitTarget(pig, crate.velocity, 30);
                    hitTarget(crate, pig.velocity, 30);
                }
            }
        }
        for (let i = 0; i < S.crates.length; i++) {
            for (let j = i + 1; j < S.crates.length; j++) {
                const a = S.crates[i], b = S.crates[j];
                if (a.gameData.destroyed || b.gameData.destroyed) continue;
                const dx = a.position.x - b.position.x;
                const dy = a.position.y - b.position.y;
                const ha = (a.bounds.max.x - a.bounds.min.x) / 2;
                const hb = (b.bounds.max.x - b.bounds.min.x) / 2;
                if (Math.abs(dx) < ha + hb && Math.abs(dy) < 60) {
                    hitTarget(a, b.velocity, 15);
                    hitTarget(b, a.velocity, 15);
                }
            }
        }
    }

    function hitTarget(t, sv, pts) {
        if (t.gameData.destroyed) return;
        const sp = Math.sqrt(sv.x * sv.x + sv.y * sv.y);
        if (sp < 2) return;
        t.gameData.hp -= sp * 6;
        if (t.gameData.hp <= 0) {
            t.gameData.destroyed = true;
            destroyTarget(t, pts);
        }
    }

    function destroyTarget(b, pts) {
        const d = b.gameData;
        if (!d) return;
        S.score += pts;
        if (d.type === 'pig') {
            spawnParticles(b.position.x, b.position.y, 'sparkle', 15);
            spawnScorePopup(b.position.x, b.position.y - 20, pts);
            const i = S.pigs.indexOf(b); if (i !== -1) S.pigs.splice(i,1);
        } else {
            spawnParticles(b.position.x, b.position.y, 'wood', 10);
            spawnScorePopup(b.position.x, b.position.y - 20, pts);
            const i = S.crates.indexOf(b); if (i !== -1) S.crates.splice(i,1);
        }
        Composite.remove(world, b);
        updUI(); checkWL();
    }

    // ===== WIN / LOSE =====
    function checkWL() {
        if (S.won || S.lost) return;
        if (S.pigs.length === 0) {
            S.won = true;
            clearTimeout(S.checkTmr);
            S.wlTmr = setTimeout(showComplete, 1000);
            return;
        }
        if (S.curIdx >= S.birds.length - 1 && S.pigs.length > 0) {
            let allStill = true;
            for (const b of S.birds) {
                if (!b || b.gameData.destroyed) continue;
                const v = b.velocity;
                if (Math.sqrt(v.x*v.x + v.y*v.y) > 0.2) { allStill = false; break; }
            }
            if (allStill) {
                S.lost = true;
                clearTimeout(S.checkTmr);
                S.wlTmr = setTimeout(showLost, 800);
            }
        }
    }

    // ===== SCREEN TRANSITIONS =====
    function showComplete() {
        S.screen = 'complete';
        completeScore.textContent = 'Score: ' + S.score;
        btnNextLevel.style.display = S.lvl < LV.length - 1 ? 'inline-block' : 'none';
        completeOverlay.classList.add('show');
        if (S.lvl + 1 > S.levelProgress) {
            S.levelProgress = S.lvl + 1;
            localStorage.setItem('ab_progress', S.levelProgress);
        }
    }

    function showLost() {
        S.screen = 'lost';
        gameoverScore.textContent = 'Score: ' + S.score;
        gameoverOverlay.classList.add('show');
    }

    function showMsg(t) {
        elMsg.textContent = t; elMsg.classList.add('show');
        setTimeout(() => elMsg.classList.remove('show'), 2000);
    }

    function resetAll() {
        clearTimeout(S.checkTmr); clearTimeout(S.wlTmr); S.wlTmr = null;
        Composite.allBodies(world).filter(b => !b.isStatic).forEach(b => Composite.remove(world, b));
        S.pigs = []; S.crates = []; S.birds = []; S.curBird = null; S.curIdx = -1;
        S.score = 0; S.trail = []; S.particles = []; S.scorePopups = [];
    }

    // ===== MAP / MENU SCREEN (war/battlefield theme) =====
    function drawMap() {
        const mobile = isMobile();
        const CW = mobile ? cv.width : W;
        const CH = mobile ? cv.height : H;
        const ml = mobile ? mapLevelsMobile : mapLevels;
        cx.clearRect(0, 0, CW, CH);

        // Map background image (fill screen on mobile, cover on desktop)
        const mb = Img.mapBg;
        if (mb && mb.complete && mb.naturalWidth > 0) {
            if (mobile) {
                // Cover: fill canvas preserving image aspect ratio (crop edges)
                const ir = mb.naturalWidth / mb.naturalHeight;
                const cr2 = CW / CH;
                let sw, sh, sx, sy;
                if (ir > cr2) {
                    sh = mb.naturalHeight; sw = sh * cr2;
                    sx = (mb.naturalWidth - sw) / 2; sy = 0;
                } else {
                    sw = mb.naturalWidth; sh = sw / cr2;
                    sx = 0; sy = (mb.naturalHeight - sh) / 2;
                }
                cx.drawImage(mb, sx, sy, sw, sh, 0, 0, CW, CH);
            } else {
                cx.drawImage(mb, 0, 0, W, H);
            }
        } else {
            const bg = cx.createLinearGradient(0, 0, 0, CH);
            bg.addColorStop(0, '#3a2a1a'); bg.addColorStop(1, '#5a4a3a');
            cx.fillStyle = bg; cx.fillRect(0, 0, CW, CH);
        }

        // Mobile: map positions as ratio of canvas
        let ml2 = ml;
        let nodeSize = 26, labelSize = 28, titleSize = 56, lineW = 6, dashLen = 4;
        if (mobile) {
            ml2 = ml.map(p => ({ x: p.x * CW, y: p.y * CH }));
            nodeSize = Math.max(16, CW * 0.05);
            labelSize = Math.max(13, CW * 0.045);
            titleSize = Math.max(22, CW * 0.065);
            lineW = Math.max(2, CW * 0.008);
            dashLen = Math.max(3, CW * 0.01);
        }

        if (!mobile) {
            cx.fillStyle = '#c0392b';
            cx.font = 'bold 54px Arial';
            cx.textAlign = 'center'; cx.textBaseline = 'top';
            cx.shadowColor = 'rgba(0,0,0,0.8)'; cx.shadowBlur = 8;
            cx.fillText('ANGRY BIRDS', W/2, 18);
            cx.shadowBlur = 0;
            cx.fillStyle = '#e74c3c';
            cx.font = 'bold 56px Arial';
            cx.fillText('ANGRY BIRDS', W/2, 16);
        } else {
            cx.fillStyle = '#c0392b';
            cx.font = 'bold ' + titleSize + 'px Arial';
            cx.textAlign = 'center'; cx.textBaseline = 'top';
            cx.shadowColor = 'rgba(0,0,0,0.8)'; cx.shadowBlur = 6;
            cx.fillText('ANGRY BIRDS', CW / 2, 6);
            cx.shadowBlur = 0;
            cx.fillStyle = '#e74c3c';
            cx.font = 'bold ' + Math.floor(titleSize * 1.05) + 'px Arial';
            cx.fillText('ANGRY BIRDS', CW / 2, 5);
        }

        // Connecting path (dotted/dashed)
        cx.beginPath();
        if (mobile) {
            // Curvy/wavy path
            cx.moveTo(ml2[0].x, ml2[0].y);
            for (let i = 1; i < ml2.length; i++) {
                const a = ml2[i - 1], b = ml2[i];
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const wave = (i % 2 === 0 ? 1 : -1) * nodeSize * 1.5;
                const cpx = mx + wave * 0.8;
                const cpy = my + wave * 0.5;
                cx.quadraticCurveTo(cpx, cpy, b.x, b.y);
            }
        } else {
            cx.moveTo(ml2[0].x, ml2[0].y);
            for (let i = 1; i < ml2.length; i++) {
                cx.lineTo(ml2[i].x, ml2[i].y);
            }
        }
        if (mobile) {
            cx.strokeStyle = 'rgba(0,0,0,0.35)'; cx.lineWidth = lineW;
        } else {
            cx.strokeStyle = 'rgba(200,200,180,0.15)'; cx.lineWidth = 6;
        }
        cx.lineCap = 'round';
        cx.setLineDash([dashLen, dashLen * 3]);
        cx.stroke();
        cx.setLineDash([]);

        // Blood drops along path (only desktop)
        if (!mobile) {
            for (let i = 0; i < ml2.length - 1; i++) {
                const a = ml2[i], b = ml2[i+1];
                for (let t = 3; t < 10; t += 3) {
                    const rx = a.x + (b.x - a.x) * t / 10;
                    const ry = a.y + (b.y - a.y) * t / 10 + Math.sin(i * 10 + t * 5) * 3;
                    cx.fillStyle = 'rgba(180,40,30,0.25)';
                    cx.beginPath(); cx.arc(rx, ry, 3, 0, Math.PI * 2); cx.fill();
                }
            }
        }

        // Glow behind current level node
        const curP = ml2[S.lvl];
        if (curP) {
            const glowR = mobile ? nodeSize * 2.5 : 60;
            const grd = cx.createRadialGradient(curP.x, curP.y, 5, curP.x, curP.y, glowR);
            grd.addColorStop(0, 'rgba(192,57,43,0.25)'); grd.addColorStop(1, 'rgba(192,57,43,0)');
            cx.fillStyle = grd;
            cx.beginPath(); cx.arc(curP.x, curP.y, glowR, 0, Math.PI * 2); cx.fill();
        }

        // Nodes
        for (let i = 0; i < ml2.length; i++) {
            const p = ml2[i];
            const unlocked = i <= S.levelProgress;
            const done = i < S.levelProgress;

            cx.save();
            cx.translate(p.x, p.y);

            const or = mobile ? nodeSize : 26;
            const ir = mobile ? nodeSize * 0.78 : 22;

            // Outer ring
            cx.beginPath(); cx.arc(0, 0, or, 0, Math.PI * 2);
            cx.strokeStyle = unlocked ? (done ? '#2ecc71' : '#f39c12') : 'rgba(120,120,120,0.4)';
            cx.lineWidth = mobile ? Math.max(1.5, nodeSize * 0.1) : 3;
            cx.stroke();

            // Fill
            cx.beginPath(); cx.arc(0, 0, ir, 0, Math.PI * 2);
            if (done) cx.fillStyle = '#1a3a22';
            else if (unlocked) cx.fillStyle = '#3a2a10';
            else cx.fillStyle = 'rgba(30,30,40,0.5)';
            cx.fill();

            if (done) {
                cx.strokeStyle = '#2ecc71';
                cx.lineWidth = mobile ? Math.max(2, nodeSize * 0.15) : 4;
                cx.lineCap = 'round'; cx.lineJoin = 'round';
                const c = nodeSize * 0.35;
                cx.beginPath(); cx.moveTo(-c * 0.8, c * 0.15);
                cx.lineTo(-c * 0.25, c * 0.7);
                cx.lineTo(c * 0.75, -c * 0.5);
                cx.stroke();
            } else if (unlocked) {
                cx.strokeStyle = '#f39c12';
                cx.lineWidth = mobile ? Math.max(1, nodeSize * 0.07) : 2;
                const c2 = nodeSize * 0.6;
                const arm = nodeSize * 0.7;
                cx.beginPath(); cx.arc(0, 0, c2, 0, Math.PI * 2); cx.stroke();
                cx.beginPath(); cx.arc(0, 0, nodeSize * 0.2, 0, Math.PI * 2); cx.stroke();
                cx.beginPath(); cx.moveTo(-arm, 0); cx.lineTo(arm, 0); cx.stroke();
                cx.beginPath(); cx.moveTo(0, -arm); cx.lineTo(0, arm); cx.stroke();
                cx.fillStyle = '#f39c12';
                cx.beginPath(); cx.arc(0, 0, nodeSize * 0.1, 0, Math.PI * 2); cx.fill();
            } else {
                cx.strokeStyle = 'rgba(120,120,120,0.5)';
                cx.lineWidth = mobile ? Math.max(1.5, nodeSize * 0.1) : 3;
                cx.lineCap = 'round';
                const x2 = nodeSize * 0.35;
                cx.beginPath(); cx.moveTo(-x2, -x2); cx.lineTo(x2, x2); cx.stroke();
                cx.beginPath(); cx.moveTo(x2, -x2); cx.lineTo(-x2, x2); cx.stroke();
            }

            // Level number on locked nodes
            if (!done && !unlocked) {
                cx.fillStyle = 'rgba(255,255,255,0.7)';
                cx.font = 'bold ' + Math.max(8, nodeSize * 0.4) + 'px Arial';
                cx.textAlign = 'center'; cx.textBaseline = 'middle';
                cx.fillText(i + 1, 0, 0);
            }

            // Label below
            cx.fillStyle = mobile ? '#e74c3c' : (unlocked ? '#e74c3c' : 'rgba(180,60,40,0.5)');
            cx.font = 'bold ' + labelSize + 'px Arial';
            cx.textBaseline = 'top'; cx.textAlign = 'center';
            cx.fillText('Level ' + (i + 1), 0, or + 6);

            cx.restore();
        }

        // Instructions
        if (mobile) {
            cx.fillStyle = 'rgba(180,180,180,0.6)';
            cx.font = Math.max(11, Math.floor(CW * 0.035)) + 'px Arial';
            cx.textAlign = 'center'; cx.textBaseline = 'bottom';
            cx.fillText('Tap a level to play', CW / 2, CH - 6);
        } else {
            cx.fillStyle = 'rgba(180,180,180,0.4)';
            cx.font = '15px Arial';
            cx.textAlign = 'center'; cx.textBaseline = 'bottom';
            cx.fillText('Click a level to play', W/2, H - 10);
        }
    }

    function onMapClick(pos) {
        const mobile = isMobile();
        const ml = mobile ? mapLevelsMobile : mapLevels;
        for (let i = 0; i <= S.levelProgress; i++) {
            const mp = mobile ? { x: ml[i].x * cv.width, y: ml[i].y * cv.height } : ml[i];
            if (dist(pos, mp) < (mobile ? 55 : 48)) {
                completeOverlay.classList.remove('show');
                gameoverOverlay.classList.remove('show');
                clearTimeout(S.wlTmr); S.wlTmr = null; S.won = false; S.lost = false;
                S.screen = 'playing';
                initPhys();
                loadLV(i);
                return;
            }
        }
    }

    // ===== RENDERING =====
    function rRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawLoad() {
        if (S.ready) return;
        const bg = cx.createRadialGradient(W/2, H/2, 50, W/2, H/2, 500);
        bg.addColorStop(0, '#1a1410'); bg.addColorStop(1, '#0a0806');
        cx.fillStyle = bg; cx.fillRect(0,0,W,H);

        // Animated gear / spinner dots
        const t = Date.now() * 0.004;
        for (let i = 0; i < 8; i++) {
            const a = t + i * Math.PI / 4;
            const dx = Math.cos(a) * 30, dy = Math.sin(a) * 30;
            cx.fillStyle = 'rgba(192,57,43,' + (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(a))) + ')';
            cx.beginPath(); cx.arc(W/2 + dx, H/2 - 50 + dy, 3, 0, Math.PI*2); cx.fill();
        }

        cx.fillStyle = '#c0392b';
        cx.font = 'bold 32px Arial';
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText('LOADING', W/2, H/2 - 60);

        const p = S.total > 0 ? S.loaded / S.total : 0;

        // Progress bar background
        cx.fillStyle = 'rgba(60,40,30,0.5)';
        const bx = W/2 - 150, by = H/2 + 10, bw = 300, bh = 18;
        rRect(cx, bx, by, bw, bh, 4); cx.fill();

        // Progress bar fill
        if (p > 0) {
            const grd = cx.createLinearGradient(bx, 0, bx + bw * p, 0);
            grd.addColorStop(0, '#c0392b'); grd.addColorStop(1, '#e74c3c');
            cx.fillStyle = grd;
            rRect(cx, bx + 2, by + 2, (bw - 4) * p, bh - 4, 3); cx.fill();
        }

        // Percentage
        cx.fillStyle = '#d5c4a1';
        cx.font = '13px Arial';
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText(Math.floor(p * 100) + '%', W/2, by + bh / 2);

        // Status text
        const loaded = S.loaded;
        cx.fillStyle = 'rgba(180,180,160,0.5)';
        cx.font = '12px Arial';
        cx.fillText(loaded + ' / ' + S.total + ' assets', W/2, by + bh + 22);
    }

    function draw() {
        cx.clearRect(0, 0, W, H);
        if (!S.ready) return;

        // ---- Background ----
        const bg = Img.bg;
        if (bg && bg.complete && bg.naturalWidth > 0) cx.drawImage(bg, 0, 0, W, H);
        else {
            const g = cx.createLinearGradient(0,0,0,H);
            g.addColorStop(0,'#4dc9f6'); g.addColorStop(0.5,'#87CEEB'); g.addColorStop(1,'#a8d8ea');
            cx.fillStyle = g; cx.fillRect(0,0,W,H);
        }
        // Ground
        cx.fillStyle = '#5a8a3c'; cx.fillRect(0, GY, W, H-GY);
        cx.fillStyle = '#6b9e47'; cx.fillRect(0, GY, W, 5);
        cx.fillStyle = '#4a7a2e';
        for (let i = 0; i < W; i += 50) cx.fillRect(i+8, GY+5, 34, 7);

        // ---- Clouds ----
        const cl = Img.cloud;
        if (cl && cl.complete && cl.naturalWidth > 0) {
            if (S.clouds.length === 0) S.clouds = [
                {x:180,y:70,s:0.7},{x:580,y:40,s:0.5},{x:1020,y:80,s:0.6},{x:1380,y:50,s:0.4},
            ];
            S.clouds.forEach(c => { cx.globalAlpha = 0.65; cx.drawImage(cl, c.x, c.y, 160*c.s, 80*c.s); cx.globalAlpha = 1; });
        }

        // ---- Collect & sort bodies for z-order ----
        const all = Composite.allBodies(world);
        const visible = all.filter(b => b.gameData && !b.gameData.destroyed);

        // Draw in order: crates, pigs, then birds (bird on top of slingshot)
        for (const b of visible) {
            if (b.gameData.type === 'crate') drawSprite(b, b.gameData.img, b.bounds.max.x-b.bounds.min.x, b.bounds.max.y-b.bounds.min.y);
        }
        for (const b of visible) {
            if (b.gameData.type === 'pig') {
                const img = b.gameData.hp < PIG_HP*0.5 ? b.gameData.img2 : b.gameData.img;
                drawSprite(b, img, PR*2.4, PR*2.4, b.gameData.hp < PIG_HP*0.6);
            }
        }

        // ---- Slingshot (drawn behind bird) ----
        const cat = Img.cat;
        if (cat && cat.complete && cat.naturalWidth > 0) {
            cx.drawImage(cat, SX - CAT_W/2, SY, CAT_W, CAT_H);
        } else {
            cx.fillStyle = '#5c3a1e';
            cx.fillRect(SX-6, SY+10, 12, CAT_H-10);
            cx.fillRect(SX-18, SY, 36, 14);
        }

        // ---- Bird ----
        for (const b of visible) {
            if (b.gameData.type === 'bird') drawSprite(b, b.gameData.img, BR*2.4, BR*2.4);
        }

        // ---- Rubber band ----
        const bird = S.curBird;
        if (bird && !bird.gameData.destroyed && !S.launched) {
            cx.save();
            cx.strokeStyle = '#2a1a0a'; cx.lineWidth = 6; cx.lineCap = 'round';
            const bx = bird.position.x, by = bird.position.y;
            cx.beginPath(); cx.moveTo(FL.x, FL.y); cx.lineTo(bx, by); cx.stroke();
            cx.beginPath(); cx.moveTo(FR.x, FR.y); cx.lineTo(bx, by); cx.stroke();
            cx.strokeStyle = '#5a3a1a'; cx.lineWidth = 2.5;
            cx.beginPath(); cx.moveTo(FL.x, FL.y); cx.lineTo(bx, by); cx.stroke();
            cx.beginPath(); cx.moveTo(FR.x, FR.y); cx.lineTo(bx, by); cx.stroke();
            cx.restore();
        }

        // ---- Trajectory preview (matches Matter.js actual physics) ----
        if (S.drag && bird) {
            const dx = SC.x - bird.position.x, dy = SC.y - bird.position.y;
            const pull = Math.sqrt(dx*dx + dy*dy);
            if (pull > 15) {
                const vx = dx * POWER, vy = dy * POWER;
                const sx = bird.position.x, sy = Math.min(bird.position.y, GY - BR - 2);
                cx.save();
                cx.strokeStyle = 'rgba(255,255,255,0.6)'; cx.lineWidth = 2.5; cx.setLineDash([8, 6]);
                cx.beginPath();
                cx.moveTo(sx, sy);
                let px = sx, py = sy, cvx = vx, cvy = vy;
                for (let i = 0; i < 120; i++) {
                    cvx *= 0.99; cvy *= 0.99; cvy += GRAV_EFF;
                    px += cvx; py += cvy;
                    if (py < BR + 2) { py = BR + 2; cvy = 0; }
                    if (py > GY - BR - 2) break;
                    cx.lineTo(px, py);
                }
                cx.stroke(); cx.setLineDash([]);

                cx.fillStyle = 'rgba(255,255,255,0.5)';
                px = sx; py = sy; cvx = vx; cvy = vy;
                for (let i = 0; i < 80; i++) {
                    cvx *= 0.99; cvy *= 0.99; cvy += GRAV_EFF;
                    px += cvx; py += cvy;
                    if (py < BR + 2) { py = BR + 2; cvy = 0; }
                    if (py > GY - BR - 2) break;
                    if (i % 4 === 0) { cx.beginPath(); cx.arc(px, py, 3.5, 0, Math.PI*2); cx.fill(); }
                }
                cx.restore();
            }
        }

        // ---- Bird trail ----
        if (bird && bird.gameData.launched && S.launched) {
            S.tick++;
            if (S.tick % 2 === 0) S.trail.push({x: bird.position.x, y: bird.position.y, life: 22});
            S.trail = S.trail.filter(t => t.life-- > 0);
            cx.save();
            S.trail.forEach(t => {
                const a = t.life / 22;
                cx.fillStyle = 'rgba(255,255,200,' + (a * 0.45) + ')';
                cx.beginPath(); cx.arc(t.x, t.y, 3.5 * a, 0, Math.PI*2); cx.fill();
                cx.fillStyle = 'rgba(255,200,100,' + (a * 0.25) + ')';
                cx.beginPath(); cx.arc(t.x, t.y, 5 * a, 0, Math.PI*2); cx.fill();
            });
            cx.restore();
        }
    }

    function drawSprite(b, img, w, h, flash) {
        cx.save();
        cx.translate(b.position.x, b.position.y);
        cx.rotate(b.angle);
        if (flash) cx.globalAlpha = 0.6;
        if (img && img.complete && img.naturalWidth > 0) {
            cx.drawImage(img, -w/2, -h/2, w, h);
        } else {
            // Fallback: colored shape
            const t = b.gameData ? b.gameData.type : 'crate';
            if (t === 'pig') {
                cx.fillStyle = '#5a9e3e'; cx.beginPath(); cx.arc(0, 0, w/2.4, 0, Math.PI*2); cx.fill();
                cx.fillStyle = '#4a8e2e'; cx.beginPath(); cx.arc(-4, -4, 5, 0, Math.PI*2); cx.fill();
                cx.fillStyle = '#3a7e1e'; cx.beginPath(); cx.arc(3, -3, 4, 0, Math.PI*2); cx.fill();
            } else if (t === 'bird') {
                cx.fillStyle = '#e74c3c'; cx.beginPath(); cx.arc(0, 0, w/2.4, 0, Math.PI*2); cx.fill();
                cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(-5, -5, 5, 0, Math.PI*2); cx.fill();
                cx.fillStyle = '#222'; cx.beginPath(); cx.arc(-5, -5, 2.5, 0, Math.PI*2); cx.fill();
            } else {
                cx.fillStyle = '#8B5E3C'; cx.fillRect(-w/2, -h/2, w, h);
                cx.strokeStyle = '#6B3E1C'; cx.lineWidth = 1.5; cx.strokeRect(-w/2, -h/2, w, h);
            }
        }
        cx.restore();
    }

    function updUI() {
        elScore.textContent = 'Score: ' + S.score;
        const rem = S.birds.length - S.curIdx - 1;
        elBirds.textContent = 'Birds: ' + Math.max(0, rem);
    }

    function dist(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }

    // ===== INPUT =====
    function setupInput() {
        cv.addEventListener('mousedown', e => {
            e.preventDefault();
            const pos = wp(e.clientX, e.clientY);
            if (S.screen === 'menu') onMapClick(pos);
            else onGrab(pos);
        });
        window.addEventListener('mousemove', e => onDrag(wp(e.clientX, e.clientY)));
        window.addEventListener('mouseup', onRelease);

        cv.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.touches[0];
            if (!t) return;
            const pos = wp(t.clientX, t.clientY);
            if (S.screen === 'menu') onMapClick(pos);
            else onGrab(pos);
        }, {passive:false});
        window.addEventListener('touchmove', e => { e.preventDefault(); const t=e.touches[0]; if(t) onDrag(wp(t.clientX,t.clientY)); }, {passive:false});
        window.addEventListener('touchend', e => { e.preventDefault(); onRelease(); }, {passive:false});
        cv.addEventListener('contextmenu', e => e.preventDefault());

        // Overlay buttons
        function closeOverlays() {
            completeOverlay.classList.remove('show');
            gameoverOverlay.classList.remove('show');
            clearTimeout(S.wlTmr); S.wlTmr = null; S.won = false; S.lost = false;
        }
        btnNextLevel.addEventListener('click', () => {
            closeOverlays();
            S.screen = 'playing';
            resetAll();
            initPhys();
            loadLV(S.lvl + 1);
        });
        btnMenu.addEventListener('click', () => {
            closeOverlays();
            S.screen = 'menu';
            elUI.classList.add('hidden');
            startCloudReveal();
        });
        btnRetry.addEventListener('click', () => {
            closeOverlays();
            S.screen = 'playing';
            resetAll();
            initPhys();
            loadLV(S.lvl);
        });
        btnMenuGo.addEventListener('click', () => {
            closeOverlays();
            S.screen = 'menu';
            elUI.classList.add('hidden');
            startCloudReveal();
        });

        btnExplode.addEventListener('click', () => {
            if (S.explodeUses >= S.explodeMaxUses || S.explodeMode) return;
            S.explodeMode = true;
            btnExplode.textContent = '💥 ARMED';
            btnExplode.classList.add('armed');
            armIndicator.classList.add('active');
        });
    }

    // ===== CLOUD REVEAL =====
    function startCloudReveal() {
        const clouds = [];
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 30 + Math.random() * 100;
            clouds.push({
                x: W/2 + Math.cos(a) * d, y: H/2 + Math.sin(a) * d,
                s: 0.5 + Math.random() * 0.7,
                dx: Math.cos(a) * (6 + Math.random() * 8),
                dy: Math.sin(a) * (6 + Math.random() * 8),
                delay: Math.random() * 0.2,
            });
        }
        S.cloudReveal = { clouds, progress: 0 };
    }

    function drawExplosion() {
        const e = S.explosion;
        if (!e) return;
        e.progress = Math.min(1, e.progress + 0.05);
        const r = e.radius + (e.maxRadius - e.radius) * e.progress;
        const a = 1 - e.progress;

        // Apply shake
        if (S.shake.intensity > 0.5 && e.progress < 0.4) {
            S.shake.x = (Math.random() - 0.5) * 2 * S.shake.intensity;
            S.shake.y = (Math.random() - 0.5) * 2 * S.shake.intensity;
            S.shake.intensity *= S.shake.decay;
        }

        cx.save();

        // Phase 1: White flash
        if (e.progress < 0.15) {
            const flash = 1 - e.progress / 0.15;
            cx.fillStyle = 'rgba(255,255,200,' + (flash * 0.6) + ')';
            cx.fillRect(0, 0, W, H);
        }

        // Phase 2: Explosion sprite
        const exImg = Img.explosion;
        if (exImg && exImg.complete && exImg.naturalWidth > 0) {
            const s = r / 200 * 2.5;
            cx.globalAlpha = Math.min(1, a * 1.5);
            cx.drawImage(exImg, e.x - 100 * s, e.y - 100 * s, 200 * s, 200 * s);
            cx.globalAlpha = 1;
        }

        // Fireball glow
        const grd = cx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        grd.addColorStop(0, 'rgba(255,255,200,' + (a * 0.9) + ')');
        grd.addColorStop(0.2, 'rgba(255,180,50,' + (a * 0.7) + ')');
        grd.addColorStop(0.5, 'rgba(200,60,20,' + (a * 0.4) + ')');
        grd.addColorStop(0.8, 'rgba(120,30,10,' + (a * 0.15) + ')');
        grd.addColorStop(1, 'rgba(40,10,5,0)');
        cx.fillStyle = grd;
        cx.beginPath(); cx.arc(e.x, e.y, r, 0, Math.PI * 2); cx.fill();

        // Hot core
        if (e.progress < 0.4) {
            const coreA = 1 - e.progress / 0.4;
            cx.fillStyle = 'rgba(255,255,220,' + (coreA * 0.8) + ')';
            cx.beginPath(); cx.arc(e.x, e.y, r * 0.2 * (1 - e.progress * 1.5), 0, Math.PI * 2); cx.fill();
        }

        // Shockwave ring
        cx.strokeStyle = 'rgba(255,255,255,' + (a * 0.5) + ')';
        cx.lineWidth = 3 * a + 1;
        cx.beginPath(); cx.arc(e.x, e.y, r * 0.88, 0, Math.PI * 2); cx.stroke();

        // Secondary shockwave
        cx.strokeStyle = 'rgba(255,200,100,' + (a * 0.25) + ')';
        cx.lineWidth = 2 * a;
        cx.beginPath(); cx.arc(e.x, e.y, r * 0.96, 0, Math.PI * 2); cx.stroke();

        cx.restore();
        if (e.progress >= 1) S.explosion = null;
    }

    function drawCloudReveal() {
        const r = S.cloudReveal;
        if (!r) return;
        const cl = Img.cloud;
        r.progress = Math.min(1, r.progress + 0.025);
        const p = r.progress;
        // Dark vignette overlay that fades
        cx.fillStyle = 'rgba(10,8,6,' + (0.6 * (1-p)) + ')';
        cx.fillRect(0, 0, W, H);
        r.clouds.forEach(c => {
            const lp = Math.max(0, Math.min(1, (p - c.delay) / (1 - c.delay)));
            const slide = lp * 45;
            const cx2 = c.x + c.dx * slide;
            const cy2 = c.y + c.dy * slide;
            const alpha = 0.5 * (1 - lp) * (1 - lp);
            cx.globalAlpha = alpha;
            if (cl && cl.complete && cl.naturalWidth > 0) {
                cx.drawImage(cl, cx2, cy2, 160*c.s, 80*c.s);
            } else {
                cx.fillStyle = '#d4c4a0';
                cx.beginPath(); cx.arc(cx2, cy2, 30*c.s, 0, Math.PI*2); cx.fill();
                cx.fillStyle = '#e4d4b0';
                cx.beginPath(); cx.arc(cx2-5*c.s, cy2-5*c.s, 18*c.s, 0, Math.PI*2); cx.fill();
            }
        });
        cx.globalAlpha = 1;
        if (r.progress >= 1) S.cloudReveal = null;
    }

    // ===== LOOP =====
    function loop() {
        fit();
        const playing = S.screen === 'playing';
        const mobile = isMobile();
        let sx = 0, sy = 0;
        if (S.shake.intensity > 0.5) {
            sx = (Math.random() - 0.5) * 2 * S.shake.intensity;
            sy = (Math.random() - 0.5) * 2 * S.shake.intensity;
            S.shake.intensity *= S.shake.decay;
        }
        // Reset transform for this frame
        cx.setTransform(1, 0, 0, 1, 0, 0);
        cx.clearRect(0, 0, cv.width, cv.height);

        if (S.screen === 'menu') {
            drawMap();
            drawCloudReveal();
            drawParticles();
        } else if (playing) {
            if (eng) { holdBird(); Engine.update(eng, 1000/60); checkCollisions(); }
            // On mobile, scale uniformly to fit canvas (no stretch)
            if (mobile) {
                const sc = Math.min(cv.width / W, cv.height / H);
                const ox = (cv.width - W * sc) / 2;
                const oy = (cv.height - H * sc) / 2;
                cx.setTransform(sc, 0, 0, sc, ox + sx, oy + sy);
            } else {
                cx.setTransform(1, 0, 0, 1, sx, sy);
            }
            draw();
            drawExplosion();
            drawCloudReveal();
            drawParticles();
        } else {
            drawParticles();
        }
        requestAnimationFrame(loop);
    }

    // ===== START =====
    function start() {
        const el = document.getElementById('loading-screen');
        if (el) { el.style.display = 'none'; }
        S.screen = 'menu';
        fit(true);
        setupInput();
        startCloudReveal();
        loop();
    }

    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => setTimeout(fit, 300));

    load();
})();
