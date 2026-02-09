let timetable, cities;
let selectedCity;

const timesDiv = document.getElementById("times");
const citySelect = document.getElementById("citySelect");
const cityInfo = document.getElementById("city-info");
const notifyIcon = document.getElementById("notifyIcon");

function updateNotifyIconState() {
  if (!notifyIcon) return;
  const supported = "Notification" in window;
  if (!supported) {
    notifyIcon.classList.add("disabled");
    notifyIcon.classList.remove("enabled");
    notifyIcon.title = "Notifications not supported";
    notifyIcon.setAttribute("aria-disabled", "true");
    return;
  }
  const perm = Notification.permission;
  const isEnabled = perm === "granted";
  notifyIcon.classList.toggle("disabled", !isEnabled);
  notifyIcon.classList.toggle("enabled", isEnabled);
  notifyIcon.title = isEnabled ? "Notifications enabled" : "Enable notifications";
  notifyIcon.setAttribute("aria-disabled", isEnabled ? "false" : "true");
}

async function loadData() {
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

  populateCities();
  renderTimes();
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

  cityInfo.textContent =
    `${selectedCity} (Offset: ${offset >= 0 ? "+" : ""}${offset} min)`;

  timesDiv.innerHTML = "";
  for (const prayer in baseTimes) {
    const adjusted = addMinutes(baseTimes[prayer], offset);
    const row = document.createElement("div");
    row.className = "time";
    row.innerHTML = `<strong>${prayer}</strong><span>${adjusted}</span>`;
    timesDiv.appendChild(row);
  }
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
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    alert("Notifications enabled.");
    scheduleNotifications();
    updateNotifyIconState();
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
      city: selectedCity
    });
  });
}

notifyIcon.onclick = enableNotifications;
updateNotifyIconState();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("persist.js");
}

setInterval(() => {
  if (Notification.permission === "granted") {
    scheduleNotifications();
  }
  updateNotifyIconState();
}, 60_000);


loadData();
