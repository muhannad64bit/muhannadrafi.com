(() => {
"use strict";
const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const state = { activeDialog: null, lastTrigger: null, background: [] };
const focusableSelector = 'a[href], button:not([disabled]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function setupTheme() {
    const button = byId("themeToggle");
    const sync = () => button?.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
    sync();
    button?.addEventListener("click", () => {
        const theme = root.dataset.theme === "dark" ? "light" : "dark";
        root.dataset.theme = theme;
        sync();
        try { localStorage.setItem("theme", theme); } catch { /* Storage may be disabled. */ }
    });
    window.addEventListener("storage", (event) => {
        if (event.storageArea !== localStorage || (event.key !== "theme" && event.key !== null)) return;
        root.dataset.theme = event.newValue === "dark" ? "dark" : "light";
        sync();
    });
}

function setupNavigation() {
    const nav = byId("siteNav");
    const toggle = byId("navToggle");
    const menu = byId("siteNavMenu");
    const header = document.querySelector(".site-header");
    const mobile = matchMedia("(max-width: 699px)");
    const links = Array.from(document.querySelectorAll(".site-nav__link"));
    const sections = links.map((link) => byId(link.hash.slice(1))).filter(Boolean);
    const topButton = byId("scrollTop");
    const currentLabel = byId("navCurrent");
    let open = false;
    let scheduled = false;
    let activeId;
    let menuHadFocus = false;
    document.addEventListener("focusin", (event) => { menuHadFocus = Boolean(menu?.contains(event.target)); });
    root.classList.add("navigation-ready");
    const setOpen = (value) => {
        open = mobile.matches && value;
        nav?.classList.toggle("is-open", open);
        toggle?.setAttribute("aria-expanded", String(open));
        if (menu) {
            menu.inert = mobile.matches && !open;
            menu.setAttribute("aria-hidden", String(menu.inert));
        }
        root.style.setProperty("--header-offset", `${(header?.getBoundingClientRect().height || 0) + 16}px`);
    };
    setOpen(false);
    toggle?.addEventListener("click", () => setOpen(!open));
    mobile.addEventListener("change", () => {
        // CSS can hide the focused link before the media-query event runs.
        if (mobile.matches && menuHadFocus) toggle?.focus();
        setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && open) { setOpen(false); toggle?.focus(); }
    });
    document.addEventListener("click", (event) => {
        if (open && !nav.contains(event.target)) setOpen(false);
        const link = event.target.closest('a[href^="#"]');
        if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        let id;
        try { id = decodeURIComponent(link.hash.slice(1)); } catch { return; }
        const target = byId(id);
        if (!target) return;
        setOpen(false);
        // Keep native fragment URLs and browser history; transfer keyboard focus.
        if (!target.hasAttribute("tabindex")) {
            target.tabIndex = -1;
            target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
        }
        target.focus({ preventScroll: true });
    });
    const update = () => {
        scheduled = false;
        const offset = (header?.getBoundingClientRect().height || 0) + 16;
        root.style.setProperty("--header-offset", `${offset}px`);
        let active = sections[0];
        for (const section of sections) {
            if (section.getBoundingClientRect().top <= offset + 24) active = section;
        }
        if (active?.id !== activeId) {
            activeId = active?.id;
            for (const link of links) {
                const selected = link.hash === `#${activeId}`;
                link.classList.toggle("is-active", selected);
                if (selected) link.setAttribute("aria-current", "location");
                else link.removeAttribute("aria-current");
            }
        }
        if (currentLabel) currentLabel.textContent = links.find((link) => link.hash === `#${activeId}`)?.textContent || "About";
        nav?.classList.toggle("is-scrolled", scrollY > 12);
        topButton?.classList.toggle("is-visible", scrollY > 480);
    };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    if (header && "ResizeObserver" in window) new ResizeObserver(schedule).observe(header);
    topButton?.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: motion.matches ? "instant" : "smooth" });
        document.querySelector(".brand")?.focus({ preventScroll: true });
    });
    update();
}

function getFocusableElements(dialog) {
    return Array.from(dialog.querySelectorAll(focusableSelector))
        .filter((node) => node.getClientRects().length && !node.closest("[inert], [hidden]"));
}

function openDialog(dialog, trigger) {
    if (!dialog || state.activeDialog === dialog) return;
    if (state.activeDialog) closeDialog(state.activeDialog);
    state.lastTrigger = trigger || document.activeElement;
    state.activeDialog = dialog;
    dialog.classList.add("is-mounted", "is-active");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("dialog-open");
    const panel = dialog.querySelector('[role="dialog"]');
    if (panel) {
        panel.tabIndex = -1;
        panel.scrollTop = 0;
    }
    (getFocusableElements(dialog)[0] || panel)?.focus();
    state.background = Array.from(document.body.children)
        .filter((node) => node !== dialog && !node.inert);
    state.background.forEach((node) => { node.inert = true; });
}

function closeDialog(dialog) {
    if (!dialog || state.activeDialog !== dialog) return;
    state.background.forEach((node) => { node.inert = false; });
    state.background = [];
    document.body.classList.remove("dialog-open");
    state.activeDialog = null;
    state.lastTrigger?.focus({ preventScroll: true });
    dialog.classList.remove("is-active", "is-mounted");
    dialog.setAttribute("aria-hidden", "true");
    // Clear media so blob/object URLs are released and stale previews don't flash.
    dialog.querySelector(".dialog__media")?.replaceChildren();
    // Reset skills wrap so it doesn't remain hidden/stale on the next open.
    const skillsWrap = dialog.querySelector("#dialogSkillsWrap");
    if (skillsWrap) {
        skillsWrap.hidden = false;
        skillsWrap.querySelector("#dialogSkills")?.replaceChildren();
    }
    // Remove the programmatic tabIndex so the panel is no longer in the tab order.
    const panel = dialog.querySelector('[role="dialog"]');
    if (panel) panel.removeAttribute("tabindex");
}

function buildDialogMedia(mediaContainer, data) {
    mediaContainer.replaceChildren();
    if (!data.image) return;

    const link = document.createElement("a");
    link.href = data.image;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "document-link";
    link.textContent = "Open original in a new tab ↗";
    mediaContainer.appendChild(link);

    if (new URL(data.image, document.baseURI).pathname.toLowerCase().endsWith(".pdf")) {
        const frame = document.createElement("iframe");
        frame.src = data.image;
        frame.title = `${data.title} document preview`;
        frame.loading = "lazy";
        mediaContainer.appendChild(frame);
        return;
    }

    const status = document.createElement("p");
    status.className = "document-status";
    status.setAttribute("role", "status");
    status.textContent = "Loading document preview…";
    mediaContainer.appendChild(status);
    const image = document.createElement("img");
    image.alt = `${data.title} supporting visual`;
    image.decoding = "async";
    image.addEventListener("load", () => { status.remove(); }, { once: true });
    image.addEventListener("error", () => {
        status.textContent = "Preview unavailable. Use the link above to open the original file.";
        image.remove();
    }, { once: true });
    image.src = data.image;
    mediaContainer.appendChild(image);
}

function openContentDialog(trigger) {
    if (!trigger) return;
    const dialog = document.getElementById("contentDialog");
    const title = document.getElementById("dialogTitle");
    const institution = document.getElementById("dialogInstitution");
    const date = document.getElementById("dialogDate");
    const credential = document.getElementById("dialogCredential");
    const description = document.getElementById("dialogDescription");
    const media = document.getElementById("dialogMedia");
    const skillsWrap = document.getElementById("dialogSkillsWrap");
    const skills = document.getElementById("dialogSkills");

    const data = {
        title: trigger.dataset.modalTitle || "",
        institution: trigger.dataset.modalInstitution || "",
        date: trigger.dataset.modalDate || "",
        credential: trigger.dataset.modalCredential || "",
        description: trigger.dataset.modalDescription || "",
        image: trigger.dataset.modalImage || "",
        imageStyle: trigger.dataset.modalImageStyle || "",
        skills: ((trigger.dataset && trigger.dataset.modalSkills) || "")
            .split(",")
            .map((skill) => skill.trim())
            .filter(Boolean)
    };

    title.textContent = data.title;
    institution.textContent = data.institution;
    date.textContent = data.date;
    description.textContent = data.description;

    if (data.credential) {
        credential.hidden = false;
        credential.textContent = data.credential;
    } else {
        credential.hidden = true;
        credential.textContent = "";
    }

    buildDialogMedia(media, data);

    skills.replaceChildren();
    if (data.skills.length) {
        skillsWrap.hidden = false;
        data.skills.forEach((skill) => {
            const tag = document.createElement("span");
            tag.textContent = skill;
            skills.appendChild(tag);
        });
    } else {
        skillsWrap.hidden = true;
    }

    openDialog(dialog, trigger);
}


function setupDialogs() {
    document.querySelectorAll(".js-modal-trigger, #profileTrigger").forEach((trigger) => {
        trigger.setAttribute("aria-haspopup", "dialog");
        trigger.setAttribute("aria-controls", trigger.id === "profileTrigger" ? "imageDialog" : "contentDialog");
    });
    document.addEventListener("click", (event) => {
        const trigger = event.target.closest(".js-modal-trigger");
        if (trigger) return openContentDialog(trigger);
        if (event.target.closest("#profileTrigger")) {
            byId("imageDialogPreview").src = byId("profileImage").src;
            return openDialog(byId("imageDialog"), byId("profileTrigger"));
        }
        if (event.target.closest("[data-close-dialog], [data-close-image-dialog], .dialog__close")) {
            closeDialog(state.activeDialog);
        }
    });
    document.addEventListener("keydown", (event) => {
        const dialog = state.activeDialog;
        if (!dialog) return;
        if (event.key === "Escape") { event.preventDefault(); closeDialog(dialog); }
        if (event.key !== "Tab") return;
        const items = getFocusableElements(dialog);
        const first = items[0] || dialog.querySelector('[role="dialog"]');
        const last = items.at(-1) || first;
        if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
            event.preventDefault(); first.focus();
        }
    });
}

function setupFooter() {
    const formatter = new Intl.DateTimeFormat("en-US", {
        year: "numeric", month: "long", day: "numeric", hour: "numeric",
        minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh"
    });
    const update = () => {
        const now = new Date();
        const year = byId("currentYear");
        const time = byId("currentTime");
        if (year) year.textContent = formatter.formatToParts(now).find((part) => part.type === "year")?.value ?? String(now.getFullYear());
        if (time) time.textContent = `${formatter.format(now)} (Jeddah)`;
    };
    update();
    setInterval(() => { if (!document.hidden) update(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) update(); });
}

/* ── Scroll-reveal + skill-bar animation ─────────────────── */
function setupReveal() {
    if (!("IntersectionObserver" in window)) {
        // Fallback: make everything visible immediately
        document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
        animateAllSkillBars();
        return;
    }

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -48px 0px" });

    document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

    // Animate skill bars when the skills section comes into view
    const skillsSection = document.getElementById("skills");
    if (skillsSection) {
        const barObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                animateSkillBars(skillsSection);
                barObserver.unobserve(entry.target);
            });
        }, { threshold: 0.25 });
        barObserver.observe(skillsSection);
    }
}

function animateSkillBars(container) {
    if (motion.matches) {
        // No animation — set widths instantly
        container.querySelectorAll(".skills-bars__fill[data-percent]").forEach((fill) => {
            fill.style.width = `${fill.dataset.percent}%`;
        });
        return;
    }
    container.querySelectorAll(".skills-bars__fill[data-percent]").forEach((fill, i) => {
        setTimeout(() => {
            fill.style.width = `${fill.dataset.percent}%`;
        }, i * 80);
    });
}

function animateAllSkillBars() {
    document.querySelectorAll(".skills-bars__fill[data-percent]").forEach((fill) => {
        fill.style.width = `${fill.dataset.percent}%`;
    });
}

setupTheme();
setupNavigation();
setupDialogs();
setupFooter();
setupReveal();
})();
