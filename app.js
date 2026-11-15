/* Sigalion Labs: the sliding deck, the text that resolves out of glyphs, and the veil behind it.
   Plain JavaScript, no libraries, no network requests. */
(function () {
  "use strict";

  var body = document.body;
  var track = document.querySelector(".track");
  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));
  if (!track || !panels.length) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var GLYPHS = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθλμξπσφψω0123456789";
  var HEX = "0123456789abcdef";
  var SLIDE_MS = reduced ? 1 : 950;

  body.classList.add("js");

  function pick(set) { return set.charAt(Math.floor(Math.random() * set.length)); }

  /* ---------- text that resolves out of glyphs ---------- */

  function scramble(el) {
    var final = el.getAttribute("data-final");
    if (final === null) {
      final = el.textContent;
      el.setAttribute("data-final", final);
      el.setAttribute("aria-label", final);
    }
    if (reduced) { el.textContent = final; return; }
    if (el._scramble) cancelAnimationFrame(el._scramble);
    var start = performance.now();
    var duration = 700 + final.length * 38;
    function frame(now) {
      var progress = Math.min(1, (now - start) / duration);
      var settled = Math.floor(progress * final.length);
      var out = "";
      for (var i = 0; i < final.length; i++) {
        var ch = final.charAt(i);
        out += (i < settled || ch === " ") ? ch : pick(GLYPHS);
      }
      el.textContent = out;
      if (progress < 1) el._scramble = requestAnimationFrame(frame);
      else el.textContent = final;
    }
    el._scramble = requestAnimationFrame(frame);
  }

  /* ---------- the deck ---------- */

  var index = 0;
  var locked = false;
  var links = Array.prototype.slice.call(document.querySelectorAll("[data-go]"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".index a"));
  var prevButtons = Array.prototype.slice.call(document.querySelectorAll("[data-prev]"));
  var nextButtons = Array.prototype.slice.call(document.querySelectorAll("[data-next]"));
  var counter = document.getElementById("now");
  var wipe = document.querySelector(".wipe");

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function render(direction, instant) {
    if (instant) track.style.transition = "none";
    track.style.transform = "translate3d(" + (-index * 100) + "vw,0,0)";
    if (instant) { void track.offsetWidth; track.style.transition = ""; }

    panels.forEach(function (panel, i) {
      var active = i === index;
      panel.classList.toggle("is-active", active);
      // Keep off-screen panels out of the tab order and away from screen readers.
      if ("inert" in panel) panel.inert = !active;
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
    navLinks.forEach(function (a) {
      var on = Number(a.getAttribute("data-go")) === index;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    prevButtons.forEach(function (b) { b.disabled = index === 0; });
    nextButtons.forEach(function (b) { if (b.closest(".controls")) b.disabled = index === panels.length - 1; });
    if (counter) counter.textContent = pad(index + 1);

    var active = panels[index];
    var delay = instant ? 150 : 420;
    setTimeout(function () {
      Array.prototype.forEach.call(active.querySelectorAll("[data-scramble]"), scramble);
    }, delay);

    if (wipe && !instant && !reduced && direction) {
      wipe.classList.remove("run", "back");
      void wipe.offsetWidth;
      wipe.classList.add("run");
      if (direction < 0) wipe.classList.add("back");
    }

    var id = active.id;
    if (id && history.replaceState) history.replaceState(null, "", index === 0 ? location.pathname : "#" + id);
    document.dispatchEvent(new CustomEvent("deck:change", { detail: { index: index, id: id } }));
  }

  function go(target, instant) {
    target = Math.max(0, Math.min(panels.length - 1, target));
    if (target === index && !instant) return;
    if (locked && !instant) return;
    var direction = target > index ? 1 : target < index ? -1 : 0;
    index = target;
    if (!instant) {
      locked = true;
      setTimeout(function () { locked = false; }, SLIDE_MS + 120);
    }
    render(direction, instant);
  }

  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      go(Number(a.getAttribute("data-go")));
    });
  });
  prevButtons.forEach(function (b) { b.addEventListener("click", function () { go(index - 1); }); });
  nextButtons.forEach(function (b) { b.addEventListener("click", function () { go(index + 1); }); });

  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var key = e.key;
    if (key === "ArrowRight" || key === "PageDown") { e.preventDefault(); go(index + 1); }
    else if (key === "ArrowLeft" || key === "PageUp") { e.preventDefault(); go(index - 1); }
    else if (key === "Home") { e.preventDefault(); go(0); }
    else if (key === "End") { e.preventDefault(); go(panels.length - 1); }
  });

  // Wheel: scroll inside a tall panel first; change panel only at its top or bottom edge.
  var wheelSum = 0;
  var wheelTimer = null;
  window.addEventListener("wheel", function (e) {
    var horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    var delta = horizontal ? e.deltaX : e.deltaY;
    var scroller = panels[index].querySelector(".scroll");
    if (!horizontal && scroller) {
      var room = scroller.scrollHeight - scroller.clientHeight;
      if (room > 2) {
        var atTop = scroller.scrollTop <= 0;
        var atBottom = scroller.scrollTop >= room - 1;
        if ((delta > 0 && !atBottom) || (delta < 0 && !atTop)) return;
      }
    }
    e.preventDefault();
    if (locked) return;
    wheelSum += delta;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function () { wheelSum = 0; }, 160);
    if (Math.abs(wheelSum) > 48) {
      go(index + (wheelSum > 0 ? 1 : -1));
      wheelSum = 0;
    }
  }, { passive: false });

  // Touch: a sideways swipe changes panel; an up or down drag scrolls the panel.
  var touch = null;
  window.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  window.addEventListener("touchend", function (e) {
    if (!touch) return;
    var end = e.changedTouches[0];
    var dx = end.clientX - touch.x;
    var dy = end.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) go(index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  function fromHash() {
    var id = location.hash.replace("#", "");
    for (var i = 0; i < panels.length; i++) if (panels[i].id === id) return i;
    return 0;
  }
  window.addEventListener("hashchange", function () { go(fromHash()); });
  window.addEventListener("resize", function () { render(0, true); });

  index = fromHash();
  render(0, true);

  /* ---------- the wire: plaintext, sealed text, plaintext ---------- */

  var wireFrom = document.getElementById("wire-from");
  var wireMid = document.getElementById("wire-mid");
  var wireTo = document.getElementById("wire-to");
  var LINES = ["Meet me where we said.", "Nine tonight. Come alone.", "Burn this after reading.", "The door will be open."];
  var wireTimers = [];
  var wireLine = 0;

  function later(fn, ms) { wireTimers.push(setTimeout(fn, ms)); }
  function stopWire() { wireTimers.forEach(clearTimeout); wireTimers = []; }
  function sealed(length) {
    var out = "";
    for (var i = 0; i < length; i++) out += pick(HEX) + (i % 4 === 3 ? " " : "");
    return out;
  }

  function playWire() {
    stopWire();
    if (!wireFrom) return;
    var text = LINES[wireLine % LINES.length];
    wireLine++;
    wireFrom.textContent = "";
    wireMid.textContent = "";
    wireTo.textContent = "";
    if (reduced) {
      wireFrom.textContent = text;
      wireMid.textContent = sealed(96);
      wireTo.textContent = text;
      return;
    }
    var typed = 0;
    (function type() {
      typed++;
      wireFrom.textContent = text.slice(0, typed);
      if (typed < text.length) later(type, 46);
      else later(seal, 520);
    })();
    function seal() {
      var ticks = 0;
      (function churn() {
        ticks++;
        wireMid.textContent = sealed(96);
        if (ticks < 26) later(churn, 70);
        else later(open, 200);
      })();
    }
    function open() {
      wireTo.setAttribute("data-final", text);
      wireTo.textContent = text;
      wireTo.removeAttribute("aria-label");
      scramble(wireTo);
      later(playWire, 4200);
    }
  }

  document.addEventListener("deck:change", function (e) {
    if (e.detail.id === "transit") setTimeout(playWire, 900);
    else stopWire();
  });
  if (panels[index].id === "transit") setTimeout(playWire, 600);

  /* ---------- the veil: a field of glyphs that never settles ---------- */

  var canvas = document.getElementById("veil");
  var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (ctx) {
    var CELL = 26;
    var cols = 0, rows = 0, cells = [], dpr = 1;
    var pointer = { x: -9999, y: -9999 };
    var running = true;
    var last = 0;

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(window.innerWidth / CELL) + 1;
      rows = Math.ceil(window.innerHeight / CELL) + 1;
      cells = [];
      for (var i = 0; i < cols * rows; i++) cells.push({ ch: pick(GLYPHS), heat: Math.random() * 0.12 });
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.font = "13px ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace";
      ctx.textBaseline = "top";
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var cell = cells[r * cols + c];
          var x = c * CELL, y = r * CELL;
          var dx = x - pointer.x, dy = y - pointer.y;
          var near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 230);
          var alpha = 0.035 + cell.heat * 0.5 + near * 0.3;
          if (alpha < 0.045) continue;
          ctx.fillStyle = "rgba(127,209,199," + Math.min(0.62, alpha).toFixed(3) + ")";
          ctx.fillText(cell.ch, x, y);
        }
      }
    }

    function tick(now) {
      if (!running) return;
      if (now - last > 70) {
        last = now;
        var changes = Math.max(6, Math.floor(cells.length / 90));
        for (var i = 0; i < changes; i++) {
          var cell = cells[Math.floor(Math.random() * cells.length)];
          cell.ch = pick(GLYPHS);
          cell.heat = 0.35 + Math.random() * 0.65;
        }
        for (var j = 0; j < cells.length; j++) cells[j].heat *= 0.94;
        draw();
      }
      requestAnimationFrame(tick);
    }

    window.addEventListener("resize", size);
    window.addEventListener("pointermove", function (e) { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden && !reduced;
      if (running) requestAnimationFrame(tick);
    });
    size();
    if (reduced) running = false; else requestAnimationFrame(tick);
  }

  /* ---------- monthly or yearly prices ---------- */

  var periodButtons = Array.prototype.slice.call(document.querySelectorAll("[data-period]"));
  var priced = Array.prototype.slice.call(document.querySelectorAll(".level [data-m]"));
  function setPeriod(period) {
    priced.forEach(function (el) { el.textContent = el.getAttribute("data-" + period); });
    periodButtons.forEach(function (b) {
      var on = b.getAttribute("data-period") === period;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  periodButtons.forEach(function (b) {
    b.addEventListener("click", function () { setPeriod(b.getAttribute("data-period")); });
  });

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
