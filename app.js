
document.addEventListener("DOMContentLoaded", () => {
  // =========================================
  // MEMORYVAULT — PREMIUM NOTIFICATIONS V5
  // =========================================
  const mvToastRegion = document.getElementById("mvToastRegion");
  const mvToastTimers = new WeakMap();

  function showToast(message, type = "info", title = "") {
    if (!mvToastRegion || !message) return;

    const allowedTypes = ["success", "error", "warning", "info"];
    const toastType = allowedTypes.includes(type) ? type : "info";

    const defaults = {
      success: { title: "Success", icon: "✓" },
      error: { title: "Something went wrong", icon: "!" },
      warning: { title: "Please note", icon: "⚠" },
      info: { title: "MemoryVault", icon: "i" }
    };

    const config = defaults[toastType];
    const toast = document.createElement("div");
    toast.className = `mv-toast mv-toast-${toastType}`;
    toast.setAttribute("role", toastType === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", toastType === "error" ? "assertive" : "polite");

    const icon = document.createElement("span");
    icon.className = "mv-toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = config.icon;

    const content = document.createElement("div");
    content.className = "mv-toast-content";

    const heading = document.createElement("p");
    heading.className = "mv-toast-title";
    heading.textContent = title || config.title;

    const text = document.createElement("p");
    text.className = "mv-toast-message";
    text.textContent = String(message);

    content.append(heading, text);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "mv-toast-close";
    closeButton.setAttribute("aria-label", "Dismiss notification");
    closeButton.textContent = "×";

    let dismissed = false;

    function dismissToast() {
      if (dismissed) return;
      dismissed = true;

      clearTimeout(mvToastTimers.get(toast));
      toast.classList.remove("is-visible");

      toast.addEventListener("transitionend", () => toast.remove(), {
        once: true
      });

      // Fallback for reduced-motion or interrupted transitions.
      setTimeout(() => toast.remove(), 300);
    }

    closeButton.addEventListener("click", dismissToast);
    toast.append(icon, content, closeButton);
    mvToastRegion.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    mvToastTimers.set(toast, setTimeout(dismissToast, 4500));
  }

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

    await Promise.all([
  loadAdminUsers(),
  loadAdminStats()
]);
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



function openAdminMediaViewer({ url, name, type, mimeType, size }) {
  let modal = document.getElementById("adminMediaViewer");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminMediaViewer";
    modal.className = "admin-media-viewer hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "adminMediaViewerTitle");

    modal.innerHTML = `
      <div class="admin-media-viewer-backdrop"></div>
      <section class="admin-media-viewer-panel">
        <header class="admin-media-viewer-header">
          <div>
            <p class="admin-media-viewer-eyebrow">MEMORYVAULT // MEDIA INSPECTOR</p>
            <h2 id="adminMediaViewerTitle">Attachment Preview</h2>
          </div>
          <button type="button" class="admin-media-viewer-close"
            aria-label="Close media preview">&times;</button>
        </header>

        <div class="admin-media-viewer-stage"></div>

        <footer class="admin-media-viewer-footer">
          <div class="admin-media-viewer-file">
            <span class="admin-media-viewer-type"></span>
            <div>
              <p class="admin-media-viewer-name"></p>
              <p class="admin-media-viewer-details"></p>
            </div>
          </div>
          <span class="admin-media-viewer-secure">SECURE PREVIEW</span>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);

    const closeViewer = () => {
      const stage = modal.querySelector(".admin-media-viewer-stage");
      stage.replaceChildren();
      modal.classList.add("hidden");
      document.body.classList.remove("admin-media-viewer-open");
    };

    modal.querySelector(".admin-media-viewer-close")
      .addEventListener("click", closeViewer);

    modal.querySelector(".admin-media-viewer-backdrop")
      .addEventListener("click", closeViewer);

    modal._closeViewer = closeViewer;
  }

  const stage = modal.querySelector(".admin-media-viewer-stage");
  stage.replaceChildren();

  const normalizedType = String(type || "").toLowerCase();
  const normalizedMime = String(mimeType || "").toLowerCase();

  let mediaElement;

  if (normalizedType === "image" && normalizedMime.startsWith("image/")) {
    mediaElement = document.createElement("img");
    mediaElement.alt = name || "Memory attachment";
  } else if (
    normalizedType === "video" &&
    normalizedMime.startsWith("video/")
  ) {
    mediaElement = document.createElement("video");
    mediaElement.controls = true;
    mediaElement.playsInline = true;
    mediaElement.preload = "metadata";
  } else if (
    normalizedType === "audio" &&
    normalizedMime.startsWith("audio/")
  ) {
    mediaElement = document.createElement("audio");
    mediaElement.controls = true;
    mediaElement.preload = "metadata";
  } else {
    const message = document.createElement("p");
    message.className = "admin-media-viewer-unsupported";
    message.textContent =
      "Preview is unavailable for this file type. Use the secure file link below.";
    stage.appendChild(message);

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open file in new tab";
    link.className = "admin-media-viewer-open-link";
    stage.appendChild(link);
  }

  if (mediaElement) {
    mediaElement.className = "admin-media-viewer-media";
    mediaElement.src = url;
    mediaElement.addEventListener("error", () => {
      const message = document.createElement("p");
      message.className = "admin-media-viewer-unsupported";
      message.textContent =
        "This file could not be previewed. It may be unsupported or unavailable.";
      stage.replaceChildren(message);
    }, { once: true });
    stage.appendChild(mediaElement);
  }

  modal.querySelector(".admin-media-viewer-type").textContent =
    normalizedType.toUpperCase() || "FILE";
  modal.querySelector(".admin-media-viewer-name").textContent =
    name || "Untitled attachment";
  modal.querySelector(".admin-media-viewer-details").textContent =
    `${normalizedMime || "Unknown format"} · ${
      size > 0 ? `${(size / (1024 * 1024)).toFixed(2)} MB` : "Size unavailable"
    }`;

  modal.classList.remove("hidden");
  document.body.classList.add("admin-media-viewer-open");

  modal.querySelector(".admin-media-viewer-close").focus();
}

async function loadAdminStats() {
  const totalUsers = document.getElementById("adminTotalUsers");

  if (!totalUsers) return;

  const statIds = {
    total_memories: "adminTotalMemories",
    total_attachments: "adminTotalAttachments",
    locked_memories: "adminLockedMemories",
    revealed_memories: "adminRevealedMemories"
  };

  try {
    const result = await requestJSON("/api/admin/stats");
    const stats = result.stats;

    totalUsers.textContent = stats.total_users ?? "0";

    Object.entries(statIds).forEach(([key, id]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = stats[key] ?? "0";
      }
    });
  } catch (error) {
    console.error("Could not load admin statistics:", error);
  }
}
let adminUsersPage = 1;
const ADMIN_USERS_PER_PAGE = 5;

async function loadAdminUsers() {
  const list = document.getElementById("adminUsersList");
  const total = document.getElementById("adminTotalUsers");
  const pagination = document.getElementById("adminUsersPagination");
  const resultCount = document.getElementById("adminUserResultCount");

  if (!list || !total) return;

  list.textContent = "Loading accounts...";

  try {
    const result = await requestJSON("/api/admin/users");
    const users = Array.isArray(result.users) ? result.users : [];

    total.textContent = users.length;

    const searchInput = document.getElementById("adminUserSearch");
    const roleFilter = document.getElementById("adminRoleFilter");

    const searchQuery = (searchInput?.value || "").trim().toLowerCase();
    const selectedRole = (roleFilter?.value || "all").toLowerCase();

    const filteredUsers = users.filter((user) => {
      const name = String(user.name || "").toLowerCase();
      const email = String(user.email || "").toLowerCase();
      const role = String(user.role || "user").toLowerCase();

      const matchesSearch =
        name.includes(searchQuery) || email.includes(searchQuery);

      const matchesRole =
        selectedRole === "all" || role === selectedRole;

      return matchesSearch && matchesRole;
    });

    if (resultCount) {
      resultCount.textContent =
        `${filteredUsers.length} of ${users.length} accounts`;
    }

    list.replaceChildren();

    if (filteredUsers.length === 0) {
      list.textContent = users.length
        ? "No accounts match your search."
        : "No registered accounts found.";

      if (pagination) pagination.replaceChildren();

      adminUsersPage = 1;
      return;
    }

    const totalPages = Math.ceil(
      filteredUsers.length / ADMIN_USERS_PER_PAGE
    );

    adminUsersPage = Math.min(
      Math.max(1, adminUsersPage),
      totalPages
    );

    const startIndex =
      (adminUsersPage - 1) * ADMIN_USERS_PER_PAGE;

    const paginatedUsers = filteredUsers.slice(
      startIndex,
      startIndex + ADMIN_USERS_PER_PAGE
    );

    // Account pagination
    if (pagination) {
      pagination.replaceChildren();

      const previousButton = document.createElement("button");
      previousButton.type = "button";
      previousButton.className = "btn btn-secondary";
      previousButton.textContent = "Previous";
      previousButton.disabled = adminUsersPage === 1;

      previousButton.addEventListener("click", () => {
        if (adminUsersPage > 1) {
          adminUsersPage--;
          loadAdminUsers();
        }
      });

      const pageLabel = document.createElement("span");
      pageLabel.textContent =
        `Page ${adminUsersPage} of ${totalPages}`;

      const nextButton = document.createElement("button");
      nextButton.type = "button";
      nextButton.className = "btn btn-secondary";
      nextButton.textContent = "Next";
      nextButton.disabled = adminUsersPage === totalPages;

      nextButton.addEventListener("click", () => {
        if (adminUsersPage < totalPages) {
          adminUsersPage++;
          loadAdminUsers();
        }
      });

      pagination.append(
        previousButton,
        pageLabel,
        nextButton
      );
    }

    // Render account cards
    paginatedUsers.forEach((user) => {
      const card = document.createElement("article");
      card.className = "admin-user-card";

      const details = document.createElement("div");
      details.className = "admin-user-details";

      const name = document.createElement("h4");
      name.textContent = user.name || "Unnamed user";

      const email = document.createElement("p");
      email.textContent = user.email || "No email";

      const role = document.createElement("span");
      role.className = "admin-user-role";
      role.textContent = user.role || "user";

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
    list.textContent =
      error.message || "Could not load user accounts.";

    if (pagination) pagination.replaceChildren();
  }
}



let adminMemoryFilterState = {
  userId: null,
  userName: "",
  memories: []
};
let adminMemoriesPage = 1;
const ADMIN_MEMORIES_PER_PAGE = 5;
async function loadAdminUserMemories(userId, userName) {
  const panel = document.getElementById("adminUserMemories");
  const title = document.getElementById("adminSelectedUserTitle");
  const list = document.getElementById("adminUserMemoriesList");

  if (!panel || !title || !list) return;

  panel.classList.remove("hidden");
  title.textContent = `Memories belonging to ${userName}`;
  list.textContent = "Loading memories...";

  try {
    const result = await requestJSON(
      `/api/admin/users/${userId}/memories`
    );

    adminMemoryFilterState = {
      userId,
      userName,
      memories: Array.isArray(result.memories) ? result.memories : []
    };
console.table(
  adminMemoryFilterState.memories.map(memory => ({
    title: memory.title,
    reveal_at: memory.reveal_at,
    parsedDate: Date.parse(memory.reveal_at),
    isRevealed: Date.parse(memory.reveal_at) <= Date.now()
  }))
);
    const searchInput = document.getElementById("adminMemorySearch");
    const statusFilter = document.getElementById("adminMemoryStatusFilter");
    const categoryFilter = document.getElementById("adminMemoryCategoryFilter");

    if (searchInput) searchInput.value = "";
    if (statusFilter) statusFilter.value = "all";

    if (categoryFilter) {
      categoryFilter.replaceChildren();

      [
        { value: "all", label: "All categories" },
        ...[...new Set(
          adminMemoryFilterState.memories.map(
            memory => String(memory.category || "Personal")
          )
        )].sort().map(category => ({
          value: category,
          label: category
        }))
      ].forEach(optionData => {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        categoryFilter.appendChild(option);
      });
    }

    renderAdminMemoryList();
  } catch (error) {
    list.textContent = error.message || "Unable to load memories.";
  }
}


function renderAdminMemoryList() {
  const list = document.getElementById("adminUserMemoriesList");
  const resultCount = document.getElementById("adminMemoryResultCount");
  const searchInput = document.getElementById("adminMemorySearch");
  const statusFilter = document.getElementById("adminMemoryStatusFilter");
  const categoryFilter = document.getElementById("adminMemoryCategoryFilter");
  const pagination = document.getElementById("adminMemoriesPagination");

  if (!list) return;

  const memories = adminMemoryFilterState.memories || [];
  const query = (searchInput?.value || "").trim().toLowerCase();
  const selectedStatus = statusFilter?.value || "all";
  const selectedCategory = categoryFilter?.value || "all";

  // Apply search and filters before pagination.
  const filtered = memories.filter((memory) => {
    const title = String(memory.title || "").toLowerCase();
    const message = String(memory.message || "").toLowerCase();
    const category = String(memory.category || "Personal");
    const revealTime = Date.parse(memory.reveal_at);
    const isRevealed =
      Number.isFinite(revealTime) && revealTime <= Date.now();

    const matchesSearch =
      title.includes(query) || message.includes(query);

    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "revealed" && isRevealed) ||
      (selectedStatus === "locked" && !isRevealed);

    const matchesCategory =
      selectedCategory === "all" || category === selectedCategory;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  if (resultCount) {
    resultCount.textContent =
      `${filtered.length} of ${memories.length} memories`;
  }

  list.replaceChildren();

  // Handle empty search/filter results.
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-memory-no-media";
    empty.textContent = memories.length
      ? "No memories match these filters."
      : "This account has no memories.";

    list.appendChild(empty);

    if (pagination) pagination.replaceChildren();
    adminMemoriesPage = 1;
    return;
  }

  // Pagination: five memories per page.
  const totalPages = Math.ceil(
    filtered.length / ADMIN_MEMORIES_PER_PAGE
  );

  adminMemoriesPage = Math.min(
    Math.max(1, adminMemoriesPage),
    totalPages
  );

  const startIndex =
    (adminMemoriesPage - 1) * ADMIN_MEMORIES_PER_PAGE;

  const paginatedMemories = filtered.slice(
    startIndex,
    startIndex + ADMIN_MEMORIES_PER_PAGE
  );

  // Build pagination controls.
  if (pagination) {
    pagination.replaceChildren();

    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.className = "btn btn-secondary";
    previousButton.textContent = "Previous";
    previousButton.disabled = adminMemoriesPage === 1;

    previousButton.addEventListener("click", () => {
      if (adminMemoriesPage > 1) {
        adminMemoriesPage--;
        renderAdminMemoryList();
      }
    });

    const pageLabel = document.createElement("span");
    pageLabel.textContent =
      `Page ${adminMemoriesPage} of ${totalPages}`;

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "btn btn-secondary";
    nextButton.textContent = "Next";
    nextButton.disabled = adminMemoriesPage === totalPages;

    nextButton.addEventListener("click", () => {
      if (adminMemoriesPage < totalPages) {
        adminMemoriesPage++;
        renderAdminMemoryList();
      }
    });

    pagination.append(previousButton, pageLabel, nextButton);
  }

  // Render only the memories on the current page.
  paginatedMemories.forEach((memory) => {
    const card = document.createElement("article");
    card.className = "admin-memory-card";

    const heading = document.createElement("h4");
    heading.textContent = memory.title || "Untitled memory";

    const category = document.createElement("span");
    category.className = "memory-category";
    category.textContent = memory.category || "Personal";

    const revealTime = Date.parse(memory.reveal_at);
    const isRevealed =
      Number.isFinite(revealTime) && revealTime <= Date.now();

    const status = document.createElement("span");
    status.className =
      `cyber-memory-status ${isRevealed ? "is-revealed" : "is-locked"}`;
    status.textContent = isRevealed ? "REVEALED" : "LOCKED";

    const message = document.createElement("p");
    message.className = "admin-memory-message";
    message.textContent = memory.message || "No text message.";

    const revealDate = document.createElement("p");
    revealDate.className = "admin-memory-reveal-date";
    revealDate.textContent = `Reveal date: ${
      Number.isFinite(revealTime)
        ? new Date(revealTime).toLocaleString()
        : "Unavailable"
    }`;

    const mediaSection = document.createElement("div");
    mediaSection.className = "admin-memory-media";

    const attachments = Array.isArray(memory.media) ? memory.media : [];

    const mediaHeading = document.createElement("h5");
    mediaHeading.textContent = `Attachments (${attachments.length})`;
    mediaSection.appendChild(mediaHeading);

    if (attachments.length === 0) {
      const emptyMedia = document.createElement("p");
      emptyMedia.className = "admin-memory-no-media";
      emptyMedia.textContent = "No media attached.";
      mediaSection.appendChild(emptyMedia);
    } else {
      attachments.forEach((attachment) => {
        const mediaRow = document.createElement("div");
        mediaRow.className = "admin-memory-media-row";

        const fileInfo = document.createElement("div");
        fileInfo.className = "admin-memory-file-info";

        const fileType = document.createElement("span");
        fileType.className = "admin-memory-file-type";
        fileType.textContent =
          String(attachment.media_type || "file").toUpperCase();

        const fileName = document.createElement("span");
        fileName.className = "admin-memory-file-name";
        fileName.textContent =
          attachment.original_name || "Unnamed file";

        const fileSize = document.createElement("span");
        fileSize.className = "admin-memory-file-size";
        const bytes = Number(attachment.size_bytes || 0);

        fileSize.textContent = bytes > 0
          ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
          : "Size unavailable";

        fileInfo.append(fileType, fileName, fileSize);
        mediaRow.appendChild(fileInfo);

        const previewButton = document.createElement("button");
        previewButton.type = "button";
        previewButton.className = "admin-media-preview-btn";
        previewButton.textContent = "Preview";

        previewButton.addEventListener("click", async () => {
          previewButton.disabled = true;
          previewButton.textContent = "Loading...";

          try {
            const access = await requestJSON(
              `/api/admin/media/${attachment.id}/access`
            );

            if (!access.url) {
              throw new Error("No preview URL was returned.");
            }

            openAdminMediaViewer({
              url: access.url,
              name: attachment.original_name || "Untitled attachment",
              type: attachment.media_type || "file",
              mimeType: attachment.mime_type || "",
              size: Number(attachment.size_bytes || 0)
            });
          } catch (error) {
            window.alert(
              error.message || "Unable to preview this attachment."
            );
          } finally {
            previewButton.disabled = false;
            previewButton.textContent = "Preview";
          }
        });

        mediaRow.appendChild(previewButton);
        mediaSection.appendChild(mediaRow);
      });
    }

    card.append(
      heading,
      category,
      status,
      message,
      revealDate,
      mediaSection
    );

    list.appendChild(card);
  });
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
let archiveMemories = [];

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

function renderMemoryLoadingSkeletons(count = 3) {
  if (!memoriesList) return;

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < count; index++) {
    const card = document.createElement("article");
    card.className = "mv-memory-skeleton";
    card.setAttribute("aria-hidden", "true");

    card.innerHTML = `
      <div class="mv-skeleton-line mv-skeleton-title"></div>
      <div class="mv-skeleton-line mv-skeleton-category"></div>
      <div class="mv-skeleton-line mv-skeleton-message"></div>
      <div class="mv-skeleton-line mv-skeleton-message short"></div>
      <div class="mv-skeleton-line mv-skeleton-date"></div>
      <div class="mv-skeleton-line mv-skeleton-button"></div>
    `;

    fragment.appendChild(card);
  }

  memoriesList.setAttribute("aria-busy", "true");
  memoriesList.replaceChildren(fragment);
}

function renderMemoryEmptyState({
  icon = "✧",
  title = "Nothing here yet",
  message = "Your next memory is waiting to be created.",
  buttonText = "",
  onAction = null
} = {}) {
  if (!memoriesList) return;

  const section = document.createElement("section");
  section.className = "mv-empty-state";

  const symbol = document.createElement("div");
  symbol.className = "mv-empty-state-icon";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = icon;

  const heading = document.createElement("h3");
  heading.textContent = title;

  const description = document.createElement("p");
  description.textContent = message;

  section.append(symbol, heading, description);

  if (buttonText && typeof onAction === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary";
    button.textContent = buttonText;
    button.addEventListener("click", onAction);
    section.appendChild(button);
  }

  memoriesList.setAttribute("aria-busy", "false");
  memoriesList.replaceChildren(section);
}


 async function loadMemories(useCache = false) {
   capsuleTimers.forEach((timer) => clearInterval(timer));
capsuleTimers = [];
if (!useCache) {
  renderMemoryLoadingSkeletons();
}
    try {
     const result = useCache
  ? archiveMemories
  : await requestJSON("/api/memories");

const memories = Array.isArray(result) ? result : result.memories;

      if (!Array.isArray(memories)) {
        throw new Error("The server returned an unexpected memory list.");
      }
archiveMemories = memories;
      document.getElementById("totalMemories").textContent = memories.length;
      document.getElementById("lockedMemories").textContent =
        memories.filter((memory) => !memory.revealed).length;
      document.getElementById("revealedMemories").textContent =
        memories.filter((memory) => memory.revealed).length;

      memoriesList.replaceChildren();
memoriesList.setAttribute("aria-busy", "false");
if (memories.length === 0) {
  renderMemoryEmptyState({
    icon: "✧",
    title: "Your story starts here",
    message:
      "Every great memory begins with a moment. Save a message today and let your future self rediscover it.",
    buttonText: "Create Your First Memory",
    onAction: () => {
      document.getElementById("vaultCreate")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      document.getElementById("memoryTitle")?.focus({
        preventScroll: true
      });
    }
  });

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
if (filteredMemories.length === 0) {
  const hasSearch = Boolean(searchTerm);
  const hasFilter = selectedFilter !== "all";

  renderMemoryEmptyState({
    icon: hasSearch ? "⌕" : "✧",
    title: hasSearch
      ? "No memories found"
      : "Nothing in this filter yet",
    message:
      hasSearch && hasFilter
        ? "No memories match your search and selected status."
        : hasSearch
          ? "Try a different search term."
          : "Try another status filter to see more memories.",
    buttonText: "Clear Search & Filters",
    onAction: () => {
      if (searchInput) searchInput.value = "";
      if (filterSelect) filterSelect.value = "all";
      loadMemories(true);
    }
  });

  return;
}
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

        const mediaContainer = document.createElement("div");
        mediaContainer.className = "memory-media-list";
        const mediaItems = Array.isArray(memory.media) ? memory.media : [];
        if (!memory.revealed && Number(memory.media_count || 0) > 0) {
          const lockedMedia = document.createElement("p");
          lockedMedia.className = "memory-media-locked";
          lockedMedia.textContent = `🔒 ${memory.media_count} media attachment(s) unlock with this memory`;
          mediaContainer.appendChild(lockedMedia);
        } else if (memory.revealed && mediaItems.length) {
          mediaItems.forEach((item) => {
            const mediaCard = document.createElement("div");
            mediaCard.className = "memory-media-item";
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "memory-media-open";
           openButton.textContent = `Open ${item.media_type}: ${item.original_name}`;
openButton.addEventListener("click", async () =>{
  openButton.disabled = true;
  try{
    const access = await requestJSON(`/api/media/${item.id}/access`);

    const overlay = document.createElement("div");
    overlay.className = "media-preview-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `Preview ${item.original_name}`);

    const panel = document.createElement("div");
    panel.className = "media-preview-panel";

    const header = document.createElement("div");
    header.className = "media-preview-header";

    const heading = document.createElement("h2");
    heading.className = "media-preview-title";
    heading.textContent = item.original_name;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "media-preview-close";
    closeButton.textContent = "✕";
    closeButton.setAttribute("aria-label", "Close media preview");

    const closePreview = () => {
      document.removeEventListener("keydown", onPreviewKeydown);
      overlay.remove();
    };

    const onPreviewKeydown = (event) => {
      if (event.key === "Escape") closePreview();
    };

    closeButton.addEventListener("click", closePreview);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePreview();
    });

    header.append(heading, closeButton);

    const content = document.createElement("div");
    content.className = "media-preview-content";

    let mediaElement;

    if (item.media_type === "image") {
      mediaElement = document.createElement("img");
      mediaElement.alt = item.original_name;
    } else if (item.media_type === "video") {
      mediaElement = document.createElement("video");
      mediaElement.controls = true;
      mediaElement.playsInline = true;
    } else if (item.media_type === "audio") {
      mediaElement = document.createElement("audio");
      mediaElement.controls = true;
    } else {
      throw new Error("Unsupported media type.");
    }
    mediaElement.className = "media-preview-player";
    mediaElement.src = access.url;
    content.appendChild(mediaElement);

    panel.append(header, content);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    document.addEventListener("keydown", onPreviewKeydown);
    closeButton.focus();
  } catch (error) {
    window.alert(error.message || "Could not open this media file.");
  } finally {
    openButton.disabled = false;
  }
});

            mediaCard.appendChild(openButton);
            mediaContainer.appendChild(mediaCard);
          });
        }

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

showToast(
  "The memory has been permanently deleted.",
  "success",
  "Memory Deleted"
);

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
  mediaContainer,
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
const memoryMediaInput = document.getElementById("memoryMedia");
const mediaSelectionSummary = document.getElementById("mediaSelectionSummary");
let selectedMediaFiles = [];
function renderSelectedMedia() {
  if (!mediaSelectionSummary) return;

  mediaSelectionSummary.replaceChildren();
  mediaSelectionSummary.classList.remove("error");

  const totalBytes = selectedMediaFiles.reduce(
    (sum, file) => sum + file.size, 0
  );

  const summary = document.createElement("p");
  summary.textContent = selectedMediaFiles.length
    ? `${selectedMediaFiles.length}/5 files selected · ${(totalBytes / (1024 * 1024)).toFixed(1)} MB total`
    : "No files selected";
  mediaSelectionSummary.appendChild(summary);

  selectedMediaFiles.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = "media-selection-row";

    const name = document.createElement("span");
    name.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.addEventListener("click", () => {
      selectedMediaFiles.splice(index, 1);

      const transfer = new DataTransfer();
      selectedMediaFiles.forEach((selectedFile) => transfer.items.add(selectedFile));
      memoryMediaInput.files = transfer.files;

      renderSelectedMedia();
    });

    row.append(name, remove);
    mediaSelectionSummary.appendChild(row);
  });
}

if (memoryMediaInput && mediaSelectionSummary) {
  memoryMediaInput.addEventListener("change", () => {
    const newlySelected = Array.from(memoryMediaInput.files || []);
    const combined = [...selectedMediaFiles];

    for (const file of newlySelected) {
      const duplicate = combined.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
      );

      if (!duplicate) combined.push(file);
  }
const oversized = combined.find((file) => file.size > 25 * 1024 * 1024);
if (combined.length > 5 || oversized) {
  selectedMediaFiles = [];
  const transfer = new DataTransfer();
  memoryMediaInput.files = transfer.files;

  mediaSelectionSummary.textContent = combined.length > 5
    ? "You can select up to 5 files. Please select them again."
    : `${oversized.name} exceeds the 25 MB per-file limit. Please select your files again.`;

  mediaSelectionSummary.classList.add("error");
  return;
}
    selectedMediaFiles = combined;

    const transfer = new DataTransfer();
    selectedMediaFiles.forEach((file) => transfer.items.add(file));
    memoryMediaInput.files = transfer.files;

    renderSelectedMedia();
  });
}


  memoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = memoryForm.querySelector('button[type="submit"]');
    const selectedFiles = [...selectedMediaFiles];
    const messageInput = document.getElementById("memoryMessage");
    button.disabled = true;
    showMemoryFormMessage("");

    try {
      const data = Object.fromEntries(new FormData(memoryForm).entries());
      if (new Date(data.revealAt).getTime() <= Date.now()) {
        throw new Error("Please choose a future reveal date and time.");
      }
      if (!String(data.message || "").trim() && selectedFiles.length === 0) {
        throw new Error("Write a message or attach at least one media file.");
      }
      if (selectedFiles.length > 5) {
        throw new Error("Choose no more than 5 files per memory.");
      }
      const oversized = selectedFiles.find((file) => file.size > 25 * 1024 * 1024);
      if (oversized) throw new Error(`${oversized.name} exceeds the 25 MB per-file limit.`);

      const memoryData = {
        title: data.title,
        message: data.message || "",
        category: data.category || "Personal",
        revealAt: new Date(data.revealAt).toISOString(),
        allowMediaOnly: selectedFiles.length > 0
      };

      const created = await requestJSON("/api/memories", {
        method: "POST",
        body: JSON.stringify(memoryData)
      });

      if (selectedFiles.length) {
        const uploadData = new FormData();
        selectedFiles.forEach((file) => uploadData.append("media", file));
        const uploadResponse = await fetch(`/api/memories/${created.memoryId}/media`, {
          method: "POST",
          body: uploadData
        });
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) {
          throw new Error(
            `Memory was created, but media upload failed: ${uploadResult.error || "Please retry the upload."} The memory record is saved.`
          );
        }
      }

      memoryForm.reset();
      selectedMediaFiles = [];
renderSelectedMedia();
      if (mediaSelectionSummary) {
        mediaSelectionSummary.textContent = "";
        mediaSelectionSummary.classList.remove("error");
      }
     showMemoryFormMessage("Memory saved successfully!");
showToast(
  "Your memory has been safely saved in MemoryVault.",
  "success",
  "Memory Created"
);
await loadMemories();

} catch (error) {
  showMemoryFormMessage(error.message, true);

  showToast(
    error.message || "Unable to save your memory. Please try again.",
    "error",
    "Memory Save Failed"
  );
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

const adminUserSearch = document.getElementById("adminUserSearch");
const adminRoleFilter = document.getElementById("adminRoleFilter");

if (adminUserSearch) {
adminUserSearch.addEventListener("input", () => {
  adminUsersPage = 1;
  loadAdminUsers();
});
}

if (adminRoleFilter) {
 adminRoleFilter.addEventListener("change", () => {
  adminUsersPage = 1;
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

// Admin memory search and filters
const adminMemorySearch = document.getElementById("adminMemorySearch");
const adminMemoryStatusFilter = document.getElementById("adminMemoryStatusFilter");
const adminMemoryCategoryFilter = document.getElementById("adminMemoryCategoryFilter");

if (adminMemorySearch) {
  adminMemorySearch.addEventListener("input", renderAdminMemoryList);
}

if (adminMemoryStatusFilter) {
  adminMemoryStatusFilter.addEventListener("change", renderAdminMemoryList);
}

if (adminMemoryCategoryFilter) {
  adminMemoryCategoryFilter.addEventListener("change", renderAdminMemoryList);
}

  // Search and filter memories locally
  const memorySearch = document.getElementById("memorySearch");
  const memoryFilter = document.getElementById("memoryFilter");

  if (memorySearch) {
    memorySearch.addEventListener("input", () => {
      loadMemories(true);
    });
  }

  if (memoryFilter) {
    memoryFilter.addEventListener("change", () => {
      loadMemories(true);
    });
  }



  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
await requestJSON("/api/logout", { method: "POST" });
showLandingPage();
showToast(
  "You have safely logged out of MemoryVault.",
  "success",
  "Logged Out"
);
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



/* =====================================================
   MEMORYVAULT — PUBLIC LANDING MOTION
   Scoped to marketing sections; dashboard/admin stay untouched.
   ===================================================== */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const publicSections = [
    document.querySelector('.hero'),
    document.querySelector('#how-it-works'),
    document.querySelector('#features'),
    document.querySelector('.memory-preview'),
    document.querySelector('#start')
  ].filter(Boolean);

  if (reduceMotion || !('IntersectionObserver' in window)) return;

  publicSections.forEach((section, sectionIndex) => {
    section.classList.add('mv-scroll-reveal');
    section.style.setProperty('--mv-reveal-delay', `${Math.min(sectionIndex * 45, 180)}ms`);
    const children = section.querySelectorAll('.feature-card, .step-card, .memory-preview-card, .feature-item, .how-step, .feature');
    children.forEach((child, index) => {
      child.classList.add('mv-scroll-reveal', 'mv-reveal-child');
      child.style.setProperty('--mv-reveal-delay', `${Math.min(index * 90, 360)}ms`);
    });
  });

  document.body.classList.add('mv-motion-ready');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('mv-in-view');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });

  document.querySelectorAll('.mv-scroll-reveal').forEach((element) => observer.observe(element));
})();



/* MEMORYVAULT — VAULT CORE DEPTH INTERACTION
   Pointer response is decorative only and disabled for touch/reduced-motion. */
(() => {
  const intro = document.getElementById("cosmicIntro");
  const stage = intro?.querySelector(".mv-vault-stage");
  if (!intro || !stage) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (reducedMotion || !finePointer) return;

  let frame = 0;
  const reset = () => {
    stage.style.setProperty("--mv-stage-x", "0px");
    stage.style.setProperty("--mv-stage-y", "0px");
  };

  intro.addEventListener("pointermove", (event) => {
    if (intro.classList.contains("intro-opening") || intro.classList.contains("intro-hidden")) return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bounds = intro.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      stage.style.setProperty("--mv-stage-x", `${(x * 13).toFixed(2)}px`);
      stage.style.setProperty("--mv-stage-y", `${(y * 9).toFixed(2)}px`);
    });
  }, { passive: true });

  intro.addEventListener("pointerleave", reset, { passive: true });
  intro.addEventListener("cosmic-intro-replay", reset);
})();
