document.addEventListener("DOMContentLoaded", () => {
  // ── Load Genres from JSON and build buttons ───────────────────────────────
  const GENRES_JSON_PATH = "Genres.json";

  // Collect all unique tags from all categories in Genres.json, sorted A-Z
  async function loadAndBuildGenreButtons() {
    let allTags = [];
    try {
      const res = await fetch(GENRES_JSON_PATH);
      if (!res.ok && res.status !== 0) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const seen = new Set();
      Object.values(data).forEach((arr) => {
        arr.forEach((tag) => {
          if (!seen.has(tag)) {
            seen.add(tag);
            allTags.push(tag);
          }
        });
      });
      allTags.sort((a, b) => a.localeCompare(b));
    } catch (e) {
      console.warn("Could not load Genres.json:", e);
    }

    // Build filter bar genre buttons
    const genreGrid = document.getElementById("genre-grid");
    if (genreGrid) {
      genreGrid.innerHTML = "";
      allTags.forEach((tag) => {
        const btn = document.createElement("button");
        btn.className = "genre-opt";
        btn.dataset.genre = tag;
        btn.textContent = tag;
        genreGrid.appendChild(btn);
      });
    }

    // Build modal form genre buttons
    const formGenreGrid = document.getElementById("form-genre-grid");
    if (formGenreGrid) {
      formGenreGrid.innerHTML = "";
      allTags.forEach((tag) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "form-genre-opt";
        btn.dataset.genre = tag;
        btn.textContent = tag;
        formGenreGrid.appendChild(btn);
      });
    }

    // Wire up genre button interactions now that buttons exist
    initGenreInteractions();
  }

  loadAndBuildGenreButtons();
  // ── Refs ──────────────────────────────────────────────────────────────────
  const cardGrid = document.getElementById("card-grid");
  const emptyState = document.getElementById("empty-state");
  const resultsCount = document.getElementById("results-count");

  const searchInput = document.getElementById("search-input");

  // ── Custom filter dropdowns (Year / Season / Format / Status) ─────────────
  // Each returns a proxy with a .value getter/setter so the rest of the code
  // doesn't need to change.
  function makeCustomSelect(fieldId) {
    const field    = document.getElementById(fieldId + "-field");
    const control  = document.getElementById(fieldId + "-control");
    const dropdown = document.getElementById(fieldId + "-dropdown");
    const valueEl  = document.getElementById(fieldId + "-value");
    let currentValue = "";

    // Toggle open/close
    control.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains("open");
      // Close all other custom dropdowns first
      document.querySelectorAll(".custom-dropdown.open").forEach(d => {
        if (d !== dropdown) {
          d.classList.remove("open");
          d.closest(".filter-field")?.querySelector(".filter-control--custom")?.classList.remove("open");
        }
      });
      dropdown.classList.toggle("open", !isOpen);
      control.classList.toggle("open", !isOpen);
    });

    // Option clicks
    dropdown.querySelectorAll(".custom-opt").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = btn.dataset.value;
        currentValue = val;
        valueEl.textContent = val || "Any";
        control.classList.toggle("selected", !!val);
        dropdown.querySelectorAll(".custom-opt").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        dropdown.classList.remove("open");
        control.classList.remove("open");
        renderActivePills();
        filterCards();
      });
    });

    // Return value proxy
    return {
      get value() { return currentValue; },
      set value(v) {
        currentValue = v || "";
        valueEl.textContent = v || "Any";
        control.classList.toggle("selected", !!v);
        dropdown.querySelectorAll(".custom-opt").forEach(b => {
          b.classList.toggle("active", b.dataset.value === (v || ""));
        });
      },
      tagName: "CUSTOM",
      addEventListener() {} // no-op; events handled above
    };
  }

  const yearSelect   = makeCustomSelect("year");
  const seasonSelect = makeCustomSelect("season");
  const formatSelect = makeCustomSelect("format");
  const statusSelect = makeCustomSelect("status");

  // Close custom dropdowns when clicking outside
  document.addEventListener("click", () => {
    document.querySelectorAll(".custom-dropdown.open").forEach(d => {
      d.classList.remove("open");
      d.closest(".filter-field")?.querySelector(".filter-control--custom")?.classList.remove("open");
    });
  });

  const genreControl = document.getElementById("genre-control");
  const genreDropdown = document.getElementById("genre-dropdown");
  const genreSelected = document.getElementById("genre-selected");

  const activeTagsEl = document.getElementById("active-tags");
  const sortBtn = document.getElementById("sort-btn");
  const sortIcon = document.getElementById("sort-icon");
  const vmBtns = document.querySelectorAll(".vm-btn");
  const btnClearAll = document.getElementById("btn-clear-filters");

  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title");
  const modalClose = document.getElementById("modal-close");
  const btnAdd = document.querySelector(".btn-add");
  const btnCancel = document.getElementById("btn-cancel");
  const btnSave = document.getElementById("btn-save");
  const editIndexEl = document.getElementById("edit-index");
  const formError = document.getElementById("form-error");

  const fTitle = document.getElementById("f-title");
  const fStudio = document.getElementById("f-studio");
  const fFormat = document.getElementById("f-format");
  const fEpisodes = document.getElementById("f-episodes");
  const epChLabel = document.getElementById("ep-ch-label");
  const fSeason = document.getElementById("f-season");
  const fYear = document.getElementById("f-year");
  const fStatus = document.getElementById("f-status");
  const statusLabel = document.getElementById("status-label");
  const fRating = document.getElementById("f-rating");

  // Formats that use chapters instead of episodes
  const CHAPTER_FORMATS = new Set(["Web Novel", "Manhwa", "Manga", "Comics"]);

  // Status options per format type
  const STATUS_OPTIONS = {
    written: [
      { value: "Ongoing",   label: "Ongoing" },
      { value: "Completed", label: "Completed" },
      { value: "Hiatus",    label: "Hiatus" },
      { value: "Cancelled", label: "Cancelled" },
    ],
    movie: [
      { value: "Released",     label: "Released" },
      { value: "Unreleased",   label: "Upcoming" },
      { value: "In Production",label: "In Production" },
    ],
    tvshow: [
      { value: "Ongoing",          label: "Ongoing" },
      { value: "Completed",        label: "Completed" },
      { value: "New Season",       label: "New Season Incoming" },
      { value: "Cancelled",        label: "Cancelled" },
      { value: "Hiatus",           label: "On Hiatus" },
    ],
  };

  function getFormatCategory(fmt) {
    if (fmt === "Movie") return "movie";
    if (fmt === "TV Show") return "tvshow";
    return "written"; // Web Novel, Manhwa, Manga, Comics
  }

  function updateEpChField(preserveStatus) {
    const fmt = fFormat.value;
    const category = getFormatCategory(fmt);

    // Label for episodes/chapters field
    if (CHAPTER_FORMATS.has(fmt)) {
      epChLabel.textContent = "Chapters";
      fEpisodes.placeholder = "e.g. 120 ch";
    } else {
      epChLabel.textContent = fmt === "Movie" ? "Duration" : "Episodes";
      fEpisodes.placeholder = fmt === "Movie" ? "e.g. 120 min" : "e.g. 24 ep";
    }

    // Status label
    if (statusLabel) {
      statusLabel.textContent = "Status";
    }

    // Rebuild status options
    const currentVal = preserveStatus ? fStatus.value : null;
    fStatus.innerHTML = "";
    STATUS_OPTIONS[category].forEach(({ value, label }) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      fStatus.appendChild(opt);
    });

    // Restore previous value if it still exists in new options, else pick first
    if (currentVal && [...fStatus.options].some(o => o.value === currentVal)) {
      fStatus.value = currentVal;
    } else {
      fStatus.selectedIndex = 0;
    }
  }

  fFormat.addEventListener("change", () => updateEpChField(false));
  updateEpChField(false);
  const fCoverFile = document.getElementById("f-cover-file");
  const fChapterLink = document.getElementById("f-chapter-link");
  const fDesc = document.getElementById("f-desc");
  const coverPreview = document.getElementById("cover-preview");
  const coverClearBtn = document.getElementById("cover-clear-btn");

  // ── State ─────────────────────────────────────────────────────────────────
  let selectedGenres = new Set();
  let formGenres = new Set();
  let sortAsc = false;
  let userView = "grid";
  let forcedView = false;
  let coverDataUrl = ""; // holds base64 from file upload

  // ── View ──────────────────────────────────────────────────────────────────
  function setView(v) {
    cardGrid.className = `card-grid ${v}-view`;
    vmBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  }

  vmBtns.forEach((b) => {
    b.addEventListener("click", () => {
      userView = b.dataset.view;
      forcedView = false;
      setView(userView);
    });
  });

  function enforceResponsive() {
    const w = window.innerWidth;
    if (w <= 500) {
      if (!cardGrid.classList.contains("grid-view")) {
        setView("grid");
        forcedView = true;
      }
    } else if (w <= 1100) {
      if (!cardGrid.classList.contains("detailed-view")) {
        setView("detailed");
        forcedView = true;
      }
    } else if (forcedView) {
      setView(userView);
      forcedView = false;
    }
  }
  enforceResponsive();
  window.addEventListener("resize", enforceResponsive);

  // ── Sort ──────────────────────────────────────────────────────────────────
  sortBtn.addEventListener("click", () => {
    sortAsc = !sortAsc;
    sortBtn.classList.toggle("asc", sortAsc);
    sortIcon.className = sortAsc
      ? "fa-solid fa-arrow-up-wide-short"
      : "fa-solid fa-arrow-down-wide-short";
    sortCards();
  });

  function getRating(card) {
    const el = card.querySelector(".card-rating");
    if (!el) return 0;
    const m = el.textContent.match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }

  function sortCards() {
    const cards = Array.from(cardGrid.querySelectorAll(".anime-card"));
    cards.sort((a, b) =>
      sortAsc ? getRating(a) - getRating(b) : getRating(b) - getRating(a),
    );
    cards.forEach((c) => cardGrid.appendChild(c));
  }

  // ── Genre interactions (called after buttons are built) ───────────────────
  function initGenreInteractions() {
    const genreOpts = document.querySelectorAll(".genre-opt");

    genreOpts.forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const g = opt.dataset.genre;
        if (selectedGenres.has(g)) {
          selectedGenres.delete(g);
          opt.classList.remove("active");
        } else {
          selectedGenres.add(g);
          opt.classList.add("active");
        }
        renderGenrePills();
        renderActivePills();
        filterCards();
      });
    });

    const formGenreOpts = document.querySelectorAll(".form-genre-opt");
    formGenreOpts.forEach((opt) => {
      opt.addEventListener("click", () => {
        const g = opt.dataset.genre;
        if (formGenres.has(g)) {
          formGenres.delete(g);
          opt.classList.remove("active");
        } else {
          formGenres.add(g);
          opt.classList.add("active");
        }
      });
    });
  }

  // ── Genre dropdown toggle ─────────────────────────────────────────────────
  genreControl.addEventListener("click", (e) => {
    e.stopPropagation();
    genreControl.classList.toggle("open");
    genreDropdown.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    genreControl.classList.remove("open");
    genreDropdown.classList.remove("open");
  });

  function renderGenrePills() {
    genreSelected.innerHTML = "";
    if (selectedGenres.size === 0) {
      genreSelected.innerHTML = '<span class="genre-placeholder">Any</span>';
      return;
    }
    selectedGenres.forEach((g) => {
      const pill = document.createElement("span");
      pill.className = "genre-pill";
      pill.innerHTML = `${g} <i class="fa-solid fa-xmark genre-pill-x"></i>`;
      pill.querySelector(".genre-pill-x").addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectedGenres.delete(g);
        document
          .querySelector(`.genre-opt[data-genre="${g}"]`)
          ?.classList.remove("active");
        renderGenrePills();
        renderActivePills();
        filterCards();
      });
      genreSelected.appendChild(pill);
    });
  }

  // ── Active pills ──────────────────────────────────────────────────────────
  function getActiveFilters() {
    const out = [];
    if (searchInput.value.trim())
      out.push({ key: "search", label: `"${searchInput.value.trim()}"` });
    if (yearSelect.value) out.push({ key: "year", label: yearSelect.value });
    if (seasonSelect.value)
      out.push({ key: "season", label: seasonSelect.value });
    if (formatSelect.value)
      out.push({ key: "format", label: formatSelect.value });
    if (statusSelect.value)
      out.push({ key: "status", label: statusSelect.value });
    selectedGenres.forEach((g) =>
      out.push({ key: `g:${g}`, label: g, genre: g }),
    );
    return out;
  }

  function renderActivePills() {
    activeTagsEl.innerHTML = "";
    const filters = getActiveFilters();
    if (filters.length > 0) {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-tag tag-icon";
      activeTagsEl.appendChild(icon);
    }
    filters.forEach(({ key, label, genre }) => {
      const pill = document.createElement("span");
      pill.className = "active-pill";
      pill.innerHTML = `${label} <i class="fa-solid fa-xmark pill-x"></i>`;
      pill.querySelector(".pill-x").addEventListener("click", () => {
        if (genre) {
          selectedGenres.delete(genre);
          document
            .querySelector(`.genre-opt[data-genre="${genre}"]`)
            ?.classList.remove("active");
          renderGenrePills();
        } else if (key === "search") searchInput.value = "";
        else if (key === "year") yearSelect.value = "";
        else if (key === "season") seasonSelect.value = "";
        else if (key === "format") formatSelect.value = "";
        else if (key === "status") statusSelect.value = "";
        renderActivePills();
        filterCards();
      });
      activeTagsEl.appendChild(pill);
    });
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  function getAllCards() {
    return Array.from(cardGrid.querySelectorAll(".anime-card"));
  }

  function filterCards() {
    const q = searchInput.value.trim().toLowerCase();
    const year = yearSelect.value;
    const season = seasonSelect.value;
    const format = formatSelect.value;
    const status = statusSelect.value;
    let visible = 0;
    const all = getAllCards();

    all.forEach((card) => {
      const title =
        card.querySelector(".card-title")?.textContent.toLowerCase() || "";
      const studio =
        card.querySelector(".card-studio")?.textContent.toLowerCase() || "";
      const genres = card.dataset.genres || "";
      const show =
        (!q || title.includes(q) || studio.includes(q)) &&
        (!year || card.dataset.year === year) &&
        (!season || card.dataset.season === season) &&
        (!format || card.dataset.format === format) &&
        (!status || card.dataset.status === status) &&
        (selectedGenres.size === 0 ||
          [...selectedGenres].every((g) => genres.includes(g)));
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });

    emptyState.style.display = visible === 0 ? "flex" : "none";
    cardGrid.style.display = visible === 0 ? "none" : "";

    if (resultsCount) {
      const total = all.length;
      const hasFilter = getActiveFilters().length > 0;
      resultsCount.innerHTML = hasFilter
        ? `<span>${visible}</span> of ${total} titles`
        : `<span>${total}</span> titles`;
    }
  }

  [searchInput, yearSelect, seasonSelect, formatSelect, statusSelect].forEach(
    (el) => {
      el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
        renderActivePills();
        filterCards();
      });
    },
  );

  if (btnClearAll) {
    btnClearAll.addEventListener("click", () => {
      searchInput.value = "";
      yearSelect.value =
        seasonSelect.value =
        formatSelect.value =
        statusSelect.value =
          "";
      selectedGenres.clear();
      document
        .querySelectorAll(".genre-opt")
        .forEach((o) => o.classList.remove("active"));
      renderGenrePills();
      renderActivePills();
      filterCards();
    });
  }

  filterCards();

  // ── Cover preview helpers ─────────────────────────────────────────────────
  function setCoverPreview(src) {
    if (src) {
      coverPreview.innerHTML = `<img src="${src}" alt="cover preview" />`;
      coverPreview.classList.add("has-image");
      coverClearBtn.style.display = "inline-flex";
    } else {
      coverPreview.innerHTML = `<i class="fa-solid fa-image cover-preview-icon"></i><span class="cover-preview-hint">No image</span>`;
      coverPreview.classList.remove("has-image");
      coverClearBtn.style.display = "none";
    }
  }

  // File upload → base64
  fCoverFile.addEventListener("change", () => {
    const file = fCoverFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      coverDataUrl = e.target.result;
      setCoverPreview(coverDataUrl);
    };
    reader.readAsDataURL(file);
  });

  // Clear button
  coverClearBtn.addEventListener("click", () => {
    coverDataUrl = "";
    fCoverFile.value = "";
    setCoverPreview("");
  });

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openModal(editCard = null) {
    clearForm();
    if (editCard) {
      modalTitle.textContent = "Edit Media";
      editIndexEl.value = editCard.dataset.cardId || "";
      fTitle.value =
        editCard.querySelector(".card-title")?.textContent.trim() || "";
      fStudio.value =
        editCard.querySelector(".card-studio")?.textContent.trim() || "";
      fDesc.value =
        editCard.querySelector(".card-desc")?.textContent.trim() || "";
      fYear.value = editCard.dataset.year || "";
      fSeason.value = editCard.dataset.season || "";
      fFormat.value = editCard.dataset.format || "TV Show";
      updateEpChField(true);
      fStatus.value = editCard.dataset.status || fStatus.options[0]?.value || "";
      fChapterLink.value = editCard.dataset.chapterLink || "";
      const rMatch = (
        editCard.querySelector(".card-rating")?.textContent || ""
      ).match(/(\d+)/);
      fRating.value = rMatch ? rMatch[1] : "";
      const epBadge =
        editCard.querySelector(".badge--format")?.textContent || "";
      fEpisodes.value = epBadge
        .replace(/^(TV|OVA|ONA|Movie|Special)\s*·?\s*/i, "")
        .trim();

      const imgEl = editCard.querySelector(".card-poster img");
      const existingSrc = imgEl?.src || "";
      if (existingSrc && !existingSrc.includes("/assets/")) {
        coverDataUrl = existingSrc;
        setCoverPreview(coverDataUrl);
      }

      const genreList = (editCard.dataset.genres || "")
        .split(",")
        .filter(Boolean);
      genreList.forEach((g) => {
        formGenres.add(g.trim());
        document
          .querySelector(`.form-genre-opt[data-genre="${g.trim()}"]`)
          ?.classList.add("active");
      });
    } else {
      modalTitle.textContent = "Add Media";
      editIndexEl.value = "";
    }
    modalOverlay.classList.add("open");
    setTimeout(() => fTitle.focus(), 100);
  }

  function closeModal() {
    modalOverlay.classList.remove("open");
    clearForm();
  }

  function clearForm() {
    fTitle.value =
      fStudio.value =
      fEpisodes.value =
      fChapterLink.value =
        "";
    fYear.value = fRating.value = "";
    fDesc.value = "";
    fFormat.value = "TV Show";
    updateEpChField(false);
    fSeason.value = "";
    fStatus.value = "Ongoing";
    editIndexEl.value = "";
    coverDataUrl = "";
    fCoverFile.value = "";
    setCoverPreview("");
    formGenres.clear();
    document
      .querySelectorAll(".form-genre-opt")
      .forEach((o) => o.classList.remove("active"));
    formError.style.display = "none";
    formError.textContent = "";
  }

  btnAdd.addEventListener("click", () => openModal());
  modalClose.addEventListener("click", closeModal);
  btnCancel.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("open"))
      closeModal();
  });

  btnSave.addEventListener("click", saveCard);

  function saveCard() {
    formError.style.display = "none";
    const title = fTitle.value.trim();
    if (!title) {
      formError.textContent = "Title is required.";
      formError.style.display = "block";
      fTitle.focus();
      return;
    }

    const editId = editIndexEl.value;
    const existing = editId
      ? cardGrid.querySelector(`[data-card-id="${editId}"]`)
      : null;
    const genres = [...formGenres];
    const season = fSeason.value;
    const year = fYear.value;
    const format = fFormat.value;
    const status = fStatus.value;
    const episodes = fEpisodes.value.trim();
    const rating = fRating.value ? parseInt(fRating.value) : null;
    const studio = fStudio.value.trim();
    const desc = fDesc.value.trim();
    const chapterLink = fChapterLink.value.trim();
    const cover = coverDataUrl;

    const seasonLabel = season && year ? `${season} ${year}` : year || "";
    const fmtShort = format === "TV Show" ? "TV" : format;
    const formatLabel = episodes ? `${fmtShort} · ${episodes}` : fmtShort;

    if (existing) {
      existing.dataset.genres = genres.join(",");
      existing.dataset.year = year;
      existing.dataset.season = season;
      existing.dataset.format = format;
      existing.dataset.status = status;
      existing.dataset.chapterLink = chapterLink;

      const set = (sel, val) => {
        const el = existing.querySelector(sel);
        if (el) el.textContent = val;
      };
      set(".card-title", title);
      set(".card-studio", studio);
      set(".card-desc", desc);
      if (rating !== null) {
        const rEl = existing.querySelector(".card-rating");
        if (rEl) rEl.innerHTML = `<i class="fa-solid fa-star"></i> ${rating}%`;
      }
      const sb = existing.querySelector(".badge--season");
      if (sb) sb.textContent = seasonLabel;
      const fb = existing.querySelector(".badge--format");
      if (fb) fb.textContent = formatLabel;
      const tb = existing.querySelector(".card-tags");
      if (tb)
        tb.innerHTML = genres
          .slice(0, 3)
          .map((g) => `<span>${g}</span>`)
          .join("");
      if (cover) {
        let img = existing.querySelector(".card-poster img");
        if (!img) {
          img = document.createElement("img");
          img.alt = title;
          img.onerror = function () {
            this.style.display = "none";
            this.nextElementSibling.style.display = "flex";
          };
          const fallback = existing.querySelector(".card-poster-fallback");
          existing.querySelector(".card-poster").insertBefore(img, fallback);
        }
        img.src = cover;
        img.style.display = "";
        const fallback = existing.querySelector(".card-poster-fallback");
        if (fallback) fallback.style.display = "none";
      }
      // Update chapter arrow
      updateChapterBtn(existing, chapterLink);
    } else {
      const id = "card-" + Date.now();
      const card = buildCard({
        id,
        title,
        studio,
        desc,
        genres,
        year,
        season,
        format,
        status,
        episodes,
        rating,
        cover,
        chapterLink,
        seasonLabel,
        formatLabel,
      });
      cardGrid.appendChild(card);
    }

    closeModal();
    filterCards();
  }

  // ── Build a new card ──────────────────────────────────────────────────────
  function buildCard({
    id,
    title,
    studio,
    desc,
    genres,
    year,
    season,
    format,
    status,
    episodes,
    rating,
    cover,
    chapterLink,
    seasonLabel,
    formatLabel,
  }) {
    const article = document.createElement("article");
    article.className = "anime-card";
    article.dataset.genres = genres.join(",");
    article.dataset.year = year;
    article.dataset.season = season;
    article.dataset.format = format;
    article.dataset.status = status;
    article.dataset.cardId = id;
    article.dataset.chapterLink = chapterLink || "";

    const ratingHTML =
      rating !== null
        ? `<div class="card-rating"><i class="fa-solid fa-star"></i> ${rating}%</div>`
        : "";
    const sBadge = seasonLabel
      ? `<span class="badge badge--season">${seasonLabel}</span>`
      : "";
    const fBadge = formatLabel
      ? `<span class="badge badge--format">${formatLabel}</span>`
      : "";
    const tagsHTML = genres
      .slice(0, 3)
      .map((g) => `<span>${g}</span>`)
      .join("");
    const imgHTML = cover
      ? `<img src="${cover}" alt="${title}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />`
      : "";
    const arrowAttrs = chapterLink
      ? `href="${chapterLink}" target="_blank" rel="noopener"`
      : `data-no-link`;

    article.innerHTML = `
      <div class="card-poster">
        ${imgHTML}
        <div class="card-poster-fallback" style="${cover ? "display:none" : "display:flex"}">
          <i class="fa-solid fa-torii-gate"></i>
          <span>${title}</span>
        </div>
        <div class="card-overlay">
          ${ratingHTML}
          <div class="card-badges">${sBadge}${fBadge}</div>
        </div>
        <button class="card-edit-btn" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <a class="card-chapter-btn" ${arrowAttrs} title="Continue watching / reading">
          <i class="fa-solid fa-arrow-right"></i>
        </a>
      </div>
      <div class="card-body">
        <h3 class="card-title">${title}</h3>
        <p class="card-studio">${studio}</p>
        <p class="card-desc">${desc}</p>
        <div class="card-tags">${tagsHTML}</div>
      </div>
    `;

    article.querySelector(".card-edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openModal(article);
    });

    const chapterBtn = article.querySelector(".card-chapter-btn");
    chapterBtn.addEventListener("click", (e) => e.stopPropagation());

    return article;
  }

  // ── Update chapter arrow on existing card ─────────────────────────────────
  function updateChapterBtn(card, link) {
    let btn = card.querySelector(".card-chapter-btn");
    if (!btn) {
      btn = document.createElement("a");
      btn.className = "card-chapter-btn";
      btn.title = "Continue watching / reading";
      btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
      btn.addEventListener("click", (e) => e.stopPropagation());
      card.querySelector(".card-poster").appendChild(btn);
    }
    if (link) {
      btn.href = link;
      btn.target = "_blank";
      btn.rel = "noopener";
      btn.removeAttribute("data-no-link");
    } else {
      btn.removeAttribute("href");
      btn.removeAttribute("target");
      btn.setAttribute("data-no-link", "");
    }
  }

  // ── Wire existing static cards ────────────────────────────────────────────
  document.querySelectorAll(".anime-card").forEach((card) => {
    card.dataset.cardId = "static-" + Math.random().toString(36).slice(2);
    card.dataset.chapterLink = "";

    const poster = card.querySelector(".card-poster");
    if (poster) {
      // Edit button
      if (!poster.querySelector(".card-edit-btn")) {
        const editBtn = document.createElement("button");
        editBtn.className = "card-edit-btn";
        editBtn.title = "Edit";
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openModal(card);
        });
        poster.appendChild(editBtn);
      }

      // Chapter arrow (hidden until a link is set)
      if (!poster.querySelector(".card-chapter-btn")) {
        const arrowBtn = document.createElement("a");
        arrowBtn.className = "card-chapter-btn";
        arrowBtn.title = "Continue watching / reading";
        arrowBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
        arrowBtn.setAttribute("data-no-link", "");
        arrowBtn.addEventListener("click", (e) => e.stopPropagation());
        poster.appendChild(arrowBtn);
      }
    }
  });

  // ── Library Toolbar: count, export, import ───────────────────────────────
  const libCountBadge = document.getElementById("lib-count-badge");
  const btnExportJson = document.getElementById("btn-export-json");
  const importJsonInput = document.getElementById("import-json-input");
  const libToast = document.getElementById("lib-toast");

  let toastTimer = null;
  function showToast(msg, type = "info", duration = 2800) {
    libToast.textContent = msg;
    libToast.className = `lib-toast show toast--${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      libToast.className = "lib-toast";
    }, duration);
  }

  function updateLibCount() {
    const total = cardGrid.querySelectorAll(".anime-card").length;
    libCountBadge.textContent = `${total} title${total !== 1 ? "s" : ""}`;
  }

  function cardToData(card) {
    const img = card.querySelector(".card-poster img");
    const src = img ? img.getAttribute("src") : "";
    const cover = src && !src.startsWith("/assets/") ? src : "";
    return {
      title: card.querySelector(".card-title")?.textContent.trim() || "",
      studio: card.querySelector(".card-studio")?.textContent.trim() || "",
      desc: card.querySelector(".card-desc")?.textContent.trim() || "",
      genres: (card.dataset.genres || "").split(",").filter(Boolean),
      year: card.dataset.year || "",
      season: card.dataset.season || "",
      format: card.dataset.format || "",
      status: card.dataset.status || "",
      chapterLink: card.dataset.chapterLink || "",
      rating: (() => {
        const m = (card.querySelector(".card-rating")?.textContent || "").match(
          /(\d+)/,
        );
        return m ? parseInt(m[1]) : null;
      })(),
      episodes: (() => {
        const b = card.querySelector(".badge--format")?.textContent || "";
        return b
          .replace(
            /^(TV|Movie|OVA|ONA|Special|Web Novel|Manhwa|Manga|Comics)\s*·?\s*/i,
            "",
          )
          .trim();
      })(),
      cover,
    };
  }

  // Export
  btnExportJson.addEventListener("click", () => {
    const cards = Array.from(cardGrid.querySelectorAll(".anime-card"));
    if (cards.length === 0) {
      showToast("No titles to export.", "error");
      return;
    }
    const data = cards.map(cardToData);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `media-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      `✓ Exported ${data.length} title${data.length !== 1 ? "s" : ""}`,
      "success",
    );
  });

  // Import
  importJsonInput.addEventListener("change", () => {
    const file = importJsonInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let entries;
      try {
        entries = JSON.parse(ev.target.result);
        if (!Array.isArray(entries)) throw new Error("Expected array");
      } catch {
        showToast("Invalid JSON — could not parse file.", "error");
        importJsonInput.value = "";
        return;
      }
      let added = 0;
      entries.forEach((d) => {
        if (!d.title) return;
        const seasonLabel =
          d.season && d.year ? `${d.season} ${d.year}` : d.year || "";
        const fmtShort = d.format === "TV Show" ? "TV" : d.format || "";
        const formatLabel = d.episodes
          ? `${fmtShort} · ${d.episodes}`
          : fmtShort;
        const id =
          "card-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        const card = buildCard({
          id,
          title: d.title || "",
          studio: d.studio || "",
          desc: d.desc || "",
          genres: Array.isArray(d.genres) ? d.genres : [],
          year: d.year || "",
          season: d.season || "",
          format: d.format || "TV Show",
          status: d.status || "Ongoing",
          chapterLink: d.chapterLink || "",
          rating: typeof d.rating === "number" ? d.rating : null,
          episodes: d.episodes || "",
          cover: d.cover || "",
          seasonLabel,
          formatLabel,
        });
        cardGrid.appendChild(card);
        added++;
      });
      filterCards();
      updateLibCount();
      showToast(
        `✓ Imported ${added} title${added !== 1 ? "s" : ""}`,
        "success",
      );
      importJsonInput.value = "";
    };
    reader.readAsText(file);
  });

  // Keep count live as cards are added/removed
  new MutationObserver(updateLibCount).observe(cardGrid, { childList: true });
  updateLibCount();

  // ── Unsaved-changes guard ─────────────────────────────────────────────────
  // Tracks whether the library has been modified since the last export.
  let hasUnsavedChanges = false;

  function markDirty() {
    hasUnsavedChanges = true;
  }
  function markClean() {
    hasUnsavedChanges = false;
  }

  // Any card added, edited, or removed = dirty
  new MutationObserver(() => markDirty()).observe(cardGrid, {
    childList: true,
    subtree: false,
  });

  // Patch saveCard to also mark dirty (covers in-place edits that don't add/remove nodes)
  btnSave.addEventListener("click", markDirty);

  // Mark clean after a successful export
  btnExportJson.addEventListener("click", () => {
    // The export listener fires first (defined earlier), so defer the clean mark
    // until after it runs so we don't clear prematurely on an empty-library bail-out.
    setTimeout(() => {
      if (cardGrid.querySelectorAll(".anime-card").length > 0) markClean();
    }, 0);
  });

  // Warn before reload / tab close only when there's unsaved data
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedChanges) return;
    // Modern browsers show their own generic message; setting returnValue triggers the dialog.
    e.preventDefault();
    e.returnValue = ""; // required for Chrome/Edge
  });
});
