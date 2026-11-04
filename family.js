(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const authView = $("authView");
  const dashboardView = $("dashboardView");
  const loginForm = $("familyLoginForm");
  const registerForm = $("familyRegisterForm");
  const authMessage = $("authMessage");
  let familyData = null;

  function setMessage(element, text, isError = false) {
    if (!element) return;
    element.textContent = text || "";
    element.classList.toggle("error", isError);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || data.message || "Something went wrong.");
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function setSubmitting(form, isSubmitting, busyLabel = "Saving...") {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;

    if (isSubmitting) {
      button.dataset.idleLabel = button.textContent.trim();
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = busyLabel;
      return;
    }

    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.idleLabel) {
      button.textContent = button.dataset.idleLabel;
      delete button.dataset.idleLabel;
    }
  }

  function switchTab(tab) {
    const isRegister = tab === "register";
    loginForm.classList.toggle("hidden", isRegister);
    registerForm.classList.toggle("hidden", !isRegister);
    loginForm.setAttribute("aria-hidden", String(isRegister));
    registerForm.setAttribute("aria-hidden", String(!isRegister));
    $("loginTab").classList.toggle("active", !isRegister);
    $("registerTab").classList.toggle("active", isRegister);
    $("loginTab").setAttribute("aria-selected", String(!isRegister));
    $("registerTab").setAttribute("aria-selected", String(isRegister));
    setMessage(authMessage, "");
  }

  $("loginTab").addEventListener("click", () => switchTab("login"));
  $("registerTab").addEventListener("click", () => switchTab("register"));
  document.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const tabs = [$("loginTab"), $("registerTab")];
    const currentIndex = tabs.indexOf(document.activeElement);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const nextTab = nextIndex === 1 ? "register" : "login";
    tabs[nextIndex].focus();
    switchTab(nextTab);
  });

  async function submitForm(form, endpoint, successText) {
    setSubmitting(form, true, endpoint.endsWith("/login") ? "Signing in..." : "Creating account...");
    setMessage(authMessage, "");

    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const result = await api(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });

      if (endpoint.endsWith("/login")) {
        await loadDashboard();
        form.reset();
        return;
      }

      form.reset();
      setMessage(authMessage, result.message || successText);
    } catch (error) {
      setMessage(authMessage, error.message, true);
    } finally {
      setSubmitting(form, false);
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(loginForm, "/api/family/login", "You can sign in once email verification is complete.");
  });
  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(registerForm, "/api/family/register", "Family account created.");
  });

  function initials(name) {
    return String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("")
      .toLocaleUpperCase();
  }

  function renderMembers() {
    const list = $("membersList");
    list.replaceChildren();

    const people = [
      {
        name: familyData.family.owner_name,
        username: familyData.family.owner_username,
        role: "owner",
        status: "Family owner"
      },
      ...familyData.members.map((member) => ({
        ...member,
        role: "member",
        status: member.status === "disabled" ? "Member · paused" : "Family member"
      }))
    ];

    people.forEach((person) => {
      const card = document.createElement("article");
      card.className = `member-card member-${person.role}`;

      const avatar = document.createElement("span");
      avatar.className = "member-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = initials(person.name);

      const role = document.createElement("span");
      role.className = "member-role";
      role.textContent = person.status;

      const name = document.createElement("strong");
      name.textContent = person.name;

      const username = document.createElement("small");
      username.textContent = `@${person.username}`;

      card.append(avatar, role, name, username);
      list.appendChild(card);
    });
  }

  function formatDate(value, options = {}) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return date.toLocaleString([], {
      dateStyle: "medium",
      ...(options.time ? { timeStyle: "short" } : {})
    });
  }

  function renderActivity(memories) {
    const total = memories.length;
    const revealed = memories.filter((memory) => memory.revealed).length;
    $("familyMemoryCount").textContent = String(total);
    $("familyLockedCount").textContent = String(total - revealed);
    $("familyRevealedCount").textContent = String(revealed);

    const timeline = $("familyActivityTimeline");
    timeline.replaceChildren();
    const recent = [...memories]
      .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
      .slice(0, 4);

    if (!recent.length) {
      const empty = document.createElement("li");
      empty.className = "activity-empty";
      empty.textContent = "Your first shared memory will begin the family timeline.";
      timeline.appendChild(empty);
      return;
    }

    recent.forEach((memory) => {
      const item = document.createElement("li");
      item.className = `activity-entry${memory.revealed ? " is-revealed" : " is-locked"}`;

      const marker = document.createElement("span");
      marker.className = "activity-marker";
      marker.setAttribute("aria-hidden", "true");

      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = memory.title || "Untitled memory";
      const date = document.createElement("small");
      date.textContent = `Added ${formatDate(memory.created_at)}`;
      details.append(title, date);
      item.append(marker, details);
      timeline.appendChild(item);
    });
  }

  function showMediaPreview(item, url) {
    const overlay = document.createElement("div");
    overlay.className = "family-media-preview";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `Preview ${item.original_name || "memory attachment"}`);

    const panel = document.createElement("section");
    panel.className = "family-media-preview-panel";

    const header = document.createElement("header");
    header.className = "family-media-preview-header";

    const title = document.createElement("h2");
    title.textContent = item.original_name || "Memory attachment";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "family-media-preview-close";
    closeButton.setAttribute("aria-label", "Close media preview");
    closeButton.textContent = "×";
    header.append(title, closeButton);

    const stage = document.createElement("div");
    stage.className = "family-media-preview-stage";
    let media;

    if (item.media_type === "image" && item.mime_type?.startsWith("image/")) {
      media = document.createElement("img");
      media.alt = item.original_name || "Family memory attachment";
    } else if (item.media_type === "video" && item.mime_type?.startsWith("video/")) {
      media = document.createElement("video");
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
    } else if (item.media_type === "audio" && item.mime_type?.startsWith("audio/")) {
      media = document.createElement("audio");
      media.controls = true;
      media.preload = "metadata";
    }

    if (!media) {
      const note = document.createElement("p");
      note.textContent = "Preview is unavailable for this attachment type.";
      stage.appendChild(note);
    } else {
      media.className = "family-media-preview-player";
      media.src = url;
      stage.appendChild(media);
    }

    panel.append(header, stage);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = () => {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") close();
    };
    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown);
    closeButton.focus();
  }

  function addMemoryMedia(card, mediaItems) {
    if (!mediaItems.length) return;

    const mediaSection = document.createElement("div");
    mediaSection.className = "family-memory-media";
    const label = document.createElement("p");
    label.className = "memory-media-label";
    label.textContent = "KEPT WITH THIS MEMORY";
    mediaSection.appendChild(label);

    mediaItems.forEach((item) => {
      const mediaButton = document.createElement("button");
      mediaButton.type = "button";
      mediaButton.className = `family-media-item family-media-${item.media_type}`;

      const icon = document.createElement("span");
      icon.className = "family-media-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = item.media_type === "image" ? "▧" : item.media_type === "video" ? "▶" : "♫";

      const name = document.createElement("span");
      name.className = "family-media-name";
      name.textContent = item.original_name || `${item.media_type || "File"} attachment`;

      const type = document.createElement("small");
      type.textContent = item.media_type || "Attachment";
      mediaButton.append(icon, name, type);

      mediaButton.addEventListener("click", async () => {
        mediaButton.disabled = true;
        mediaButton.setAttribute("aria-busy", "true");
        try {
          const access = await api(`/api/family/media/${item.id}/access`);
          showMediaPreview(item, access.url);
        } catch (error) {
          setMessage($("dashboardMessage"), error.message, true);
        } finally {
          mediaButton.disabled = false;
          mediaButton.removeAttribute("aria-busy");
        }
      });
      mediaSection.appendChild(mediaButton);
    });

    card.appendChild(mediaSection);
  }

  function renderMemories(memories) {
    const list = $("memoriesList");
    list.classList.remove("is-loading", "is-error");
    list.setAttribute("aria-busy", "false");
    renderActivity(memories);
    list.replaceChildren();

    if (!memories.length) {
      const empty = document.createElement("div");
      empty.className = "family-empty-state";
      const illustration = document.createElement("span");
      illustration.className = "empty-memory-orbit";
      illustration.setAttribute("aria-hidden", "true");
      illustration.textContent = "✦";
      const heading = document.createElement("strong");
      heading.textContent = "Your shared story starts here.";
      const message = document.createElement("p");
      message.textContent = "Save a family moment now and choose when you will open it together.";
      empty.append(illustration, heading, message);
      list.appendChild(empty);
      return;
    }

    memories.forEach((memory) => {
      const card = document.createElement("article");
      card.className = `memory-card ${memory.revealed ? "revealed" : "locked"}`;

      const top = document.createElement("div");
      top.className = "family-memory-top";
      const status = document.createElement("span");
      status.className = "family-memory-status";
      status.textContent = memory.revealed ? "Ready to revisit" : "Sealed for later";
      const category = document.createElement("span");
      category.className = "family-memory-category";
      category.textContent = memory.category || "Family";
      top.append(status, category);

      const heading = document.createElement("h3");
      heading.textContent = memory.title || "Untitled memory";

      const copy = document.createElement("p");
      copy.className = "family-memory-copy";
      copy.textContent = memory.revealed
        ? memory.message || ""
        : "This memory is waiting for its chosen moment.";

      const meta = document.createElement("div");
      meta.className = "family-memory-meta";
      const saved = document.createElement("span");
      saved.textContent = `Saved ${formatDate(memory.created_at)}`;
      const reveal = document.createElement("span");
      reveal.textContent = `${memory.revealed ? "Opened" : "Opens"} ${formatDate(memory.reveal_at, { time: true })}`;
      meta.append(saved, reveal);

      card.append(top, heading, copy);
      if (memory.revealed && Array.isArray(memory.media)) {
        addMemoryMedia(card, memory.media);
      } else if (!memory.revealed && Array.isArray(memory.media) && memory.media.length) {
        const lockedMedia = document.createElement("p");
        lockedMedia.className = "memory-media-locked";
        lockedMedia.textContent = `${memory.media.length} attachment${memory.media.length === 1 ? "" : "s"} sealed with this memory`;
        card.appendChild(lockedMedia);
      }
      card.appendChild(meta);
      list.appendChild(card);
    });
  }

  async function loadMemories() {
    const list = $("memoriesList");
    list.classList.add("is-loading");
    list.classList.remove("is-error");
    list.setAttribute("aria-busy", "true");
    const skeletons = document.createDocumentFragment();
    for (let index = 0; index < 2; index += 1) {
      const skeleton = document.createElement("article");
      skeleton.className = "family-memory-skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      skeletons.appendChild(skeleton);
    }
    list.replaceChildren(skeletons);

    try {
      const result = await api("/api/family/memories");
      if (!Array.isArray(result.memories)) {
        throw new Error("The server returned an unexpected family memory list.");
      }
      renderMemories(result.memories);
    } catch (error) {
      list.classList.remove("is-loading");
      list.classList.add("is-error");
      list.setAttribute("aria-busy", "false");
      const failure = document.createElement("p");
      failure.className = "family-memory-load-error";
      failure.textContent = error.message;
      list.replaceChildren(failure);
      throw error;
    }
  }

  async function loadDashboard(data = null) {
    familyData = data || await api("/api/family/me");
    authView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    $("familyTitle").textContent = familyData.family.family_name;
    $("welcomeText").textContent = `${familyData.user.name} · ${familyData.user.role === "owner" ? "Family owner" : "Family member"}`;
    $("memberSetup").classList.toggle(
      "hidden",
      familyData.user.role !== "owner" || familyData.members.length > 0
    );
    setMessage($("dashboardMessage"), "");
    renderMembers();

    try {
      await loadMemories();
      return true;
    } catch (error) {
      setMessage($("dashboardMessage"), error.message, true);
      return false;
    }
  }

  $("membersForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formMessage = $("memberFormMessage");
    const formData = new FormData(form);
    const members = [1, 2].map((index) => ({
      name: formData.get(`name${index}`),
      username: formData.get(`username${index}`),
      password: formData.get(`password${index}`)
    }));

    setSubmitting(form, true, "Creating accounts...");
    setMessage(formMessage, "");
    try {
      const result = await api("/api/family/members", {
        method: "POST",
        body: JSON.stringify({ members })
      });
      form.reset();
      const memoriesLoaded = await loadDashboard();
      if (memoriesLoaded) {
        setMessage($("dashboardMessage"), result.message || "Both family members are ready to join.");
      }
    } catch (error) {
      setMessage(formMessage, error.message, true);
    } finally {
      setSubmitting(form, false);
    }
  });

  $("memoryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formMessage = $("memoryFormMessage");
    const formData = new FormData(form);
    const files = Array.from(form.querySelector('[name="media"]').files);
    const payload = {
      title: formData.get("title"),
      message: formData.get("message"),
      revealAt: formData.get("revealAt"),
      category: formData.get("category")
    };
    let memorySaved = false;

    setSubmitting(form, true, "Preserving your memory...");
    setMessage(formMessage, "");

    try {
      const created = await api("/api/family/memories", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      memorySaved = true;
      form.reset();
      form.querySelector('[name="category"]').value = "Family";

      if (files.length) {
        const upload = new FormData();
        files.forEach((file) => upload.append("media", file));
        const response = await fetch(`/api/family/memories/${created.memoryId}/media`, {
          method: "POST",
          body: upload
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "the media upload failed.");
        }
      }

      await loadMemories();
      setMessage(formMessage, files.length ? "Your family memory and attachments are saved." : "Your family memory is saved.");
    } catch (error) {
      setMessage(
        formMessage,
        memorySaved ? `Your memory was saved, but ${error.message}` : error.message,
        true
      );
      if (memorySaved) {
        try {
          await loadMemories();
        } catch (refreshError) {
          setMessage($("dashboardMessage"), refreshError.message, true);
        }
      }
    } finally {
      setSubmitting(form, false);
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    const button = $("logoutBtn");
    button.disabled = true;
    try {
      await api("/api/family/logout", { method: "POST" });
      dashboardView.classList.add("hidden");
      authView.classList.remove("hidden");
      switchTab("login");
      setMessage(authMessage, "You have safely logged out of FamilyVault.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage($("dashboardMessage"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  api("/api/family/me")
    .then((data) => loadDashboard(data))
    .catch((error) => {
      if (error.status !== 401) {
        setMessage(authMessage, error.message, true);
      }
    });
})();
