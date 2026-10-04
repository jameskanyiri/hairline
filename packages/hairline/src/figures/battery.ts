import { Cam, circ, clamp, facing, fit, lerp, open, prism, proj, rings, ringAt, run, type Ring, type Vec2 } from "../core/iso";
import { spring, stepS, type Spring } from "../core/motion";
import { disposer, mk, pointer, put, register, solid, type FigureMount, type Solid } from "../core/stage";

/**
 * Battery: a pack of five cylindrical cells standing in a tray, a terminal on
 * each cap and bus bars linking them. Each cell shows its charge as a level
 * line round its front, with a band for every step of charge below it. The
 * pointer's height sets the charge: the cell nearest it goes all the way, the
 * others less the further away, each on its own spring. At rest the cells sit
 * at uneven charges, as a pack drifts. The slider is the spread, in cells.
 *
 * The pattern: a continuous scrub over a row of parts. A spring per cell, a
 * falloff by distance with a floor, the level clamped inside the cell, and a
 * hit test on the cells' fixed rest silhouettes.
 */

const N = 5, GAP = 27, CR = 10.5, CH = 62, TB = 4, SEG = 10.5, LO = 5, HI = CH - 6;
const REST = [0.72, 0.48, 0.86, 0.6, 0.34], LIT0 = 2;

/** The share of the pointer's charge a cell takes, u cells away from the nearest: all of it, down to a floor at R. */
const falloff = (u: number, R: number) => clamp(1 - u / R, 0.12, 1);

type Cell = { i: number; x: number; el: Solid; bands: SVGPathElement; level: SVGPathElement; cx: number; top: number; foot: number; r0: number; sp: Spring; drawn: number };

export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let R = value, over: Vec2 | null = null, lit: Cell | null = null;
  const C = Cam(45, 0.5, 1.66);
  const X1 = (N - 1) * GAP + CR + 6;
  fit(C, [[-CR - 6, -CR - 6, -TB], [X1, CR + 6, -TB], [X1, -CR - 6, -TB], [-CR - 6, CR + 6, -TB], [0, 0, CH + 6], [X1, 0, CH + 6]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [tr, ti] = rings(-CR - 6, -CR - 6, X1, CR + 6, 8, 2);
  put(solid(g), prism(P, front, tr, ti, -TB, 2));

  const at = (x: number, ring: Ring): Ring => ring.map((q) => ({ ...q, u: q.u + x }));
  const body = circ(CR, 32), cap = circ(CR - 1.4, 32), term = circ(3, 16), termIn = circ(2, 16);
  // Back to front along x: each cell's body, then its level marks on its front, then its terminal.
  const cells: Cell[] = REST.map((r0, i) => {
    const x = i * GAP;
    const el = solid(g);
    put(el, prism(P, front, at(x, body), at(x, cap), 2, CH));
    const bands = mk("path", { class: "nf lo" }, g) as SVGPathElement, level = mk("path", { class: "nf sil" }, g) as SVGPathElement;
    put(solid(g), prism(P, front, at(x, term), at(x, termIn), CH, CH + 3.5));
    const top = P(x, 0, CH)[1], foot = P(x, 0, 2)[1], cx = P(x, 0, CH / 2)[0];
    return { i, x, el, bands, level, cx, top, foot, r0, sp: spring(lerp(LO, HI, r0), { eps: 0.05 }), drawn: NaN };
  });
  // The bus bars lie across the caps, above everything, so they paint last.
  for (let i = 0; i < N - 1; i++) {
    const [br, bi] = rings(i * GAP - 1.8, -2.4, (i + 1) * GAP + 1.8, 2.4, 2.2, 0.7);
    put(solid(g), prism(P, front, br, bi, CH + 3.5, CH + 5));
  }

  const frontRun = (x: number, z: number) => open(ringAt(P, run(at(x, body), front), z));
  function drawCell(c: Cell) {
    const h = c.sp.x;
    if (h === c.drawn) return;
    c.drawn = h;
    c.level.setAttribute("d", frontRun(c.x, h));
    let d = "";
    for (let z = 2 + SEG; z < h - 3; z += SEG) d += frontRun(c.x, z);
    c.bands.setAttribute("d", d);
  }
  function light(c: Cell) {
    if (c === lit) return;
    // One highlight for one cell: its outline and its level line.
    lit?.el.sil.classList.remove("hi"); lit?.level.classList.remove("hi");
    lit = c;
    c.el.sil.classList.add("hi"); c.level.classList.add("hi");
  }

  const L = register(stage, (dt) => {
    let m = false;
    for (const c of cells) { if (stepS(c.sp, dt)) m = true; drawCell(c); }
    return m;
  });
  bag.add(L.unregister);

  /** The charge under the pointer, read against the nearest cell's fixed foot and cap, never its level on screen. */
  function retarget() {
    if (!over) {
      for (const c of cells) c.sp.t = lerp(LO, HI, c.r0);
      light(cells[LIT0]);
      read.textContent = "rest";
    } else {
      const at = over;
      const near = cells.reduce((a, b) => (Math.abs(b.cx - at[0]) < Math.abs(a.cx - at[0]) ? b : a));
      const q = clamp((near.foot - at[1]) / (near.foot - near.top), 0, 1);
      for (const c of cells) c.sp.t = lerp(lerp(LO, HI, c.r0), lerp(LO, HI, q), falloff(Math.abs(c.i - near.i), R));
      light(near);
      read.textContent = `cell ${near.i + 1} · ${Math.round(q * 100)}%`;
    }
    L.wake();
  }
  light(cells[LIT0]);

  bag.add(pointer(stage, {
    move: (q) => { over = q; retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { R = v; if (over) retarget(); },
    destroy: bag.dispose,
  };
};
