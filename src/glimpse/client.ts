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
 *   { type: "theme",     value: "dark" | "light" }
 *   { type: "principle", value: "default" | "atlas" }
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
 *   #P1-1-T2                                    the last decision's label,
 *                                               hidden until one lands
 *   #P3-1-L1 .tabs-trigger[data-group]         settings tab strip, one trigger
 *                                               per group; `aria-selected` marks
 *                                               the open one
 *   #P3-1-L1 .tabs-content[data-group]          the panel each trigger opens,
 *                                               `hidden` while unselected
 *   #P3-1-L1 .field-row[data-field]             settings rows
 *   #P3-1-L1 .field-row .f-control[data-field]  the row's own editor, when it has one
 *   #P3-1-A1 .detail-block[data-field]          one detail block per group
 *   #P0-1-W1 / #P0-1-W2 / #P0-1-W3 / #P0-1-B2  theme, language, principle, close
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
    // The receipt names what the last decision did to the last candidate; once
    // the user moves the cursor it would be describing someone else's row.
    var notice = document.getElementById("P1-1-T2");
    if (notice) notice.setAttribute("hidden", "");
  }

  function selectedIndex() {
    var list = document.getElementById("P1-1-L1");
    var value = list ? Number(list.dataset.selected) : 0;
    return isFinite(value) ? value : 0;
  }

  /* ---------- settings: tabs and field focus are local ---------- */

  /** Field rows of the visible panel only: Tab must not walk into a hidden tab. */
  function settingsRows() {
    return all("#P3-1-L1 .tabs-content:not([hidden]) .field-row");
  }

  /**
   * Reveal one tab panel and mark its own trigger selected.
   *
   * The hidden attribute and aria-selected move together: the stylesheet draws
   * the selected tab from aria-selected, so a panel that opened without its
   * trigger selecting would leave the strip pointing at the wrong group.
   */
  function activateGroup(id) {
    all("#P3-1-L1 .tabs-trigger").forEach(function (trigger) {
      var active = trigger.dataset.group === id;
      trigger.setAttribute("aria-selected", active ? "true" : "false");
      // Roving tabindex: the strip is one tab stop, the arrows move inside it.
      trigger.setAttribute("tabindex", active ? "0" : "-1");
    });
    all("#P3-1-L1 .tabs-content").forEach(function (panel) {
      if (panel.dataset.group === id) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });
  }

  /**
   * Highlight one row, show the detail block that explains it, and — unless
   * the caller says otherwise — move the keyboard into its control.
   *
   * moveFocus is false for a tab switch: the highlight has to follow the group
   * the user just picked (the detail pane explains the focused field), but
   * stealing focus from the tab strip would break arrow-key navigation of it.
   */
  function focusField(key, moveFocus) {
    var control = null;
    all("#P3-1-L1 .field-row").forEach(function (row) {
      var focused = row.dataset.field === key;
      row.classList.toggle("is-focused", focused);
      // Only the visible panel's editor can take focus; a hidden one would move
      // the keyboard somewhere the user cannot see.
      if (focused && !row.closest("[hidden]")) {
        control = row.querySelector(".f-control");
      }
    });
    // Real focus follows the highlight. A highlighted row that does not hold
    // the keyboard would swallow Space, and a select only opens its own menu
    // for the element that has focus.
    if (moveFocus !== false && control && typeof control.focus === "function") {
      control.focus();
    }
    all("#P3-1-A1 .detail-block").forEach(function (block) {
      if (block.dataset.field === key) block.removeAttribute("hidden");
      else block.setAttribute("hidden", "");
    });
  }

  /** Open one tab and put its first row under the highlight. */
  function selectGroup(id) {
    activateGroup(id);
    var first = settingsRows()[0];
    if (first && first.dataset.field) focusField(first.dataset.field, false);
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
    // The header's principle picker is chrome, not configuration: it re-skins
    // the document in place (every token block is already in the page) and only
    // reports the choice so the preference survives the window.
    var picker = target.closest("#P0-1-W3");
    if (picker) {
      root.classList.toggle("atlas", picker.value === "atlas");
      send({
        type: "principle",
        value: picker.value,
      });
      return;
    }

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

    var tab = target.closest("#P3-1-L1 .tabs-trigger");
    if (tab && tab.dataset.group) {
      selectGroup(tab.dataset.group);
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

    if (view !== "settings") return;

    // Arrows walk the tab strip (ARIA tabs pattern). The trigger is a real
    // focusable button, so the browser's own Tab reaches the strip and the
    // arrows stay inside it.
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      var eventTarget = event.target;
      var focusedTab =
        eventTarget && typeof eventTarget.closest === "function"
          ? eventTarget.closest("#P3-1-L1 .tabs-trigger")
          : null;
      if (!focusedTab) return;
      var triggers = all("#P3-1-L1 .tabs-trigger");
      var index = triggers.indexOf(focusedTab);
      if (index < 0) return;
      event.preventDefault();
      var move = event.key === "ArrowRight" ? 1 : -1;
      var nextTab = triggers[(index + move + triggers.length) % triggers.length];
      selectGroup(nextTab.dataset.group);
      nextTab.focus();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      // Only the visible panel's rows: Tab cycles the group the user is on,
      // rather than walking the six panels behind it.
      var rows = settingsRows();
      if (!rows.length) return;
      var keys = rows.map(function (row) { return row.dataset.field; });
      var at = -1;
      rows.forEach(function (row, i) {
        if (row.classList.contains("is-focused")) at = i;
      });
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
