/**
 * In-page client for the Glimpse window.
 *
 * Scope is deliberately narrow: the client owns routing, local view state, the
 * keyboard, and *intent* — never copy and never data. Every view body is
 * rendered by Node (see `views/`), so there is no text table here and no way
 * for the window to show a string the panel would not.
 *
 * The client talks to Node through `window.glimpse.send`, one message per
 * intent:
 *
 *   { type: "theme",    value: "dark" | "light" }
 *   { type: "language", value: "en" | "zh", view: <current view> }
 *   { type: "review",   index: number, decision: "store" | "reject" | "later" }
 *   { type: "setting",  id: string, value: string }
 *   { type: "close" }
 *
 * A language change is answered by re-rendering the whole document, because the
 * text lives in Node. The current view travels with the message so the re-render
 * can land on the same view.
 *
 * DOM contract the views must satisfy:
 *
 *   .tabpage[data-route="#/x"][data-page="x"]   one per view
 *   .nav-item[data-tab="x"]                     sidebar entries
 *   #P1-1-L1 .candidate-item[data-index]        pending rows; the list carries
 *                                               `data-selected`
 *   #P1-1-A1 .detail-block[data-index]          one detail block per candidate
 *   #P1-1-A2 button[data-decision]              store / reject / later
 *   .group-head[data-group][aria-expanded]      settings accordion heads, each
 *                                               followed by `.group-body`
 *   #P3-1-L1 .field-row[data-field]             settings rows
 *   #P3-1-L1 .field-row .f-control[data-field]  the row's own editor, when it has one
 *   #P3-1-A1 .detail-block[data-field]          one detail block per group
 *   #P0-1-W1 / #P0-1-W2 / #P0-1-B2              theme, language, close
 */
export const CLIENT_SCRIPT = `
(function () {
  "use strict";

  var root = document.documentElement;
  var VIEWS = ["pending", "recent", "settings", "status"];

  function send(message) {
    if (window.glimpse && typeof window.glimpse.send === "function") {
      window.glimpse.send(message);
    }
  }

  function currentLanguage() {
    return root.lang === "en" ? "en" : "zh";
  }

  function currentTheme() {
    return root.classList.contains("dark") ? "dark" : "light";
  }

  function all(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  /* ---------- routing: hash drives which .tabpage is active ---------- */

  function pageFromHash() {
    var pages = all(".tabpage");
    var hash = location.hash;
    // setHTML resets location to "", so an empty hash means a fresh
    // document whose server-rendered .is-active is the initial view —
    // do not fall back to pending and clobber it.
    if (!hash) {
      var marked = document.querySelector(".tabpage.is-active");
      return marked || pages[0];
    }
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].dataset.route === hash) return pages[i];
    }
    return pages[0];
  }

  function activeView() {
    var page = document.querySelector(".tabpage.is-active");
    return page && page.dataset.page ? page.dataset.page : "pending";
  }

  function applyRoute() {
    var target = pageFromHash();
    all(".tabpage").forEach(function (page) {
      var active = page === target;
      page.classList.toggle("is-active", active);
      if (active) page.removeAttribute("hidden");
      else page.setAttribute("hidden", "");
    });
    var name = target ? target.dataset.page : "pending";
    all(".nav-item").forEach(function (nav) {
      nav.classList.toggle("is-active", nav.dataset.tab === name);
    });
  }

  window.addEventListener("hashchange", applyRoute);
  applyRoute();

  /* ---------- pending: selection is local, every detail is rendered ---------- */

  function candidateItems() {
    return all("#P1-1-L1 .candidate-item");
  }

  function selectCandidate(index) {
    var items = candidateItems();
    if (!items.length) return;
    var next = Math.max(0, Math.min(index, items.length - 1));
    items.forEach(function (item, i) {
      item.classList.toggle("is-selected", i === next);
    });
    all("#P1-1-A1 .detail-block").forEach(function (block, i) {
      if (i === next) block.removeAttribute("hidden");
      else block.setAttribute("hidden", "");
    });
    var list = document.getElementById("P1-1-L1");
    if (list) list.dataset.selected = String(next);
  }

  function selectedIndex() {
    var list = document.getElementById("P1-1-L1");
    var value = list ? Number(list.dataset.selected) : 0;
    return isFinite(value) ? value : 0;
  }

  /* ---------- settings: accordion and field focus are local ---------- */

  function toggleGroup(id) {
    var head = document.querySelector('.group-head[data-group="' + id + '"]');
    if (!head) return;
    var open = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", open ? "false" : "true");
    var body = head.parentNode ? head.parentNode.querySelector(".group-body") : null;
    if (!body) return;
    if (open) body.setAttribute("hidden", "");
    else body.removeAttribute("hidden");
  }

  function focusField(key) {
    var control = null;
    all("#P3-1-L1 .field-row").forEach(function (row) {
      var focused = row.dataset.field === key;
      row.classList.toggle("is-focused", focused);
      if (focused) control = row.querySelector(".f-control");
    });
    // Real focus follows the highlight. A highlighted row that does not hold
    // the keyboard would swallow Space, and a select only opens its own menu
    // for the element that has focus.
    if (control && typeof control.focus === "function") control.focus();
    all("#P3-1-A1 .detail-block").forEach(function (block) {
      if (block.dataset.field === key) block.removeAttribute("hidden");
      else block.setAttribute("hidden", "");
    });
  }

  /**
   * A control reports its own change; the row only says which field it is.
   *
   * Delegated on the document because the controls live inside server-rendered
   * rows and are therefore re-created on every language re-render.
   */
  document.addEventListener("change", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;
    var control = target.closest("#P3-1-L1 .f-control");
    if (!control || control.disabled || !control.dataset.field) return;
    // The language row is the one setting that redraws every label, and the
    // header toggle already has a message that carries the current view for
    // exactly that re-render. Both routes converge on the same handler.
    if (control.dataset.field === "language") {
      send({
        type: "language",
        value: control.value,
        view: activeView()
      });
      return;
    }
    send({
      type: "setting",
      id: control.dataset.field,
      value: control.value
    });
  });

  /* ---------- pointer intent ---------- */

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;

    var nav = target.closest(".nav-item");
    if (nav && nav.dataset.tab) {
      location.hash = "#/" + nav.dataset.tab;
      return;
    }

    var candidate = target.closest(".candidate-item");
    if (candidate && candidate.dataset.index !== undefined) {
      selectCandidate(Number(candidate.dataset.index));
      return;
    }

    var decision = target.closest("#P1-1-A2 button[data-decision]");
    if (decision) {
      send({
        type: "review",
        index: selectedIndex(),
        decision: decision.dataset.decision,
      });
      return;
    }

    var head = target.closest(".group-head");
    if (head && head.dataset.group) {
      toggleGroup(head.dataset.group);
      return;
    }

    var row = target.closest(".field-row");
    if (row && row.dataset.field) {
      focusField(row.dataset.field);
      return;
    }

    if (target.closest("#P0-1-W1")) {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.classList.toggle("dark", next === "dark");
      send({ type: "theme", value: next });
      return;
    }

    if (target.closest("#P0-1-W2")) {
      send({
        type: "language",
        value: currentLanguage() === "zh" ? "en" : "zh",
        view: activeView(),
      });
      return;
    }

    if (target.closest("#P0-1-B2")) {
      send({ type: "close" });
    }
  });

  /* ---------- keyboard ---------- */

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      // An open control popup owns Escape: there the key means "cancel this
      // choice", not "close the window".
      var target = event.target;
      if (target && target.tagName === "SELECT") return;
      event.preventDefault();
      send({ type: "close" });
      return;
    }

    var view = activeView();

    if (view === "pending") {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectCandidate(selectedIndex() - 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        selectCandidate(selectedIndex() + 1);
      }
      return;
    }

    if (view === "settings" && event.key === "Tab") {
      event.preventDefault();
      var rows = all("#P3-1-L1 .field-row");
      if (!rows.length) return;
      var keys = rows.map(function (row) { return row.dataset.field; });
      var current = document.querySelector("#P3-1-L1 .field-row.is-focused");
      var at = current ? keys.indexOf(current.dataset.field) : -1;
      var step = event.shiftKey ? -1 : 1;
      var next = at < 0 ? 0 : (at + step + keys.length) % keys.length;
      focusField(keys[next]);
    }
  });

  /* ---------- boot ---------- */

  if (VIEWS.indexOf(activeView()) < 0) {
    location.hash = "#/pending";
    applyRoute();
  }
  selectCandidate(selectedIndex());
})();
`;
