let timetable, cities;
let selectedCity;
let enabledPrayers = {};

const timesDiv = document.getElementById("times");
const citySelect = document.getElementById("citySelect");
// topbar elements
const currentDateEl = document.getElementById("current-date");
const currentTimeEl = document.getElementById("current-time");
const notifyGlobal = document.getElementById("notifyGlobal");
const offsetChip = document.getElementById("offset-chip");
const nextNameEl = document.getElementById("next-name");
const nextTimeEl = document.getElementById("next-time");
const nextCountdownEl = document.getElementById("next-countdown");
const themeToggle = document.getElementById("themeToggle");
const offsetText = document.getElementById("offset-text");

function updateNotifyIconState() {
  if (!notifyGlobal) return;
  const supported = "Notification" in window;
  if (!supported) {
    notifyGlobal.classList.add("disabled");
    notifyGlobal.classList.remove("enabled");
    notifyGlobal.title = "Notifications not supported";
    notifyGlobal.setAttribute("aria-disabled", "true");
    const img = notifyGlobal.querySelector('.icon-img');
    if (img) img.src = 'icons/bell-slash.svg';
    return;
  }
  const perm = Notification.permission;
  const isEnabled = perm === "granted";
  notifyGlobal.classList.toggle("disabled", !isEnabled);
  notifyGlobal.classList.toggle("enabled", isEnabled);
  notifyGlobal.title = isEnabled ? "Notifications enabled" : "Enable notifications";
  notifyGlobal.setAttribute("aria-disabled", isEnabled ? "false" : "true");
  const img = notifyGlobal.querySelector('.icon-img');
  if (img) img.src = isEnabled ? 'icons/bell.svg' : 'icons/bell-slash.svg';
}

function loadEnabledPrayers() {
  try {
    const raw = localStorage.getItem("prayerNotifications");
    enabledPrayers = raw ? JSON.parse(raw) : {};
  } catch (e) {
    enabledPrayers = {};
  }
}

function saveEnabledPrayers() {
  localStorage.setItem("prayerNotifications", JSON.stringify(enabledPrayers));
}

async function loadData() {
  loadEnabledPrayers();
  timetable = await fetch("data/table.json").then(r => {
  if (!r.ok) throw new Error("Failed to load table.json");
  return r.json();
});

cities = await fetch("data/offset.json").then(r => {
  if (!r.ok) throw new Error("Failed to load offset.json");
  return r.json();
});

  selectedCity =
    localStorage.getItem("city") || cities.base_city;

  initTheme();
  populateCities();
  renderTimes();
  updateDayContext();
}

function populateCities() {
  citySelect.innerHTML = "";
  Object.keys(cities.cities).forEach(city => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    if (city === selectedCity) opt.selected = true;
    citySelect.appendChild(opt);
  });

  citySelect.onchange = () => {
    selectedCity = citySelect.value;
    localStorage.setItem("city", selectedCity);
    renderTimes();
    scheduleNotifications();
  };
}

function todayKey() {
  const d = new Date();
  return String(d.getDate()).padStart(2, "0") + "-" +
         String(d.getMonth() + 1).padStart(2, "0");
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(h, m + minutes, 0, 0);
  return date.toTimeString().slice(0, 5);
}

function renderTimes() {
  const key = todayKey();
  const baseTimes = timetable.days[key];
  const offset = cities.cities[selectedCity].offset;

  if (offsetText) {
    offsetText.textContent = `${offset >= 0 ? "+" : ""}${offset} min`;
  }

  timesDiv.innerHTML = "";
  for (const prayer in baseTimes) {
    const adjusted = addMinutes(baseTimes[prayer], offset);
    const row = document.createElement("div");
    row.className = "time";
    row.dataset.prayer = prayer;
    const permGranted = ("Notification" in window) && Notification.permission === "granted";
    const isOn = !!enabledPrayers[prayer];
    const classes = ["icon-button", "prayer-notify"]; 
    if (!permGranted) classes.push("disabled");
    else if (!isOn) classes.push("muted");
    const iconSrc = !permGranted ? 'icons/bell-slash.svg' : (isOn ? 'icons/bell.svg' : 'icons/bell-slash.svg');
    row.innerHTML = `
      <span class="name">
        <button type="button" class="${classes.join(" ")}" data-prayer="${prayer}" aria-pressed="${isOn}">
          <img class="icon-img" src="${iconSrc}" alt="Prayer notify" width="18" height="18" />
        </button>
        <strong>${prayer}</strong>
      </span>
      <span class="time-value">${adjusted}</span>`;
    timesDiv.appendChild(row);
  }
  updateNextPrayer();
}

function enableAllPrayers() {
  const key = todayKey();
  const baseTimes = timetable && timetable.days && timetable.days[key];
  if (!baseTimes) return;
  for (const prayer in baseTimes) {
    enabledPrayers[prayer] = true;
  }
  saveEnabledPrayers();
  updateRowBellStates();
}

function updateRowBellStates() {
  const permGranted = ("Notification" in window) && Notification.permission === "granted";
  const buttons = timesDiv.querySelectorAll(".prayer-notify");
  buttons.forEach(btn => {
    const prayer = btn.getAttribute("data-prayer");
    const isOn = !!enabledPrayers[prayer];
    btn.classList.toggle("disabled", !permGranted);
    if (permGranted) {
      btn.classList.toggle("muted", !isOn);
    } else {
      btn.classList.remove("muted");
    }
    btn.setAttribute("aria-pressed", String(isOn));
    const img = btn.querySelector('.icon-img');
    if (img) img.src = !permGranted ? 'icons/bell-slash.svg' : (isOn ? 'icons/bell.svg' : 'icons/bell-slash.svg');
  });
}

function parseTimeToDate(timeStr, offsetMin, baseDate = new Date()) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m + offsetMin, 0, 0);
  return d;
}


function formatCountdown(ms) {
  if (ms <= 0) return "Now";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  return `${m}m ${String(s).padStart(2,'0')}s`;
}

function updateDayContext() {
  const now = new Date();
  const isPhone = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  const dateOpts = isPhone ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const dateFmt = new Intl.DateTimeFormat(undefined, dateOpts);
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  if (currentDateEl) currentDateEl.textContent = dateFmt.format(now);
  if (currentTimeEl) currentTimeEl.textContent = timeFmt.format(now);
}

function findNextPrayer() {
  const key = todayKey();
  const baseTimes = timetable.days[key];
  const offset = cities.cities[selectedCity].offset;
  const now = new Date();
  let next = null;
  for (const prayer in baseTimes) {
    const at = parseTimeToDate(baseTimes[prayer], offset);
    if (at > now && (!next || at < next.at)) {
      next = { name: prayer, at, timeStr: addMinutes(baseTimes[prayer], offset) };
    }
  }
  if (next) return next;
  // fallback to tomorrow's first
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tkey = String(tomorrow.getDate()).padStart(2, "0") + "-" + String(tomorrow.getMonth() + 1).padStart(2, "0");
  const tTimes = timetable.days[tkey];
  if (!tTimes) return null;
  let first = null;
  for (const prayer in tTimes) {
    const at = parseTimeToDate(tTimes[prayer], offset, tomorrow);
    if (!first || at < first.at) {
      first = { name: prayer, at, timeStr: addMinutes(tTimes[prayer], offset) };
    }
  }
  return first;
}

function updateNextPrayer() {
  const next = findNextPrayer();
  if (!next) return;
  if (nextNameEl) nextNameEl.textContent = next.name;
  if (nextTimeEl) nextTimeEl.textContent = next.timeStr;
  // No remaining-time countdown; only show next prayer name/time
  if (nextCountdownEl) nextCountdownEl.textContent = "";
  // highlight row
  const prev = timesDiv.querySelector('.time.next');
  if (prev) prev.classList.remove('next');
  const row = timesDiv.querySelector(`.time[data-prayer="${next.name}"]`);
  if (row) row.classList.add('next');
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("Notifications are not supported on this browser.");
    return;
  }

  if (Notification.permission === "denied") {
    alert(
      "Notifications are blocked for this site.\n\n" +
      "Please enable them manually in browser settings."
    );
    return;
  }

  if (Notification.permission === "granted") {
    alert("Notifications are already enabled.");
    scheduleNotifications();
    updateNotifyIconState();
    enableAllPrayers();
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    alert("Notifications enabled.");
    scheduleNotifications();
    updateNotifyIconState();
    enableAllPrayers();
  } else {
    alert("Notifications not enabled.");
    updateNotifyIconState();
  }
}


function scheduleNotifications() {
  if (Notification.permission !== "granted") return;

  navigator.serviceWorker.ready.then(reg => {
    reg.active.postMessage({
      type: "SCHEDULE",
      city: selectedCity,
      enabledPrayers
    });
  });
}

if (notifyGlobal) notifyGlobal.onclick = enableNotifications;
updateNotifyIconState();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("persist.js");
}

setInterval(() => {
  if (Notification.permission === "granted") {
    scheduleNotifications();
  }
  updateNotifyIconState();
  updateRowBellStates();
}, 60_000);

// live countdown every second
setInterval(() => {
  updateDayContext();
  updateNextPrayer();
}, 1_000);


loadData();

timesDiv.addEventListener("click", async (e) => {
  const btn = e.target.closest && e.target.closest(".prayer-notify");
  if (!btn) return;
  const prayer = btn.getAttribute("data-prayer");

  if (!("Notification" in window)) {
    alert("Notifications are not supported on this browser.");
    return;
  }

  if (Notification.permission !== "granted") {
    await enableNotifications();
    if (Notification.permission !== "granted") {
      updateRowBellStates();
      return;
    }
  }

  enabledPrayers[prayer] = !enabledPrayers[prayer];
  saveEnabledPrayers();
  updateRowBellStates();
  scheduleNotifications();
});

function initTheme() {
  const saved = localStorage.getItem('theme');
  // Default to dark if no saved theme
  const shouldDark = saved ? saved === 'dark' : true;
  document.body.classList.toggle('theme-dark', shouldDark);
}

if (themeToggle) {
  themeToggle.onclick = () => {
    const isDark = document.body.classList.toggle('theme-dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
}
