// ==========================================================
// RuxLog Platform — Pagination helper
//
// Renders "Previous  Page X of Y  Next" controls and slices an
// already-fetched array of rows into pages of 10. Reused by every
// page with a table that might exceed 10 records (spec section 14).
// Data sets here are small (family-business scale), so fetching
// everything once and paginating in the browser is simpler than
// server-side range queries, and plenty fast enough.
// ==========================================================

const ROWS_PER_PAGE = 10;

// allRows: full array of data
// controlsEl: element to render the Previous/Page/Next controls into
// renderRows(pageRows): called with just the current page's rows
function createPaginator(allRows, controlsEl, renderRows) {
  let currentPage = 1;
  const totalPages = Math.max(1, Math.ceil(allRows.length / ROWS_PER_PAGE));

  function showPage(page) {
    currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    renderRows(allRows.slice(start, start + ROWS_PER_PAGE));
    renderControls();
  }

  function renderControls() {
    if (allRows.length <= ROWS_PER_PAGE) {
      controlsEl.innerHTML = "";
      return;
    }
    controlsEl.innerHTML = `
      <button type="button" class="btn-page" id="prev-page" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button type="button" class="btn-page" id="next-page" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
    `;
    document.getElementById("prev-page")?.addEventListener("click", () => showPage(currentPage - 1));
    document.getElementById("next-page")?.addEventListener("click", () => showPage(currentPage + 1));
  }

  showPage(1);
}
