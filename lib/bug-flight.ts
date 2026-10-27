/**
 * "The bug flies away": when an issue is resolved, its bug icon sprouts wings
 * and flutters up off the screen, leaving a trail of sparkles. Plain DOM and
 * the Web Animations API, mounted on <body> and removed when done, so the
 * page underneath never re-renders for it.
 */

/** The bug outline from the Issues list (same path as the row icon). */
export const BUG_ICON_PATH =
  "m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4";

const SPARKLE_COLORS = ["#38A3FF", "#FFC83D", "#4ADE80", "#FF8FB1", "#A78BFA"];
const SIZE = 48;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export type Point = { x: number; y: number; angle: number; scale: number };

/**
 * A wobbly climb from the origin up past the top of the viewport. Pure, so it
 * can be tested: `seed` picks the side it drifts to and how much it wobbles.
 */
export function flightPath(origin: { x: number; y: number }, viewport: { width: number }, seed: number, steps = 12): Point[] {
  const roomOn = (s: number) => (s > 0 ? viewport.width - origin.x : origin.x);
  // The seed picks a side, unless the bug would fly straight off the near edge.
  let side = seed % 2 === 0 ? 1 : -1;
  if (roomOn(side) < 240 && roomOn(-side) > roomOn(side)) side = -side;
  const room = roomOn(side);
  const drift = side * Math.min(260 + (seed % 5) * 30, Math.max(120, room - 40));
  const endY = -SIZE * 2;
  const wobble = 26 + (seed % 3) * 8;
  const points: Point[] = [];
  let prev = { x: origin.x, y: origin.y };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // A small hop first (wings warming up), then an accelerating climb.
    const hop = Math.sin(Math.min(t * 4, 1) * Math.PI) * 14;
    const y = origin.y + (endY - origin.y) * Math.pow(t, 1.7) - hop;
    const x = origin.x + drift * (t * t * (3 - 2 * t)) + Math.sin(t * Math.PI * 3.2) * wobble * (1 - t * 0.4);
    const dx = x - prev.x;
    const dy = y - prev.y;
    // The bug faces up (−y); tilt it toward where it's heading.
    const angle = i === 0 ? 0 : Math.max(-50, Math.min(50, (Math.atan2(dx, -dy) * 180) / Math.PI));
    const scale = 1 + Math.sin(Math.min(t * 1.6, 1) * (Math.PI / 2)) * 0.7;
    points.push({ x, y, angle, scale });
    prev = { x, y };
  }
  return points;
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function buildBug(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "zk-flying-bug";
  wrap.setAttribute("aria-hidden", "true");
  const root = svg("svg", { viewBox: "0 0 48 48", width: SIZE, height: SIZE });
  const wings = svg("g", { class: "zk-wings" });
  wings.append(
    svg("ellipse", { class: "zk-wing zk-wing-left", cx: 14, cy: 21, rx: 10, ry: 13, transform: "rotate(-28 14 21)" }),
    svg("ellipse", { class: "zk-wing zk-wing-right", cx: 34, cy: 21, rx: 10, ry: 13, transform: "rotate(28 34 21)" }),
  );
  const body = svg("g", { class: "zk-bug-body", transform: "translate(12 12)" });
  body.append(
    svg("ellipse", { cx: 12, cy: 14, rx: 6, ry: 6.5, class: "zk-bug-fill" }),
    svg("path", { d: BUG_ICON_PATH, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    svg("circle", { cx: 10.6, cy: 6.4, r: 0.85, fill: "currentColor" }),
    svg("circle", { cx: 13.4, cy: 6.4, r: 0.85, fill: "currentColor" }),
  );
  root.append(wings, body);
  wrap.append(root);
  return wrap;
}

function sparkle(x: number, y: number, color: string, delay: number, layer: HTMLElement) {
  const el = document.createElement("div");
  el.className = "zk-sparkle";
  el.setAttribute("aria-hidden", "true");
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  const star = svg("svg", { viewBox: "0 0 24 24", width: 14, height: 14 });
  star.append(svg("path", { d: "M12 0 14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4Z", fill: "currentColor" }));
  el.append(star);
  layer.append(el);
  const spin = (Math.random() - 0.5) * 180;
  el.animate(
    [
      { transform: "translate(-50%, -50%) scale(0) rotate(0deg)", opacity: 0 },
      { transform: `translate(-50%, -50%) scale(1.1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(-50%, calc(-50% + 18px)) scale(0) rotate(${spin}deg)`, opacity: 0 },
    ],
    { duration: 800, delay, easing: "ease-out", fill: "both" },
  );
}

/** Launches the bug from `origin` (the row's bug icon). Resolves when it's gone. */
export function launchBug(origin: DOMRect, { duration = 2000, seed = 0 } = {}): Promise<void> {
  if (typeof Element === "undefined" || !("animate" in Element.prototype)) return Promise.resolve();
  const layer = document.createElement("div");
  layer.className = "zk-flight-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);

  const start = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 };
  const path = flightPath(start, { width: window.innerWidth }, seed);

  // A soft ring where the bug lifts off.
  const ring = document.createElement("div");
  ring.className = "zk-liftoff";
  ring.style.left = `${start.x}px`;
  ring.style.top = `${start.y}px`;
  layer.append(ring);
  ring.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0.9 },
      { transform: "translate(-50%, -50%) scale(2.4)", opacity: 0 },
    ],
    { duration: 650, easing: "ease-out", fill: "both" },
  );

  const bug = buildBug();
  layer.append(bug);
  const half = SIZE / 2;
  const flight = bug.animate(
    path.map((p, i) => ({
      transform: `translate(${p.x - half}px, ${p.y - half}px) rotate(${p.angle}deg) scale(${p.scale})`,
      opacity: i === path.length - 1 ? 0.6 : 1,
      offset: i / (path.length - 1),
    })),
    { duration, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "both" },
  );
  bug.querySelector(".zk-wings")?.animate(
    [{ transform: "scale(0)" }, { transform: "scale(1.15)", offset: 0.7 }, { transform: "scale(1)" }],
    { duration: 260, easing: "ease-out", fill: "both" },
  );

  path.slice(1, -1).forEach((p, i) => {
    sparkle(p.x + (Math.random() - 0.5) * 18, p.y + 14, SPARKLE_COLORS[i % SPARKLE_COLORS.length], (i + 1) * (duration / path.length), layer);
  });

  // The last sparkles outlive the bug by a moment; clear the layer after them.
  return flight.finished
    .catch(() => undefined)
    .then(() => new Promise<void>((resolve) => window.setTimeout(resolve, 800)))
    .then(() => layer.remove());
}
