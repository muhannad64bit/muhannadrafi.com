/**
 * Portfolio Main Script
 * Handles theme switching, navigation, dialogs, and animations
 * with accessibility and performance optimizations.
 */
(() => {
"use strict";

// ── Constants and State ─────────────────────────────────────────────────────
const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const state = { activeDialog: null, lastTrigger: null, background: [] };
const focusableSelector = 'a[href], button:not([disabled]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── Utility Functions ────────────────────────────────────────────────────────
/**
 * Safely set theme with localStorage fallback
 */
function safeSetTheme(theme) {
    try {
        localStorage.setItem("theme", theme);
        return true;
    } catch (error) {
        console.warn("[Theme] Storage not available:", error.message);
        return false;
    }
}

/**
 * Debounce function to optimize performance
 */
function debounce(func, wait = 100) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function for scroll/resize events
 */
function throttle(func, limit = 100) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => { inThrottle = false; }, limit);
        }
    };
}

// ── Theme Module ─────────────────────────────────────────────────────────────

function setupTheme() {
    const button = byId("themeToggle");
    if (!button) {
        console.warn("[Theme] Toggle button not found");
        return;
    }

    /**
     * Sync button state with current theme
     */
    const sync = () => button.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
    
    /**
     * Handle theme storage events
     */
    const handleStorageEvent = (event) => {
        if (event.storageArea !== localStorage || (event.key !== "theme" && event.key !== null)) return;
        root.dataset.theme = event.newValue === "dark" ? "dark" : "light";
        sync();
    };

    // Initialize
    sync();

    // Toggle theme
    button.addEventListener("click", () => {
        const theme = root.dataset.theme === "dark" ? "light" : "dark";
        root.dataset.theme = theme;
        sync();
        safeSetTheme(theme);
    });

    // Listen for storage changes from other tabs
    window.addEventListener("storage", handleStorageEvent);
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
    
    // Navigation state
    let open = false;
    let scheduled = false;
    let activeId;
    let menuHadFocus = false;

    // Early exit if essential elements are missing
    if (!nav || !header) {
        console.warn("[Navigation] Required elements not found");
        return;
    }

    // Track focus within menu
    document.addEventListener("focusin", (event) => { 
        menuHadFocus = Boolean(menu?.contains(event.target)); 
    });

    // Signal that navigation is ready
    root.classList.add("navigation-ready");

    /**
     * Update navigation state based on mobile viewport
     */
    const setOpen = (value) => {
        open = mobile.matches && value;
        nav.classList.toggle("is-open", open);
        toggle?.setAttribute("aria-expanded", String(open));
        if (menu) {
            menu.inert = mobile.matches && !open;
            menu.setAttribute("aria-hidden", String(menu.inert));
        }
        updateHeaderOffset();
    };

    /**
     * Update header offset CSS variable
     */
    const updateHeaderOffset = () => {
        const offset = (header?.getBoundingClientRect().height || 0) + 16;
        root.style.setProperty("--header-offset", `${offset}px`);
    };

    // Initialize navigation state
    setOpen(false);

    // Toggle navigation on button click
    toggle?.addEventListener("click", () => setOpen(!open));

    // Handle mobile breakpoint changes
    mobile.addEventListener("change", () => {
        // CSS can hide the focused link before the media-query event runs.
        if (mobile.matches && menuHadFocus) toggle?.focus();
        setOpen(false);
    });

    // Close navigation with Escape key
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && open) { 
            setOpen(false); 
            toggle?.focus(); 
        }
    });

    // Strip any initial hash on page load to keep URL clean
    if (window.location.hash) {
        try {
            history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (_) {}
    }

    // Strip hash if external events trigger hashchange
    window.addEventListener("hashchange", () => {
        if (window.location.hash) {
            try {
                history.replaceState(null, "", window.location.pathname + window.location.search);
            } catch (_) {}
        }
    });

    // Handle navigation link clicks and outside clicks
    document.addEventListener("click", (event) => {
        if (open && !nav.contains(event.target)) setOpen(false);
        
        // Handle in-page hash links (e.g. href="#about", href="#education", etc.)
        const link = event.target.closest('a[href^="#"]');
        if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        
        let id;
        try { 
            id = decodeURIComponent(link.hash.slice(1)); 
        } catch {
            console.warn("[Navigation] Invalid fragment URI");
            event.preventDefault();
            return; 
        }
        
        const target = byId(id);
        if (!target) return;
        
        // Prevent default browser URL modification / hash change
        event.preventDefault();
        
        setOpen(false);
        
        // Calculate offset position accounting for sticky header
        const headerOffset = (header?.getBoundingClientRect().height || 0) + 16;
        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = Math.max(0, targetTop - headerOffset);
        
        // Smoothly scroll programmatically without touching browser URL or history
        window.scrollTo({
            top: offsetPosition,
            behavior: motion.matches ? "instant" : "smooth"
        });
        
        // Ensure URL stays strictly without hash
        if (window.location.hash) {
            try {
                history.replaceState(null, "", window.location.pathname + window.location.search);
            } catch (_) {}
        }
        
        // Keep keyboard navigation and accessibility working properly
        if (!target.hasAttribute("tabindex")) {
            target.tabIndex = -1;
            target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
        }
        target.focus({ preventScroll: true });
    });

    /**
     * Update active section highlighting and visibility states
     */
    const update = () => {
        scheduled = false;
        updateHeaderOffset();
        
        let active = sections[0];
        for (const section of sections) {
            if (section.getBoundingClientRect().top <= (header?.getBoundingClientRect().height || 0) + 16 + 24) {
                active = section;
            }
        }
        
        // Update active section highlighting
        if (active?.id !== activeId) {
            activeId = active?.id;
            for (const link of links) {
                const selected = link.hash === `#${activeId}`;
                link.classList.toggle("is-active", selected);
                if (selected) link.setAttribute("aria-current", "location");
                else link.removeAttribute("aria-current");
            }
        }
        
        // Update current section label
        if (currentLabel) {
            currentLabel.textContent = links.find((link) => link.hash === `#${activeId}`)?.textContent || "About";
        }
        
        // Update navigation appearance based on scroll position
        if (nav) {
            nav.classList.toggle("is-scrolled", scrollY > 12);
        }
        
        // Show/hide scroll to top button
        if (topButton) {
            topButton.classList.toggle("is-visible", scrollY > 480);
        }
    };

    // Throttled schedule function to prevent excessive updates
    const schedule = throttle(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(update);
    }, 50);

    // Set up event listeners
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    
    // Use ResizeObserver for header if available
    if (header && "ResizeObserver" in window) {
        new ResizeObserver(schedule).observe(header);
    }

    // Scroll to top functionality
    topButton?.addEventListener("click", () => {
        window.scrollTo({ 
            top: 0, 
            behavior: motion.matches ? "instant" : "smooth" 
        });
        document.querySelector(".brand")?.focus({ preventScroll: true });
    });

    // Initial update
    update();
}

// ── Dialog Module ─────────────────────────────────────────────────────────

/**
 * Get all focusable elements within a dialog
 */
function getFocusableElements(dialog) {
    if (!dialog) return [];
    
    return Array.from(dialog.querySelectorAll(focusableSelector))
        .filter((node) => node.getClientRects().length && !node.closest("[inert], [hidden]"));
}

/**
 * Open a dialog and set up accessibility features
 */
function openDialog(dialog, trigger) {
    if (!dialog || state.activeDialog === dialog) return;
    
    // Close any currently open dialog
    if (state.activeDialog) closeDialog(state.activeDialog);
    
    // Store the trigger element for focus restoration
    state.lastTrigger = trigger || document.activeElement;
    state.activeDialog = dialog;
    
    // Show dialog and set accessibility attributes
    dialog.classList.add("is-mounted", "is-active");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("dialog-open");
    
    // Set up panel for focus management
    const panel = dialog.querySelector('[role="dialog"]');
    if (panel) {
        panel.tabIndex = -1;
        panel.scrollTop = 0;
    }
    
    // Store and inert background elements
    state.background = Array.from(document.body.children)
        .filter((node) => node !== dialog && !node.inert);
    state.background.forEach((node) => { node.inert = true; });
    
    // Focus the first focusable element or the panel
    const focusableElements = getFocusableElements(dialog);
    (focusableElements[0] || panel)?.focus();
}

/**
 * Close a dialog and restore focus to trigger
 */
function closeDialog(dialog) {
    if (!dialog || state.activeDialog !== dialog) return;
    
    // Restore background interactivity
    state.background.forEach((node) => { node.inert = false; });
    state.background = [];
    
    // Clean up dialog state
    document.body.classList.remove("dialog-open");
    state.activeDialog = null;
    
    // Restore focus to the trigger element
    state.lastTrigger?.focus({ preventScroll: true });
    
    // Hide dialog
    dialog.classList.remove("is-active", "is-mounted");
    dialog.setAttribute("aria-hidden", "true");
    
    // Clear media to release blob/object URLs and prevent stale previews
    dialog.querySelector(".dialog__media")?.replaceChildren();
    
    // Reset skills wrap so it doesn't remain hidden/stale on the next open
    const skillsWrap = dialog.querySelector("#dialogSkillsWrap");
    if (skillsWrap) {
        skillsWrap.hidden = false;
        skillsWrap.querySelector("#dialogSkills")?.replaceChildren();
    }
    
    // Remove programmatic tabIndex so the panel is no longer in the tab order
    const panel = dialog.querySelector('[role="dialog"]');
    if (panel) panel.removeAttribute("tabindex");
}

/**
 * Build and display media content in dialog
 */
function buildDialogMedia(mediaContainer, data) {
    if (!mediaContainer || !data) {
        console.warn("[Media] Invalid media container or data");
        return;
    }
    
    mediaContainer.replaceChildren();
    if (!data.image) return;

    try {
        // Create download/links
        const link = document.createElement("a");
        link.href = data.image;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "document-link";
        link.textContent = "Open original in a new tab ↗";
        mediaContainer.appendChild(link);

        // Handle PDF files
        const url = new URL(data.image, document.baseURI);
        if (url.pathname.toLowerCase().endsWith(".pdf")) {
            const frame = document.createElement("iframe");
            frame.src = data.image;
            frame.title = `${data.title || 'Document'} preview`;
            frame.loading = "lazy";
            frame.ariaLabel = `PDF preview of ${data.title || 'document'}`;
            mediaContainer.appendChild(frame);
            return;
        }

        // Handle image files
        const status = document.createElement("p");
        status.className = "document-status";
        status.setAttribute("role", "status");
        status.textContent = "Loading document preview…";
        mediaContainer.appendChild(status);
        
        const image = document.createElement("img");
        image.alt = `${data.title || 'Document'} supporting visual`;
        image.decoding = "async";
        image.loading = "lazy";
        
        // Set up event listeners with error handling
        image.addEventListener("load", () => { 
            status.remove(); 
        }, { once: true });
        
        image.addEventListener("error", () => {
            console.warn("[Media] Failed to load image:", data.image);
            status.textContent = "Preview unavailable. Use the link above to open the original file.";
            image.remove();
        }, { once: true });
        
        image.src = data.image;
        mediaContainer.appendChild(image);
        
    } catch (error) {
        console.error("[Media] Error building media content:", error);
        mediaContainer.replaceChildren();
        const errorMsg = document.createElement("p");
        errorMsg.className = "document-status";
        errorMsg.textContent = "Unable to display preview.";
        mediaContainer.appendChild(errorMsg);
    }
}

/**
 * Prepare and open content dialog with modal data
 */
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

    // Early exit if dialog is not available
    if (!dialog) {
        console.error("[Dialog] Content dialog not found");
        return;
    }

    // Extract modal data from trigger element
    const getDataset = (key, defaultValue = "") => {
        return (trigger.dataset[`modal${key.charAt(0).toUpperCase() + key.slice(1)}`] || defaultValue);
    };

    const data = {
        title: getDataset("title"),
        institution: getDataset("institution"),
        date: getDataset("date"),
        credential: getDataset("credential"),
        description: getDataset("description"),
        image: getDataset("image"),
        imageStyle: getDataset("imageStyle"),
        skills: (getDataset("skills", ""))
            .split(",")
            .map((skill) => skill.trim())
            .filter(Boolean)
    };

    // Update dialog content safely
    title.textContent = data.title;
    institution.textContent = data.institution;
    date.textContent = data.date;
    description.textContent = data.description;

    // Handle credential visibility
    if (data.credential && credential) {
        credential.hidden = false;
        credential.textContent = data.credential;
    } else if (credential) {
        credential.hidden = true;
        credential.textContent = "";
    }

    // Build and display media content
    buildDialogMedia(media, data);

    // Update skills section
    if (skills) {
        skills.replaceChildren();
        if (data.skills.length && skillsWrap) {
            skillsWrap.hidden = false;
            data.skills.forEach((skill) => {
                const tag = document.createElement("span");
                tag.textContent = skill;
                skills.appendChild(tag);
            });
        } else if (skillsWrap) {
            skillsWrap.hidden = true;
        }
    }

    // Open the dialog
    openDialog(dialog, trigger);
}

// ── Dialog Setup Module ──────────────────────────────────────────────────────

function setupDialogs() {
    // Initialize modal triggers with proper ARIA attributes
    document.querySelectorAll(".js-modal-trigger, #profileTrigger").forEach((trigger) => {
        trigger.setAttribute("aria-haspopup", "dialog");
        trigger.setAttribute("aria-controls", trigger.id === "profileTrigger" ? "imageDialog" : "contentDialog");
    });

    // Handle click events for dialog management
    document.addEventListener("click", (event) => {
        // Open content dialog when modal trigger is clicked
        const trigger = event.target.closest(".js-modal-trigger");
        if (trigger) {
            event.preventDefault();
            openContentDialog(trigger);
            return;
        }
        
        // Open profile image dialog
        if (event.target.closest("#profileTrigger")) {
            const imageDialog = byId("imageDialog");
            const profileImage = byId("profileImage");
            const preview = byId("imageDialogPreview");
            
            if (imageDialog && profileImage && preview) {
                preview.src = profileImage.src;
                preview.alt = profileImage.alt || "Profile image";
                openDialog(imageDialog, byId("profileTrigger"));
            }
            return;
        }
        
        // Close dialog when close button or background is clicked
        if (event.target.closest("[data-close-dialog], [data-close-image-dialog], .dialog__close")) {
            closeDialog(state.activeDialog);
        }
    });

    // Handle keyboard navigation for dialogs
    document.addEventListener("keydown", (event) => {
        const dialog = state.activeDialog;
        if (!dialog) return;
        
        // Close dialog with Escape key
        if (event.key === "Escape") {
            event.preventDefault();
            closeDialog(dialog);
        }
        
        // Trap focus within dialog using Tab key
        if (event.key !== "Tab") return;
        
        const items = getFocusableElements(dialog);
        const first = items[0] || dialog.querySelector('[role="dialog"]');
        const last = items.at(-1) || first;
        
        // Shift+Tab: if at first item, wrap to last
        if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
            event.preventDefault();
            last.focus();
        }
        // Tab: if at last item, wrap to first
        else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    });
}

// ── Footer Module ───────────────────────────────────────────────────────────

/**
 * Set up dynamic footer with date/time display
 */
function setupFooter() {
    const timeZone = "Asia/Riyadh";
    const formatter = new Intl.DateTimeFormat("en-US", {
        year: "numeric", 
        month: "long", 
        day: "numeric", 
        hour: "numeric",
        minute: "2-digit", 
        hour12: true, 
        timeZone: timeZone
    });

    // Cache DOM elements
    const yearElement = byId("currentYear");
    const timeElement = byId("currentTime");
    
    // Skip if footer elements are not available
    if (!yearElement && !timeElement) {
        console.warn("[Footer] No date/time elements found");
        return;
    }

    /**
     * Update date and time display
     */
    const update = () => {
        const now = new Date();
        
        // Update year if element exists
        if (yearElement) {
            const parts = formatter.formatToParts(now);
            const yearPart = parts.find((part) => part.type === "year");
            yearElement.textContent = yearPart?.value ?? String(now.getFullYear());
        }
        
        // Update time if element exists
        if (timeElement) {
            timeElement.textContent = `${formatter.format(now)} (Jeddah)`;
        }
    };

    // Initial update
    update();

    // Update every minute, but only when tab is visible
    const updateInterval = 60000; // 1 minute
    const intervalId = setInterval(() => {
        if (!document.hidden) update();
    }, updateInterval);

    // Update when tab becomes visible again
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) update();
    });

    // Clean up interval on pagehide (for SPA navigation)
    window.addEventListener("pagehide", () => {
        clearInterval(intervalId);
    });
}

// ── Scroll Reveal & Animation Module ──────────────────────────────────────

/**
 * Animate all skill bars immediately
 */
function animateAllSkillBars() {
    document.querySelectorAll(".skills-bars__fill[data-percent]").forEach((fill) => {
        fill.style.width = `${fill.dataset.percent}%`;
    });
}

/**
 * Animate skill bars with staggered delays
 */
function animateSkillBars(container) {
    if (!container) return;
    
    if (motion.matches) {
        // No animation for reduced motion preference — set widths instantly
        animateAllSkillBars();
        return;
    }
    
    // Animate each bar with staggered delay for visual appeal
    container.querySelectorAll(".skills-bars__fill[data-percent]").forEach((fill, i) => {
        setTimeout(() => {
            fill.style.width = `${fill.dataset.percent}%`;
        }, i * 80);
    });
}

/**
 * Set up scroll reveal animations with IntersectionObserver
 */
function setupReveal() {
    // Handle reduced motion preference
    if (motion.matches) {
        animateAllSkillBars();
        return;
    }

    // Fallback for browsers without IntersectionObserver
    if (!("IntersectionObserver" in window)) {
        console.warn("[Reveal] IntersectionObserver not supported, falling back to immediate visibility");
        document.querySelectorAll(".reveal").forEach((el) => {
            el.classList.add("is-visible");
        });
        animateAllSkillBars();
        return;
    }

    // Set up reveal observer for elements with .reveal class
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            
            // Show element and clean up observer
            entry.target.classList.remove("reveal-pending");
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
        });
    }, { 
        threshold: 0.1, 
        rootMargin: "0px 0px -48px 0px" 
    });

    // Initialize reveal observation for all reveal elements
    document.querySelectorAll(".reveal").forEach((el) => {
        el.classList.add("reveal-pending");
        revealObserver.observe(el);
    });

    // Set up special observer for skills section to trigger bar animations
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

// ── Initialization ─────────────────────────────────────────────────────────

/**
 * Initialize all modules when DOM is ready
 */
function initialize() {
    try {
        console.log("[Portfolio] Initializing modules...");
        
        setupTheme();
        console.log("[Portfolio] Theme module initialized");
        
        setupNavigation();
        console.log("[Portfolio] Navigation module initialized");
        
        setupDialogs();
        console.log("[Portfolio] Dialogs module initialized");
        
        setupFooter();
        console.log("[Portfolio] Footer module initialized");
        
        setupReveal();
        console.log("[Portfolio] Reveal animations initialized");
        
        console.log("[Portfolio] All modules initialized successfully");
        
    } catch (error) {
        console.error("[Portfolio] Initialization error:", error);
        // Continue with basic functionality even if some modules fail
    }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}

// Export for testing if needed
if (typeof module !== "undefined" && module.exports) {
    module.exports = { setupTheme, setupNavigation, setupDialogs, setupFooter, setupReveal };
}

})();
