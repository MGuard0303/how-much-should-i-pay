import { describe, expect, it } from "vitest";
import { compressRatio, createPolygonGeometry } from "../src/lib/polygon";

function membersWithShares(shares: readonly number[]) {
  return shares.map((share, index) => ({
    id: `member-${index + 1}`,
    name: `Member ${index + 1}`,
    share,
  }));
}

describe("compressRatio", () => {
  it("preserves ordinary ratios, including the balanced ratio", () => {
    for (const ratio of [0, 0.2, 1, 2, 3]) {
      expect(compressRatio(ratio)).toBe(ratio);
    }
  });

  it("is continuous at the compression threshold and monotonically bounded", () => {
    expect(compressRatio(3 + 1e-8)).toBeCloseTo(3, 7);
    const samples = [3, 3.1, 3.5, 4, 5, 10, 100, Infinity].map(compressRatio);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
      expect(samples[index]).toBeLessThanOrEqual(4);
    }
    expect(compressRatio(Infinity)).toBe(4);
  });

  it.each([-1, -Infinity, NaN])("rejects an invalid ratio of %s", (ratio) => {
    expect(() => compressRatio(ratio)).toThrow(RangeError);
  });
});

describe("createPolygonGeometry", () => {
  it("places a settled triangle on its regular target polygon", () => {
    const geometry = createPolygonGeometry(membersWithShares([100, 100, 100]), [100, 100, 100], 300);

    expect(geometry.center).toEqual({ x: 300, y: 270 });
    expect(geometry.radius).toBeCloseTo(190 / 1.65);
    expect(geometry.nodes[0].target.x).toBeCloseTo(300);
    expect(geometry.nodes[0].target.y).toBeCloseTo(270 - geometry.radius);
    expect(geometry.targetPoints).toBe(geometry.actualPoints);
    for (const node of geometry.nodes) {
      expect(node.actual).toEqual(node.target);
      expect(node.ratio).toBe(1);
      expect(node.compressed).toBe(false);
      expect(node.zeroShare).toBe(false);
    }

    const [first, second, third] = geometry.nodes.map((node) => node.target);
    const side = (a: typeof first, b: typeof first) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(side(first, second)).toBeCloseTo(side(second, third));
    expect(side(second, third)).toBeCloseTo(side(third, first));
  });

  it("keeps an empty ledger at the center without dividing by zero", () => {
    const geometry = createPolygonGeometry(membersWithShares([0, 0, 0]), [0, 0, 0], 0);

    expect(geometry.actualPoints).toBe("300,270 300,270 300,270");
    for (const node of geometry.nodes) {
      expect(node.actual).toEqual(geometry.center);
      expect(node.ratio).toBe(0);
      expect(node.compressed).toBe(false);
    }
  });

  it("represents the degenerate shape when one person pays everything", () => {
    const geometry = createPolygonGeometry(membersWithShares([100, 100, 100]), [300, 0, 0], 300);

    expect(geometry.nodes[0].ratio).toBe(3);
    expect(geometry.nodes[0].actual.x).toBeCloseTo(300);
    expect(geometry.nodes[0].actual.y).toBeCloseTo(80);
    expect(geometry.nodes[1].actual).toEqual(geometry.center);
    expect(geometry.nodes[2].actual).toEqual(geometry.center);
    for (const node of geometry.nodes) {
      expect(Number.isFinite(node.actual.x)).toBe(true);
      expect(Number.isFinite(node.actual.y)).toBe(true);
      expect(Math.hypot(node.actual.x - 300, node.actual.y - 270)).toBeLessThanOrEqual(190);
    }
  });

  it("shows unpaid zero-share members as balanced and bounds positive payments", () => {
    const geometry = createPolygonGeometry(membersWithShares([1, 0, 0]), [0, 0, 1], 1);

    expect(geometry.nodes[1].ratio).toBe(1);
    expect(geometry.nodes[1].actual).toEqual(geometry.nodes[1].target);
    expect(geometry.nodes[1].zeroShare).toBe(true);
    expect(geometry.nodes[2].ratio).toBe(Infinity);
    expect(geometry.nodes[2].compressed).toBe(true);
    expect(geometry.nodes[2].zeroShare).toBe(true);
    expect(Math.hypot(geometry.nodes[2].actual.x - 300, geometry.nodes[2].actual.y - 270)).toBeCloseTo(190);
    expect(geometry.nodes[2].actual.x).toBeGreaterThanOrEqual(0);
    expect(geometry.nodes[2].actual.y).toBeGreaterThanOrEqual(0);
  });

  it("retains raw ratios while fitting extreme overpayments inside the canvas", () => {
    const geometry = createPolygonGeometry(membersWithShares([1, 1, 1]), [1000, 0, 0], 1000);

    expect(geometry.nodes[0].ratio).toBe(1000);
    expect(geometry.nodes[0].compressed).toBe(true);
    expect(geometry.radius).toBeCloseTo(47.5);
    for (const node of geometry.nodes) {
      for (const point of [node.actual, node.target]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(600);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(540);
      }
    }
  });

  it("accepts fractional effective payments used during settlement animation", () => {
    const geometry = createPolygonGeometry(membersWithShares([100, 100, 100]), [150.5, 75.25, 74.25], 300);

    expect(geometry.nodes.map((node) => node.ratio)).toEqual([1.505, 0.7525, 0.7425]);
  });

  it("does not mutate the provided members or effective payments", () => {
    const members = Object.freeze(membersWithShares([100, 100, 100]).map((member) => Object.freeze(member)));
    const paid = Object.freeze([150, 100, 50]);

    expect(() => createPolygonGeometry(members, paid, 300)).not.toThrow();
    expect(paid).toEqual([150, 100, 50]);
  });

  it("requires three members and matching payment counts", () => {
    expect(() => createPolygonGeometry(membersWithShares([1, 1]), [1, 1], 2)).toThrow(RangeError);
    expect(() => createPolygonGeometry(membersWithShares([1, 1, 1]), [1, 1], 3)).toThrow(RangeError);
  });

  it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe amounts of %s", (value) => {
    expect(() => createPolygonGeometry(membersWithShares([1, 1, 1]), [1, 1, 1], value)).toThrow(RangeError);
    expect(() => createPolygonGeometry(membersWithShares([value, 1, 1]), [1, 1, 1], 3)).toThrow(RangeError);
    expect(() => createPolygonGeometry(membersWithShares([1, 1, 1]), [value, 1, 1], 3)).toThrow(RangeError);
  });
});
