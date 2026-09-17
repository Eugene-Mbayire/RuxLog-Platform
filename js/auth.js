// ==========================================================
// RuxLog Platform — Authentication
//
// Reusable login/logout/session helpers used by every page.
// Note: the redirects here are a UX convenience, not the real
// security boundary — Row Level Security on the database is
// what actually stops a driver from doing manager-only things,
// even if someone bypasses this JS entirely.
// ==========================================================

// Log in with email + password.
// Returns { success: true } or { success: false, message }.
async function login(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    return { success: false, message: error.message };
  }

  // Best-effort: user_id and the timestamp are set server-side by a
  // trigger regardless of what's sent (see supabase/admin_role.sql).
  // A failure here should never block an otherwise-successful login.
  supabaseClient
    .from("login_logs")
    .insert({ event_type: "login" })
    .then(({ error: logError }) => {
      if (logError) console.warn("Could not record login log:", logError.message);
    });

  return { success: true };
}

// Log the current user out and send them back to the login page.
async function logout() {
  // Must happen before signOut() — once signed out, auth.uid() is no
  // longer available for the log row's RLS check.
  const { error: logError } = await supabaseClient.from("login_logs").insert({ event_type: "logout" });
  if (logError) console.warn("Could not record logout log:", logError.message);

  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// Get the logged-in user's profile (full_name, role, photo_path).
// Returns null if nobody is currently logged in.
//
// Uses getUser() rather than getSession(): getSession() only reads
// whatever is cached in local storage, which can be stale (e.g. right
// after logging out and back in as someone else). getUser() asks
// Supabase's Auth server to confirm who is *actually* signed in right
// now, so the profile we load always matches the real current user.
async function getCurrentProfile() {
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) return null;

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, role, photo_path")
    .eq("id", user.id)
    .single();

  if (error) {
    // A broken/stale session must not be left in place — if it were, this
    // page and the next one would keep redirecting back and forth forever,
    // each one seeing "a session exists" but never a usable profile.
    console.error("Could not load profile, signing out stale session:", error.message);
    await supabaseClient.auth.signOut();
    return null;
  }
  return profile;
}

// Call this at the top of any page that requires login.
// Redirects to the login page if nobody is signed in, otherwise
// returns the signed-in user's profile.
async function requireAuth() {
  const profile = await getCurrentProfile();
  if (!profile) {
    window.location.href = "index.html";
    return null;
  }
  return profile;
}

// ---------- Page wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  // Wire up the login form, if this page has one (index.html)
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    // If already logged in (and the session actually works), skip straight
    // to the dashboard. Uses the same check as requireAuth() so this page
    // and the dashboard can never disagree about what "logged in" means.
    getCurrentProfile().then((profile) => {
      if (profile) window.location.href = "dashboard.html";
    });

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const errorBox = document.getElementById("login-error");
      errorBox.textContent = "";

      const result = await login(email, password);
      if (result.success) {
        window.location.href = "dashboard.html";
      } else {
        errorBox.textContent = "Login failed: " + result.message;
      }
    });
  }

  // Wire up a logout button, if this page has one
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
});
