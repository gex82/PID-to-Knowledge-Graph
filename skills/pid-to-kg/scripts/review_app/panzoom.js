// Pan / zoom for a content box inside a clipped stage. The owner applies the
// transform (CSS for HTML content, an attribute for SVG groups).
class PanZoom {
  constructor(stage, apply, opts = {}) {
    this.stage = stage; this.apply = apply; this.min = opts.min || 0.02; this.max = opts.max || 40;
    this.t = { x: 0, y: 0, k: 1 }; this.pointers = new Map(); this.moved = false; this.raf = 0;
    stage.style.touchAction = 'none';
    stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    stage.addEventListener('pointerdown', e => { if (e.button !== 0) return; this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.moved = false; this.start = { x: e.clientX, y: e.clientY }; cancelAnimationFrame(this.raf); });
    stage.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (!this.moved && Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) < 4) return;
      if (!this.moved) { this.moved = true; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging'); }
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [a2, b2] = [...this.pointers.values()]; const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y); const r = stage.getBoundingClientRect();
        if (d0 > 0) this.zoomAt(d1 / d0, (a2.x + b2.x) / 2 - r.left, (a2.y + b2.y) / 2 - r.top);
        return;
      }
      this.set({ x: this.t.x + e.clientX - p.x, y: this.t.y + e.clientY - p.y, k: this.t.k });
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = e => { this.pointers.delete(e.pointerId); stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    // A drag must not also count as a click on whatever was under the pointer.
    stage.addEventListener('click', e => { if (this.moved) { e.stopPropagation(); e.preventDefault(); this.moved = false; } }, true);
    stage.addEventListener('dblclick', e => { const r = stage.getBoundingClientRect(); this.zoomAt(e.shiftKey ? 0.5 : 2, e.clientX - r.left, e.clientY - r.top, true); });
  }
  set(t, animate) {
    t = { x: t.x, y: t.y, k: Math.max(this.min, Math.min(this.max, t.k)) };
    cancelAnimationFrame(this.raf);
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.t = t; this.apply(t); return; }
    const from = { ...this.t }, t0 = performance.now(), dur = 320;
    const step = now => {
      const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 3);
      // Interpolate scale geometrically so the zoom feels even.
      const k = from.k * Math.pow(t.k / from.k, e);
      this.t = { x: from.x + (t.x - from.x) * e, y: from.y + (t.y - from.y) * e, k };
      this.apply(this.t);
      if (u < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  zoomAt(f, cx, cy, animate) {
    const k = Math.max(this.min, Math.min(this.max, this.t.k * f)), r = k / this.t.k;
    this.set({ x: cx - (cx - this.t.x) * r, y: cy - (cy - this.t.y) * r, k }, animate);
  }
  zoomBy(f) { this.zoomAt(f, this.stage.clientWidth / 2, this.stage.clientHeight / 2, true); }
  /** Bring a content-space rectangle into view. */
  fit(rect, pad = 24, animate = false, maxK = Infinity) {
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    if (!W || !H || !rect.w || !rect.h) return;
    const k = Math.min(maxK, Math.max(this.min, Math.min((W - pad * 2) / rect.w, (H - pad * 2) / rect.h)));
    this.set({ k, x: (W - rect.w * k) / 2 - rect.x * k, y: (H - rect.h * k) / 2 - rect.y * k }, animate);
  }
  /** Visible content-space rectangle. */
  viewport() { const { x, y, k } = this.t; return { x: -x / k, y: -y / k, w: this.stage.clientWidth / k, h: this.stage.clientHeight / k }; }
}
