export interface Point {
  x: number;
  y: number;
}

export interface PolygonNode {
  id: string;
  name: string;
  target: Point;
  actual: Point;
  ratio: number;
  compressed: boolean;
  zeroShare: boolean;
}

export interface PolygonGeometry {
  nodes: PolygonNode[];
  targetPoints: string;
  actualPoints: string;
  center: Point;
  radius: number;
}

const CENTER: Point = { x: 300, y: 270 };
const MAX_RADIUS = 190;
const MIN_SCALE = 1.65;

/** Preserve ordinary ratios and smoothly compress unusually large overpayments. */
export function compressRatio(ratio: number): number {
  if (Number.isNaN(ratio) || ratio < 0) {
    throw new RangeError("Payment ratios must be nonnegative numbers.");
  }

  if (ratio === Number.POSITIVE_INFINITY) return 4;
  if (ratio <= 3) return ratio;

  return 3 + (1 - Math.exp(-(ratio - 3)));
}

function validateAmount(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} must be a finite, nonnegative safe amount.`);
  }
}

function pointsAttribute(points: readonly Point[]): string {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

/**
 * Place members on equally spaced rays and fit all payment points into the SVG.
 * Amounts may be fractional during animation; settlement precision is handled
 * by the settlement engine. A zero-share member with no payment stays balanced.
 */
export function createPolygonGeometry(
  members: readonly { id: string; name: string; share: number }[],
  effectivePaid: readonly number[],
  total: number,
): PolygonGeometry {
  if (members.length < 3) {
    throw new RangeError("A payment polygon requires at least three members.");
  }
  if (members.length !== effectivePaid.length) {
    throw new RangeError("Each member must have one effective payment.");
  }
  validateAmount(total, "Total");

  const ratios: number[] = [];
  const plottedRatios: number[] = [];
  let scale = MIN_SCALE;

  for (let index = 0; index < members.length; index += 1) {
    const share = members[index].share;
    const paid = effectivePaid[index];
    validateAmount(share, "Member share");
    validateAmount(paid, "Effective payment");

    // An empty ledger has no meaningful payment ratio and starts at the center.
    const ratio = total === 0 ? 0 : share === 0 ? (paid === 0 ? 1 : Infinity) : paid / share;
    const plottedRatio = compressRatio(ratio);
    ratios.push(ratio);
    plottedRatios.push(plottedRatio);
    scale = Math.max(scale, plottedRatio);
  }

  const radius = MAX_RADIUS / scale;
  const nodes = members.map((member, index): PolygonNode => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / members.length;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const pointOnRay = (distance: number): Point => ({
      x: CENTER.x + direction.x * distance,
      y: CENTER.y + direction.y * distance,
    });

    return {
      id: member.id,
      name: member.name,
      target: pointOnRay(radius),
      actual: pointOnRay(radius * plottedRatios[index]),
      ratio: ratios[index],
      compressed: ratios[index] > 3,
      zeroShare: total > 0 && member.share === 0,
    };
  });

  return {
    nodes,
    targetPoints: pointsAttribute(nodes.map((node) => node.target)),
    actualPoints: pointsAttribute(nodes.map((node) => node.actual)),
    center: { ...CENTER },
    radius,
  };
}
