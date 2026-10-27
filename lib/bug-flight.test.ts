import { describe, expect, it } from "vitest";
import { flightPath } from "./bug-flight";

describe("flightPath", () => {
  const origin = { x: 200, y: 500 };
  const viewport = { width: 1200 };

  it("starts at the origin and ends above the viewport", () => {
    const path = flightPath(origin, viewport, 1432);
    expect(path[0].x).toBeCloseTo(origin.x);
    expect(path[0].y).toBeCloseTo(origin.y);
    expect(path[path.length - 1].y).toBeLessThan(0);
  });

  it("drifts to one side, chosen by the seed", () => {
    const right = flightPath(origin, viewport, 2);
    const left = flightPath({ x: 900, y: 500 }, viewport, 3);
    expect(right[right.length - 1].x).toBeGreaterThan(origin.x);
    expect(left[left.length - 1].x).toBeLessThan(900);
  });

  it("is deterministic for a seed", () => {
    expect(flightPath(origin, viewport, 7)).toEqual(flightPath(origin, viewport, 7));
  });

  it("keeps the tilt within ±50° and grows the bug in flight", () => {
    const path = flightPath(origin, viewport, 5);
    for (const point of path) {
      expect(Math.abs(point.angle)).toBeLessThanOrEqual(50);
      expect(point.scale).toBeGreaterThanOrEqual(1);
    }
    expect(Math.max(...path.map((p) => p.scale))).toBeGreaterThan(1.5);
  });

  it("flies toward the open side when it starts near an edge", () => {
    const nearLeft = flightPath({ x: 130, y: 500 }, viewport, 1425); // odd seed: would go left
    expect(nearLeft[nearLeft.length - 1].x).toBeGreaterThan(130);
  });

  it("stays on screen horizontally near an edge", () => {
    const nearRight = flightPath({ x: 1150, y: 500 }, viewport, 2);
    expect(nearRight[nearRight.length - 1].x).toBeLessThan(viewport.width + 60);
  });
});
