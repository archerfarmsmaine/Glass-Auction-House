const REFRESH_MS = 60_000;

const SPONSORS = [
  { href: "https://archerteamrealty.com/", img: "sponsors/archer-and-associates.png", alt: "Archer and Associates Real Estate Team", dark: true },
  { href: "https://archerelectricalpllc.com/", img: "sponsors/archer-electrical.png", alt: "Archer Electrical PLLC", dark: false },
  { href: "tel:6036862926", text: "Have Gold or Silver to sell? Call or Text 603-686-2926 NOW!" },
  { text: "SKYS CLEANOUTS. TOO BUSY DONT INQUIRE" },
];

function buildTickerGroup(container, repeats) {
  for (let i = 0; i < repeats; i++) {
    for (const s of SPONSORS) {
      const el = document.createElement(s.href ? "a" : "div");
      if (s.href) {
        el.href = s.href;
        if (s.img) {
          el.target = "_blank";
          el.rel = "noopener noreferrer";
        }
      }
      el.className = "sponsor-card" + (s.dark ? " sponsor-card--dark" : "") + (s.text ? " sponsor-card--text" : "");
      if (s.img) {
        const img = document.createElement("img");
        img.src = s.img;
        img.alt = s.alt;
        el.appendChild(img);
      } else {
        el.textContent = s.text;
      }
      container.appendChild(el);
    }
  }
}

// Two identical groups side by side, animated from translateX(0) to -50%,
// so the loop point lands exactly where the (identical) second group began.
buildTickerGroup(document.getElementById("tickerGroupA"), 5);
buildTickerGroup(document.getElementById("tickerGroupB"), 5);

const fmtMoney = (n) =>
  n == null ? "—" : "$" + n.toLocaleString("en-US");

const fmtTime = (epochSeconds) =>
  new Date(epochSeconds * 1000).toLocaleTimeString();

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Browsers refuse to play audio until it's unlocked by a real user gesture
// (a click), and only a resume() called *directly inside* that gesture's
// event handler counts — a poll-triggered resume() a minute later is
// silently ignored. That's why the chime could go quiet with no error: the
// context just never actually unlocked. This button is the reliable fix —
// it also gives the user an explicit on/off control and visible state.
let soundEnabled = false;
const soundBtn = document.getElementById("soundToggleBtn");

function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  soundBtn.dataset.enabled = String(enabled);
  soundBtn.textContent = (enabled ? "\u{1F50A} Sound on" : "\u{1F508} Sound off");
}

soundBtn.addEventListener("click", () => {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") ctx.resume();
  if (!soundEnabled) {
    // Play a chime right away as confirmation that audio actually works.
    setSoundEnabled(true);
    playChaChing();
  } else {
    setSoundEnabled(false);
  }
});

function playChaChing() {
  if (!soundEnabled) return;
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") ctx.resume();
  const t0 = ctx.currentTime;

  // Mechanical "cha" — a short burst of filtered noise, like a register
  // lever/latch snapping, ahead of the bell strikes.
  const noiseDur = 0.06;
  const bufferSize = Math.floor(ctx.sampleRate * noiseDur);
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    samples[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 2500;
  noiseFilter.Q.value = 1.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + noiseDur);
  noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
  noise.start(t0);
  noise.stop(t0 + noiseDur + 0.02);

  // Bell strike — a few slightly inharmonic partials (real bells aren't
  // simple sine waves), each with a fast attack and its own decay tail.
  const bell = (start, baseFreq, peak, decay) => {
    const partials = [1, 2.42, 3.85, 5.43];
    partials.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq * ratio, t0 + start);
      const partialPeak = peak / (i + 1);
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(partialPeak, t0 + start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + start + decay);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + decay + 0.05);
    });
  };

  // Two quick strikes = the classic "ching-ching" of a register bell.
  bell(0.05, 1760, 0.22, 0.5);
  bell(0.12, 2093, 0.18, 0.55);
}

const FIREWORKS_THRESHOLD = 500_000;
let firedFireworksForThreshold = false;

function checkFireworksThreshold(total) {
  if (total >= FIREWORKS_THRESHOLD) {
    if (!firedFireworksForThreshold) {
      firedFireworksForThreshold = true;
      launchFireworks();
    }
  } else {
    firedFireworksForThreshold = false;
  }
}

function launchFireworks() {
  const canvas = document.getElementById("fireworksCanvas");
  const ctx2d = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.style.display = "block";

  const colors = ["#ff5252", "#ffd740", "#69f0ae", "#40c4ff", "#e040fb", "#ff6e40", "#ffffff"];
  let particles = [];

  function spawnBurst(x, y) {
    const count = 70;
    const color = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.15;
      const speed = 2 + Math.random() * 4.5;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.01 + Math.random() * 0.012,
        color,
      });
    }
  }

  const burstDelays = [0, 280, 560, 900, 1250, 1600];
  burstDelays.forEach((delay) => {
    setTimeout(() => {
      spawnBurst(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.35));
    }, delay);
  });

  const startTime = performance.now();
  const minRunTime = burstDelays[burstDelays.length - 1] + 200;

  function frame(now) {
    ctx2d.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.vy += 0.05;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
    });
    particles = particles.filter((p) => p.life > 0);
    particles.forEach((p) => {
      ctx2d.globalAlpha = Math.max(p.life, 0);
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx2d.fill();
    });
    ctx2d.globalAlpha = 1;

    if (now - startTime < minRunTime || particles.length > 0) {
      requestAnimationFrame(frame);
    } else {
      canvas.style.display = "none";
      ctx2d.clearRect(0, 0, W, H);
    }
  }
  requestAnimationFrame(frame);
}

// Remembers each lot's bid count from the previous poll so we can tell
// which lots got a new bid since then (vs. just re-rendering the same data).
let previousBidState = null;

function announceNewBids(lots) {
  const newState = new Map(lots.map((l) => [l.lot, l.numBids ?? 0]));

  if (previousBidState) {
    let changed = 0;
    for (const [lot, numBids] of newState) {
      if (numBids > (previousBidState.get(lot) ?? 0)) {
        setTimeout(playChaChing, changed * 200);
        changed++;
      }
    }
  }

  previousBidState = newState;
}

async function loadLots(force) {
  const url = "/api/lots" + (force ? "?refresh=1" : "");
  const res = await fetch(url);
  const data = await res.json();

  const staleBanner = document.getElementById("staleBanner");
  if (data.staleError) {
    staleBanner.hidden = false;
    staleBanner.textContent =
      "Couldn't reach the auction site just now (" + data.staleError +
      "). Showing the last successful data from " + fmtTime(data.fetchedAt) + ".";
  } else {
    staleBanner.hidden = true;
  }

  document.getElementById("lastUpdated").textContent =
    "Updated " + fmtTime(data.fetchedAt);

  document.getElementById("statTotal").textContent =
    fmtMoney(data.summary.totalCurrentBid);
  document.getElementById("statBidCount").textContent =
    data.summary.totalBidCount;

  announceNewBids(data.lots);
  checkFireworksThreshold(data.summary.totalCurrentBid);

  const tbody = document.getElementById("lotsBody");
  tbody.innerHTML = "";
  for (const lot of data.lots) {
    const tr = document.createElement("tr");

    const thumbTd = document.createElement("td");
    if (lot.thumbnail) {
      const img = document.createElement("img");
      img.src = lot.thumbnail;
      img.alt = "Lot " + lot.lot;
      img.className = "thumb";
      img.loading = "lazy";
      thumbTd.appendChild(img);
    }
    tr.appendChild(thumbTd);

    const numTd = document.createElement("td");
    numTd.className = "lot-num";
    numTd.textContent = lot.lot;
    tr.appendChild(numTd);

    const descTd = document.createElement("td");
    descTd.className = "desc";
    descTd.textContent = lot.title || "";
    tr.appendChild(descTd);

    const bidsTd = document.createElement("td");
    bidsTd.className = "num-bids";
    bidsTd.textContent = lot.numBids ?? "—";
    tr.appendChild(bidsTd);

    const priceTd = document.createElement("td");
    priceTd.className = "bid-amount";
    priceTd.textContent = fmtMoney(lot.currentBid);
    if (lot.reserveNotMet) {
      const badge = document.createElement("span");
      badge.className = "badge badge-nobid";
      badge.textContent = "no bid yet";
      priceTd.appendChild(badge);
    }
    tr.appendChild(priceTd);

    tbody.appendChild(tr);
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => loadLots(true));

loadLots(false);
setInterval(() => loadLots(false), REFRESH_MS);
