
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("landingModal");
  const closeModalBtn = document.getElementById("closeLandingModal");

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  const authTitle = document.getElementById("authTitle");
  const authDescription = document.getElementById("authDescription");
  const authMessage = document.getElementById("authMessage");

  const dashboard = document.getElementById("dashboardSection");
  const userName = document.getElementById("dashboardUserName");

  const memoryForm = document.getElementById("memoryForm");
  const memoryFormMessage = document.getElementById("memoryFormMessage");
  const memoriesList = document.getElementById("memoriesList");

  const vaultNavLinks = document.querySelectorAll(".vault-nav a");
  const vaultNavSections = document.querySelectorAll(
    "#vaultOverview, #vaultCreate, #vaultArchive"
  );

  vaultNavLinks.forEach((link) => {
    link.addEventListener("click", () => {
      vaultNavLinks.forEach((navLink) => {
        navLink.classList.remove("active");
        navLink.removeAttribute("aria-current");
      });

      link.classList.add("active");
      link.setAttribute("aria-current", "location");
    });
  });

  const loginButtons = [
    document.getElementById("navLoginBtn"),
    document.getElementById("heroLoginBtn")
  ];

  const registerButtons = [
    document.getElementById("heroCreateBtn"),
    document.getElementById("ctaCreateBtn")
  ];

  function showAuthMessage(message, type = "") {
    authMessage.textContent = message;
    authMessage.className = "auth-message";

    if (type) authMessage.classList.add(type);
  }

  function openModal(mode = "login") {
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    showAuthMessage("");

    if (mode === "register") {
      loginForm.classList.add("hidden");
      registerForm.classList.remove("hidden");
      authTitle.textContent = "Create Your Account";
      authDescription.textContent =
        "Create your account to start saving memories for the future.";
    } else {
      registerForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
      authTitle.textContent = "Welcome Back";
      authDescription.textContent =
        "Log in to access your personal MemoryVault.";
    }
  }

  function closeModal() {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
    showAuthMessage("");
  }

  loginButtons.forEach((button) => {
    if (button) button.addEventListener("click", () => openModal("login"));
  });

  registerButtons.forEach((button) => {
    if (button) button.addEventListener("click", () => openModal("register"));
  });

  document.getElementById("showRegisterBtn").addEventListener("click", () => {
    openModal("register");
  });

  document.getElementById("showLoginBtn").addEventListener("click", () => {
    openModal("login");
  });

  closeModalBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  async function requestJSON(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.message || result.error || "The request could not be completed."
      );
    }

    return result;
  }

 

function showDashboard(user) {
  dashboard.classList.remove("hidden");
  userName.textContent = user.name || "Friend";

  const isAdmin = user?.role === "admin";
  const adminButton = document.getElementById("openAdminDashboardBtn");
  const adminPanel = document.getElementById("adminPanel");

  // Show the Admin Dashboard button only to admins.
  if (adminButton) {
    adminButton.classList.toggle("hidden", !isAdmin);
    adminButton.style.display = isAdmin ? "" : "none";
  }

  // Keep the admin panel hidden on the normal dashboard.
  if (adminPanel) {
    adminPanel.classList.add("hidden");
  }

  // Hide landing-page sections while the dashboard is open.
  document.querySelectorAll(
    "body > section:not(#dashboardSection):not(#adminDashboardSection), body > footer"
  ).forEach((section) => {
    section.dataset.dashboardHidden = "true";
    section.classList.add("dashboard-temporarily-hidden");
  });

  // Hide login and registration buttons.
  loginButtons.concat(registerButtons).forEach((button) => {
    if (button) button.style.display = "none";
  });

  closeModal();

  dashboard.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  loadMemories();
}






async function openAdminDashboard() {
  const dashboard = document.getElementById("dashboardSection");
  const adminScreen = document.getElementById("adminDashboardSection");
  const adminPanel = document.getElementById("adminPanel");
  const adminButton = document.getElementById("openAdminDashboardBtn");
  const host = document.getElementById("adminPanelHost");

  if (!dashboard || !adminScreen || !adminPanel || !host) {
    console.error("Admin dashboard elements are missing.");
    return;
  }

  try {
    const result = await requestJSON("/api/me");

    if (result.user?.role !== "admin") {
      if (adminButton) adminButton.classList.add("hidden");
      return;
    }

    // Ensure the admin panel is inside the separate admin screen.
    if (adminPanel.parentElement !== host) {
      host.appendChild(adminPanel);
    }

    // Hide all landing-page content and the normal vault.
    document.querySelectorAll(
      "body > section:not(#adminDashboardSection), body > footer, body > header"
    ).forEach((element) => {
      element.classList.add("hidden");
    });

    // Hide other known landing-page elements if they exist.
    [
      "hero",
      "features",
      "memoryPreview",
      "finalCta",
      "replayIntroBtn"
    ].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.classList.add("hidden");
    });

    dashboard.classList.add("hidden");

    // Show only the admin dashboard.
    adminScreen.classList.remove("hidden");
    adminScreen.classList.remove("dashboard-temporarily-hidden");
    adminPanel.classList.remove("hidden");
    // Hide the floating intro button on the admin screen.
const replayIntroBtn = document.getElementById("replayIntroBtn");
if (replayIntroBtn) {
  replayIntroBtn.classList.add("hidden");
}

    window.scrollTo(0, 0);

    await loadAdminUsers();
  } catch (error) {
    console.error("Could not open Admin Dashboard:", error);
    window.alert("Could not open Admin Dashboard. Please check the browser console.");
  }
}





function closeAdminDashboard() {
  const dashboard = document.getElementById("dashboardSection");
  const adminScreen = document.getElementById("adminDashboardSection");
  const adminPanel = document.getElementById("adminPanel");

  if (!dashboard || !adminScreen || !adminPanel) {
    console.error("Dashboard elements are missing.");
    return;
  }

  // Hide the admin screen.
  adminScreen.classList.add("hidden");
  adminPanel.classList.add("hidden");

  // Return directly to the normal dashboard.
  dashboard.classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" }); 
  const replayIntroBtn = document.getElementById("replayIntroBtn");
if (replayIntroBtn) {
  replayIntroBtn.classList.remove("hidden");
}
}


  
async function loadAdminUsers() {
  const list = document.getElementById("adminUsersList");
  const total = document.getElementById("adminTotalUsers");

  if (!list || !total) return;

  list.textContent = "Loading accounts...";

  try {
    const result = await requestJSON("/api/admin/users");

    total.textContent = result.users.length;
    list.replaceChildren();

    if (result.users.length === 0) {
      list.textContent = "No registered accounts found.";
      return;
    }

    result.users.forEach((user) => {
      const card = document.createElement("article");
      card.className = "admin-user-card";

      const details = document.createElement("div");
      details.className = "admin-user-details";

      const name = document.createElement("h4");
      name.textContent = user.name;

      const email = document.createElement("p");
      email.textContent = user.email;

      const role = document.createElement("span");
      role.className = "admin-user-role";
      role.textContent = user.role;

      details.append(name, email, role);

      const actions = document.createElement("div");
      actions.className = "admin-user-actions";

      const viewButton = document.createElement("button");
      viewButton.type = "button";
      viewButton.className = "btn btn-secondary";
      viewButton.textContent = "View Memories";
      viewButton.addEventListener("click", () => {
        loadAdminUserMemories(user.id, user.name);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-danger";
      deleteButton.textContent = "Delete Account";
      deleteButton.addEventListener("click", () => {
        deleteAdminUser(user.id, user.name);
      });

      actions.append(viewButton, deleteButton);
      card.append(details, actions);
      list.appendChild(card);
    });
  } catch (error) {
    list.textContent = error.message;
  }
}

async function loadAdminUserMemories(userId, userName) {
  const panel = document.getElementById("adminUserMemories");
  const title = document.getElementById("adminSelectedUserTitle");
  const list = document.getElementById("adminUserMemoriesList");

  panel.classList.remove("hidden");
  title.textContent = `Memories belonging to ${userName}`;
  list.textContent = "Loading memories...";

  try {
    const result = await requestJSON(
      `/api/admin/users/${userId}/memories`
    );

    list.replaceChildren();

    if (result.memories.length === 0) {
      list.textContent = "This account has no memories.";
      return;
    }

    result.memories.forEach((memory) => {
      const card = document.createElement("article");
      card.className = "admin-memory-card";

      const heading = document.createElement("h4");
      heading.textContent = memory.title;

      const category = document.createElement("span");
      category.className = "memory-category";
      category.textContent = memory.category || "Personal";

      const status = document.createElement("p");
      status.textContent =
        new Date(memory.reveal_at) <= new Date()
          ? "Revealed"
          : "Locked";

      const message = document.createElement("p");
      message.textContent = memory.message;

      const revealDate = document.createElement("p");
      revealDate.textContent =
        `Reveal date: ${new Date(memory.reveal_at).toLocaleString()}`;

      card.append(heading, category, status, message, revealDate);
      list.appendChild(card);
    });
  } catch (error) {
    list.textContent = error.message;
  }
}

async function deleteAdminUser(userId, userName) {
  const confirmed = window.confirm(
    `Delete the account "${userName}" and all its memories? This cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await requestJSON(`/api/admin/users/${userId}`, {
      method: "DELETE"
    });

    const memoriesPanel = document.getElementById("adminUserMemories");
    memoriesPanel.classList.add("hidden");

    await loadAdminUsers();
  } catch (error) {
    window.alert(`Account deletion failed: ${error.message}`);
  }
}


  function showLandingPage() {
    dashboard.classList.add("hidden");

    document.querySelectorAll(".dashboard-temporarily-hidden").forEach((el) => {
      el.classList.remove("dashboard-temporarily-hidden");
      delete el.dataset.dashboardHidden;
    });

    loginButtons.concat(registerButtons).forEach((button) => {
      if (button) button.style.display = "";
    });
  }


async function handleAuth(form, endpoint, buttonLabel) {
    const button = form.querySelector('button[type="submit"]');
    const originalLabel = buttonLabel;

    button.disabled = true;
    button.textContent = "Please wait...";
    showAuthMessage("");

    try {
        const data = Object.fromEntries(new FormData(form).entries());

        const response = await requestJSON(endpoint, {
            method: "POST",
            body: JSON.stringify(data)
        });

        form.reset();

        if (endpoint === "/api/register") {
            showAuthMessage(
                response.message || "Account created successfully! Please verify your email, then log in to continue.",
                "success"
            );
            return;
        }

        const result = await requestJSON("/api/me");
        showDashboard(result.user);

    } catch (error) {
        showAuthMessage(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = originalLabel;
    }
}


  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAuth(loginForm, "/api/login", "Login");
  });

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAuth(registerForm, "/api/register", "Create Account");
  });

  function showMemoryFormMessage(message, isError = false) {
    memoryFormMessage.textContent = message;
    memoryFormMessage.style.color = isError ? "#ff8585" : "#67e8b0";
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) return dateValue || "";

    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

let capsuleTimers = [];

function formatCountdown(revealAt) {
  const remaining = new Date(revealAt).getTime() - Date.now();

  if (!Number.isFinite(remaining) || remaining <= 0) {
    return "Ready to reveal";
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

  async function loadMemories() {
    capsuleTimers.forEach((timer) => clearInterval(timer));
capsuleTimers = [];
    memoriesList.textContent = "Loading your memories...";

    try {
      const result = await requestJSON("/api/memories");
      const memories = Array.isArray(result) ? result : result.memories;

      if (!Array.isArray(memories)) {
        throw new Error("The server returned an unexpected memory list.");
      }

      document.getElementById("totalMemories").textContent = memories.length;
      document.getElementById("lockedMemories").textContent =
        memories.filter((memory) => !memory.revealed).length;
      document.getElementById("revealedMemories").textContent =
        memories.filter((memory) => memory.revealed).length;

      memoriesList.replaceChildren();

      if (memories.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent =
          "Your vault is empty. Create your first memory above!";
        memoriesList.appendChild(emptyMessage);
        return;
      }

      
const searchInput = document.getElementById("memorySearch");
const filterSelect = document.getElementById("memoryFilter");

const searchTerm = (searchInput?.value || "").trim().toLowerCase();
const selectedFilter = filterSelect?.value || "all";

const filteredMemories = memories.filter((memory) => {
  const matchesSearch =
    (memory.title || "").toLowerCase().includes(searchTerm) ||
    (memory.message || "").toLowerCase().includes(searchTerm);

  const matchesStatus =
    selectedFilter === "all" ||
    (selectedFilter === "locked" && !memory.revealed) ||
    (selectedFilter === "revealed" && memory.revealed);

  return matchesSearch && matchesStatus;
});

filteredMemories.forEach((memory) => {

        
const card = document.createElement("article");
card.className = "memory-card";

if (memory.revealed) {
  card.classList.add("reveal-animation");
}


        const title = document.createElement("h3");
        title.textContent = memory.title || "Untitled Memory";

        const status = document.createElement("span");
        
const category = document.createElement("span");
category.className = "memory-category";
category.textContent = memory.category || "Personal";

        status.className = "memory-status";
        status.textContent = memory.revealed ? "Revealed" : "Locked";

        if (memory.revealed) status.classList.add("revealed");

        const message = document.createElement("p");
        message.textContent = memory.revealed
          ? (memory.message || "")
          : "🔒 This memory is locked until its reveal date.";

        const date = document.createElement("p");
        date.className = "memory-date";
        date.textContent = `Reveal date: ${formatDate(memory.reveal_at)}`;
        

const countdown = document.createElement("p");
countdown.className = "memory-countdown";

let revealRefreshStarted = false;

function updateCountdown() {
  const remaining =
    new Date(memory.reveal_at).getTime() - Date.now();

 
countdown.classList.toggle("unlocked", memory.revealed);

countdown.textContent = memory.revealed
  ? "✨ Your memory is unlocked"
  : `🔒 Unlocks in ${formatCountdown(memory.reveal_at)}`;


 
if (remaining <= 0 && !memory.revealed && !revealRefreshStarted) {
  revealRefreshStarted = true;
  clearInterval(timer);

  card.classList.add("reveal-animation");

  setTimeout(() => {
    loadMemories();
  }, 900);
}

}

updateCountdown();

const timer = setInterval(updateCountdown, 1000);
capsuleTimers.push(timer);


updateCountdown();


        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "memory-delete-btn";
        deleteButton.textContent = "Delete Memory";

        deleteButton.addEventListener("click", async () => {
          if (!window.confirm("Are you sure you want to delete this memory?")) {
            return;
          }

          deleteButton.disabled = true;

          try {
            await requestJSON(`/api/memories/${memory.id}`, {
              method: "DELETE"
            });
            await loadMemories();
          } catch (error) {
            window.alert(error.message);
            deleteButton.disabled = false;
          }
        });

        
card.append(
  title,
  category,
  status,
  message,
  countdown,
  date,
  deleteButton
);

        memoriesList.appendChild(card);
      });
    } catch (error) {
      memoriesList.textContent = error.message;
    }
  }

  memoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = memoryForm.querySelector('button[type="submit"]');
    button.disabled = true;
    showMemoryFormMessage("");

    try {
      const data = Object.fromEntries(new FormData(memoryForm).entries());

      if (new Date(data.revealAt).getTime() <= Date.now()) {
        throw new Error("Please choose a future reveal date and time.");
      }

    
const memoryData = {
  ...data,
  revealAt: new Date(data.revealAt).toISOString()
};

await requestJSON("/api/memories", {
  method: "POST",
  body: JSON.stringify(memoryData)
});


      memoryForm.reset();
      showMemoryFormMessage("Memory saved successfully!");
      await loadMemories();
    } catch (error) {
      showMemoryFormMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("refreshMemoriesBtn").addEventListener("click", () => {
    loadMemories();
  });
  
const refreshAdminUsersBtn = document.getElementById("refreshAdminUsersBtn");

if (refreshAdminUsersBtn) {
  refreshAdminUsersBtn.addEventListener("click", () => {
    loadAdminUsers();
  });
}

const openAdminDashboardBtn = document.getElementById("openAdminDashboardBtn");
const backToVaultBtn = document.getElementById("backToVaultBtn");


if (openAdminDashboardBtn) {
  openAdminDashboardBtn.addEventListener("click", async () => {
    console.log("Admin Dashboard button clicked");
    await openAdminDashboard();
  });
}


if (backToVaultBtn) {
  backToVaultBtn.addEventListener("click", () => {
    closeAdminDashboard();
  });
}

document.querySelectorAll("#adminDashboardSection .cyber-nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll("#adminDashboardSection .cyber-nav-link")
      .forEach((item) => item.classList.remove("active"));

    link.classList.add("active");

    const target = document.querySelector(link.getAttribute("href"));

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });
});

  
// Search and filter memories
const memorySearch = document.getElementById("memorySearch");
const memoryFilter = document.getElementById("memoryFilter");

memorySearch.addEventListener("input", () => {
  loadMemories();
});

memoryFilter.addEventListener("change", () => {
  loadMemories();
});


  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await requestJSON("/api/logout", { method: "POST" });
      showLandingPage();
      memoryForm.reset();
      showMemoryFormMessage("");
      memoriesList.replaceChildren();
      closeModal();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      window.alert(`Logout failed: ${error.message}`);
    }
  });

  // Restore the dashboard when a valid session already exists.
  requestJSON("/api/me")
    .then((result) => {
      if (result.user) showDashboard(result.user);
    })
    .catch(() => {
      showLandingPage();
    });
});

/* =========================================
   MEMORYVAULT — COSMIC PARTICLE SYSTEM
   ========================================= */

(() => {
  const canvas = document.getElementById("cosmicCanvas");
  const intro = document.getElementById("cosmicIntro");

  if (!canvas || !intro) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let width = 0;
  let height = 0;
  let animationFrame = null;
  let particles = [];

  const particleCount = reducedMotion ? 35 : 110;
  const colors = [
    [167, 139, 250],
    [139, 92, 246],
    [125, 211, 252],
    [221, 214, 254]
  ];

  function resizeCanvas() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.6 + 0.3,
      speedX: (Math.random() - 0.5) * 0.24,
      speedY: (Math.random() - 0.5) * 0.24,
      alpha: Math.random() * 0.55 + 0.15,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.015 + 0.004,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
  }

  function drawParticles() {
    ctx.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.pulse += particle.pulseSpeed;

      if (!reducedMotion) {
        particle.x += particle.speedX;
        particle.y += particle.speedY;
      }

      if (particle.x < -5) particle.x = width + 5;
      if (particle.x > width + 5) particle.x = -5;
      if (particle.y < -5) particle.y = height + 5;
      if (particle.y > height + 5) particle.y = -5;

      const glow =
        particle.alpha * (0.65 + Math.sin(particle.pulse) * 0.35);

      const [red, green, blue] = particle.color;

      ctx.beginPath();
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${glow})`;
      ctx.arc(
        particle.x,
        particle.y,
        particle.radius,
        0,
        Math.PI * 2
      );
      ctx.fill();

      if (particle.radius > 1.25) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${glow * 0.12})`;
        ctx.arc(
          particle.x,
          particle.y,
          particle.radius * 4,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    if (!reducedMotion && !intro.classList.contains("intro-hidden")) {
      animationFrame = requestAnimationFrame(drawParticles);
    } else {
      animationFrame = null;
    }
  }

  function startParticles() {
    if (animationFrame === null && !reducedMotion) {
      animationFrame = requestAnimationFrame(drawParticles);
    } else if (reducedMotion) {
      drawParticles();
    }
  }

  function stopParticles() {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  resizeCanvas();
  startParticles();

  window.addEventListener("resize", resizeCanvas);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopParticles();
    } else if (!intro.classList.contains("intro-hidden")) {
      startParticles();
    }
  });

  // Let the Enter button handler start or stop the particle effect.
  intro.addEventListener("cosmic-intro-exit", () => {
    stopParticles();
  });
  intro.addEventListener("cosmic-intro-replay", () => {
  startParticles();
});
})();

/* =========================================
   MEMORYVAULT — INTRO ENTRY INTERACTION
   ========================================= */

(() => {
  const intro = document.getElementById("cosmicIntro");
  const enterButton = document.getElementById("enterMemoryVault");
  const replayButton = document.getElementById("replayIntroBtn");

  if (!intro || !enterButton) return;

  let hasEntered = false;

  function enterVault() {
    
if (hasEntered) return;

hasEntered = true;

// Remember that the intro has been completed this session.
sessionStorage.setItem("memoryVaultIntroSeen", "true");

    enterButton.disabled = true;
    enterButton.querySelector("span").textContent = "Opening your vault...";

    intro.classList.add("intro-opening");

    intro.dispatchEvent(new Event("cosmic-intro-exit"));

    const finishEntry = () => {
      intro.classList.add("intro-hidden");
      document.body.classList.remove("cosmic-intro-active");
      intro.setAttribute("aria-hidden", "true");
    };

    const motionReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    window.setTimeout(finishEntry, motionReduced ? 0 : 1250);
  }

  enterButton.addEventListener("click", enterVault);
if (replayButton) {
  replayButton.addEventListener("click", () => {
    hasEntered = false;

    intro.classList.remove("intro-hidden", "intro-opening");
    intro.removeAttribute("aria-hidden");

    document.body.classList.add("cosmic-intro-active");

    enterButton.disabled = false;
    enterButton.querySelector("span").textContent = "Enter MemoryVault";

    intro.dispatchEvent(new Event("cosmic-intro-replay"));
  });
}
  
if (sessionStorage.getItem("memoryVaultIntroSeen") === "true") {
  intro.classList.add("intro-hidden");
  intro.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cosmic-intro-active");
} else {
  document.body.classList.add("cosmic-intro-active");
}

})();

/* MEMORYVAULT — DASHBOARD COSMIC PARTICLES */
(() => {
  const canvas = document.getElementById("dashboardCosmicCanvas");
  const dashboard = document.getElementById("dashboardSection");

  if (!canvas || !dashboard) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let width = 0;
  let height = 0;
  let particles = [];
  let frameId = null;

  const colors = [
    "139, 211, 255",
    "125, 211, 252",
    "167, 139, 250",
    "220, 235, 255"
  ];

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = dashboard.clientWidth;
    height = dashboard.scrollHeight;

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    particles = Array.from(
      { length: reducedMotion ? 45 : 130 },
      () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.35 + 0.08,
        drift: (Math.random() - 0.5) * 0.25,
        alpha: Math.random() * 0.55 + 0.15,
        color: colors[Math.floor(Math.random() * colors.length)]
      })
    );
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    const scrollOffset = window.scrollY * 0.12;

    for (const p of particles) {
      if (!reducedMotion) {
        p.y -= p.speed;
        p.x += p.drift;
      }

      if (p.y < -5) {
        p.y = height + 5;
        p.x = Math.random() * width;
      }

      if (p.x < -5) p.x = width + 5;
      if (p.x > width + 5) p.x = -5;

      const screenY = ((p.y - scrollOffset) % height + height) % height;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.shadowBlur = p.radius > 1.2 ? 8 : 3;
      ctx.shadowColor = `rgba(${p.color}, 0.7)`;
      ctx.arc(p.x, screenY, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    if (!reducedMotion) {
      frameId = requestAnimationFrame(draw);
    }
  }

  function start() {
    if (frameId === null && !reducedMotion) {
      frameId = requestAnimationFrame(draw);
    } else if (reducedMotion) {
      draw();
    }
  }

  function stop() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  resize();
  start();

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", () => {
    if (frameId === null && !reducedMotion) start();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
})();
