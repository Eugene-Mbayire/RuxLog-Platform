// ==========================================================
// RuxLog Platform — Shared navigation bar
//
// Builds the top nav bar and injects it into #nav-placeholder.
// Every logged-in page includes it the same way:
//   <div id="nav-placeholder"></div>
//   <script src="js/nav.js"></script>
// then calls renderNav(profile) once the profile has loaded.
//
// Note: some links below point to pages that don't exist yet
// (petty-cash.html, working-hours.html, cars.html, first-aid.html,
// users.html) — they'll work once those pages are built next.
// ==========================================================

function renderNav(profile) {
  const navPlaceholder = document.getElementById("nav-placeholder");
  if (!navPlaceholder) return;

  const links = [
    { href: "dashboard.html", label: "Dashboard" },
    { href: "petty-cash.html", label: "Petty Cash" },
    { href: "working-hours.html", label: profile.role === "manager" ? "Worked Hours" : "Check IN" },
    { href: "cars.html", label: "Vehicles" },
    { href: "first-aid.html", label: "First-Aid-Kit" },
    { href: "schedule.html", label: "Schedule" },
  ];

  if (profile.role === "manager") {
    links.push({ href: "analytics.html", label: "Analytics" });
    links.push({ href: "users.html", label: "Users" });
  }

  const currentPage = window.location.pathname.split("/").pop();

  const linksHtml = links
    .map((link) => {
      const activeClass = link.href === currentPage ? " nav-link-active" : "";
      return `<a class="nav-link${activeClass}" href="${link.href}">${link.label}</a>`;
    })
    .join("");

  navPlaceholder.innerHTML = `
    <div class="topbar">
      <div class="topbar-row">
        <img src="assets/logo.png" alt="RuxLog" class="nav-logo" />
        <button type="button" id="nav-toggle" class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">☰</button>
      </div>
      <nav class="nav-links" id="nav-links">${linksHtml}</nav>
      <button id="logout-btn" class="btn btn-secondary">Logout</button>
    </div>
  `;

  document.getElementById("logout-btn").addEventListener("click", logout);

  // Hamburger toggle — only visible/used on phone-width screens (see CSS).
  // On desktop the nav links are always shown, so this button stays hidden.
  const toggleBtn = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");
  toggleBtn.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("nav-links-open");
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
  });
}
