// The web shell (concept section 8): hosts the projections, owns the board,
// input, navigation and panels. State lives here; the projections are pure
// and the game record is pure. This is the only place that reacts to the DOM.

import type { Color, Layer, Promotion, Square } from "../contract/index.ts";
import { LAYERS } from "../contract/index.ts";
import { isCoreError, loadForceCore, type ForceCore } from "../core/force-core.ts";
import {
  boardScene,
  destinations,
  type Orientation,
  LAYER_EXPLANATIONS,
  LAYER_NAMES,
  moveNotation,
  piecePanel,
  promotionChoices,
  squarePanel,
  tallyLegend,
} from "../projections/index.ts";
import type { ForceState } from "../contract/index.ts";
import {
  canGoBack,
  canGoForward,
  currentFen,
  first,
  jump,
  last,
  moveNumber,
  next,
  play,
  previous,
  recordFromFen,
  recordFromGame,
  describeImportedGame,
  sideToMove,
  type GameRecord,
} from "../record/game-record.ts";
import { createPositionCache } from "./cache.ts";
import { el, replaceChildren } from "./dom.ts";
import { markNode, renderBoard, renderReadout } from "./render-board.ts";
import { renderPanel } from "./render-panels.ts";
import "./fonts.ts";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface ShellState {
  record: GameRecord;
  layer: Layer;
  /** The side at the bottom of the screen. A viewing choice, so it is kept out of the URL and not stored. */
  orientation: Orientation;
  selected: Square | null;
  hovered: Square | null;
  /** A promotion waiting for the piece to be chosen. */
  pendingPromotion: { from: Square; to: Square; choices: Promotion[] } | null;
  /** The last refusal from the core, shown until the next successful action. */
  message: string | null;
}

interface Measured {
  state: ForceState;
  bytes: number;
  milliseconds: number;
}

function initialFen(): string {
  const fromHash = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  return fromHash.length > 0 ? fromHash : STARTING_FEN;
}

async function start(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("The page has no #app element.");

  const core: ForceCore = await loadForceCore();
  // Bounded: a long game or an imported one would otherwise hold every position for good.
  const cache = createPositionCache<Measured>();
  const analyse = (fen: string): Measured => {
    const cached = cache.get(fen);
    if (cached) return cached;
    const analysis = core.analyze(fen);
    cache.set(fen, analysis);
    return analysis;
  };

  // The initial position must analyse, or the shell has nothing to show.
  let startFen = initialFen();
  let startMessage: string | null = null;
  try {
    analyse(startFen);
  } catch (error) {
    if (!isCoreError(error)) throw error;
    startMessage = error.text;
    startFen = STARTING_FEN;
    analyse(startFen);
  }

  const shell: ShellState = {
    record: recordFromFen(startFen),
    layer: "L0",
    orientation: "white",
    selected: null,
    hovered: null,
    pendingPromotion: null,
    message: startMessage,
  };

  // Static structure. Only the contents of these containers are rebuilt.
  const fenInput = el("input", {
    type: "text",
    id: "fen-input",
    spellcheck: "false",
    "aria-label": "FEN of the position to load",
    placeholder: "Paste a FEN and press Load",
  }) as HTMLInputElement;
  const loadButton = el("button", { type: "submit", id: "load-fen" }, "Load");
  const pgnInput = el("textarea", {
    id: "pgn-input",
    spellcheck: "false",
    rows: "3",
    "aria-label": "PGN of a game to load",
    placeholder: "Paste a game in PGN and press Load game",
  }) as HTMLTextAreaElement;
  const loadPgnButton = el("button", { type: "submit", id: "load-pgn" }, "Load game");
  const messageLine = el("p", { id: "message", role: "status" });
  const statusLine = el("p", { id: "status" });
  const layerSelector = el("div", { id: "layer-selector", role: "radiogroup", "aria-label": "Layer" });
  const layerNote = el("p", { id: "layer-note" });
  const flipButton = el("button", { type: "button", id: "flip-board" }, "Flip board");
  const boardNode = el("div", { id: "board", role: "grid", "aria-label": "Board" });
  const boardFrame = el("div", { id: "board-frame" }, boardNode);
  const readoutStrip = el("div", { id: "readout", role: "status", "aria-label": "Figures of the square being read" });
  const navigation = el("div", { id: "navigation" });
  const gameLine = el("p", { id: "game-headers" });
  const moveList = el("ol", { id: "move-list" });
  const promotionNode = el("div", { id: "promotion" });
  const piecePanelNode = el("section", { id: "piece-panel", className: "panel", "aria-label": "Current piece" });
  const squarePanelNode = el("section", { id: "square-panel", className: "panel", "aria-label": "Current square" });
  const legend = el(
    "dl",
    { id: "legend" },
    ...tallyLegend().flatMap((entry) => [el("dt", {}, markNode(entry.meaning), entry.label), el("dd", {}, entry.value)]),
  );

  replaceChildren(
    app,
    el(
      "header",
      { id: "top" },
      el("h1", {}, "Force Chess"),
      el("p", { className: "tagline" }, "The raw values: one mark per piece reaching each square, nothing scaled, nothing hidden."),
      el(
        "div",
        { id: "inputs" },
        el("form", { id: "fen-form" }, fenInput, loadButton),
        el("form", { id: "pgn-form" }, pgnInput, loadPgnButton),
      ),
      messageLine,
    ),
    el(
      "main",
      { id: "layout" },
      el(
        "div",
        { id: "board-column" },
        el("div", { id: "toolbar" }, layerSelector, flipButton, layerNote),
        boardFrame,
        readoutStrip,
        statusLine,
        legend,
      ),
      el(
        "div",
        { id: "side-column" },
        el("section", { id: "record", "aria-label": "Game record" }, el("h2", {}, "Moves"), gameLine, navigation, moveList, promotionNode),
        piecePanelNode,
        squarePanelNode,
      ),
    ),
  );

  const currentState = (): Measured => analyse(currentFen(shell.record));
  let shownFen: string | null = null;

  function setLayer(layer: Layer): void {
    shell.layer = layer;
    render();
  }

  /** Turns the board half a turn. Nothing is analysed again: the same positions are drawn from the other side. */
  function flip(): void {
    shell.orientation = shell.orientation === "white" ? "black" : "white";
    render();
  }

  function loadFen(fen: string): void {
    const trimmed = fen.trim();
    if (trimmed.length === 0) return;
    try {
      analyse(trimmed);
    } catch (error) {
      if (!isCoreError(error)) throw error;
      shell.message = error.text;
      render();
      return;
    }
    shell.record = recordFromFen(trimmed);
    shell.selected = null;
    shell.pendingPromotion = null;
    shell.message = null;
    window.location.hash = encodeURIComponent(trimmed);
    render();
  }

  function loadPgn(text: string): void {
    if (text.trim().length === 0) return;
    let record: GameRecord;
    try {
      record = recordFromGame(core.parseGame(text));
      // The start position is analysed now; every other position waits
      // until the cursor lands on it.
      analyse(currentFen(record));
    } catch (error) {
      if (!isCoreError(error)) throw error;
      shell.message = error.text;
      render();
      return;
    }
    shell.record = record;
    shell.selected = null;
    shell.pendingPromotion = null;
    shell.message = null;
    render();
  }

  function makeMove(from: Square, to: Square, promotion: Promotion | null): void {
    const fen = currentFen(shell.record);
    let after: string;
    try {
      after = core.applyMove(fen, from, to, promotion);
      analyse(after);
    } catch (error) {
      if (!isCoreError(error)) throw error;
      shell.message = error.text;
      shell.pendingPromotion = null;
      render();
      return;
    }
    shell.record = play(shell.record, { from, to, promotion }, after);
    shell.selected = null;
    shell.pendingPromotion = null;
    shell.message = null;
    render();
  }

  function onSquareClick(square: Square): void {
    const { state } = currentState();
    const toMove = sideToMove(currentFen(shell.record));
    const selected = shell.selected;
    shell.pendingPromotion = null;
    if (selected !== null && selected !== square && state.pieces[selected]?.color === toMove) {
      const moves = destinations(state, selected);
      if (moves.has(square)) {
        const choices = promotionChoices(state, selected, square);
        if (choices.length > 0) {
          shell.pendingPromotion = { from: selected, to: square, choices };
          render();
          return;
        }
        makeMove(selected, square, null);
        return;
      }
    }
    shell.selected = selected === square ? null : square;
    render();
  }

  function onSquareHover(square: Square | null): void {
    if (shell.hovered === square) return;
    shell.hovered = square;
    render();
  }

  function navigate(to: (record: GameRecord) => GameRecord): void {
    const moved = to(shell.record);
    if (moved === shell.record) return;
    shell.record = moved;
    shell.selected = null;
    shell.pendingPromotion = null;
    render();
  }

  function renderControls(state: ForceState, toMove: Color): void {
    replaceChildren(
      layerSelector,
      ...LAYERS.map((layer) =>
        el(
          "label",
          { className: `layer-option${layer === shell.layer ? " active" : ""}` },
          (() => {
            const input = el("input", {
              type: "radio",
              name: "layer",
              value: layer,
              checked: layer === shell.layer,
            }) as HTMLInputElement;
            input.addEventListener("change", () => setLayer(layer));
            return input;
          })(),
          LAYER_NAMES[layer],
        ),
      ),
    );
    layerNote.textContent = LAYER_EXPLANATIONS[shell.layer];
    const bottom = shell.orientation === "white" ? "White" : "Black";
    const top = shell.orientation === "white" ? "black" : "white";
    flipButton.title = `${bottom} is at the bottom. Press to look at the board from ${top}'s side (shortcut: f).`;
    flipButton.setAttribute("aria-label", `Flip the board. ${bottom} is at the bottom.`);
    boardFrame.dataset["bottom"] = shell.orientation;

    const sides = (["white", "black"] as const).map(
      (color) => `${color === "white" ? "White" : "Black"}: ${state.sides[color].status}, ${state.sides[color].legalMoveCount} legal moves`,
    );
    statusLine.textContent = `${toMove === "white" ? "White" : "Black"} to move. ${sides.join(". ")}. Document: ${currentState().bytes.toLocaleString()} bytes, analysed in ${currentState().milliseconds.toFixed(1)} ms.`;
    statusLine.dataset["sideToMove"] = toMove;
    messageLine.textContent = shell.message ?? "";
    messageLine.classList.toggle("has-message", shell.message !== null);
    // The input shows the current position, but a pasted FEN waiting to be loaded is left alone.
    const fen = currentFen(shell.record);
    if (fen !== shownFen) {
      fenInput.value = fen;
      shownFen = fen;
    }

    const button = (label: string, title: string, enabled: boolean, action: () => void) => {
      const node = el("button", { type: "button", title, disabled: !enabled }, label);
      node.addEventListener("click", action);
      return node;
    };
    replaceChildren(
      navigation,
      button("|<", "First position (Home)", canGoBack(shell.record), () => navigate(first)),
      button("<", "Previous position (left arrow)", canGoBack(shell.record), () => navigate(previous)),
      button(">", "Next position (right arrow)", canGoForward(shell.record), () => navigate(next)),
      button(">|", "Last position (End)", canGoForward(shell.record), () => navigate(last)),
    );

    gameLine.textContent = shell.record.imported ? describeImportedGame(shell.record.imported) : "";
    gameLine.hidden = !shell.record.imported;

    const items = shell.record.moves.map((move, index) => {
      const number = moveNumber(shell.record, index);
      const sideOfMove = sideToMove(shell.record.positions[index] ?? "");
      const prefix = sideOfMove === "white" ? `${number}. ` : index === 0 ? `${number}... ` : "";
      // An imported move is shown as the text wrote it. A move played on the
      // board has no notation, so its kind is read from the force state of
      // the position it was played from, which was analysed when shown.
      const notation =
        move.san ??
        moveNotation({
          ...move,
          kind: analyse(shell.record.positions[index] ?? "").state.relations.lookaheads.find(
            (entry) => entry.move.from === move.from && entry.move.to === move.to && entry.move.promotion === move.promotion,
          )?.move.kind,
        });
      const node = el(
        "li",
        { className: index + 1 === shell.record.cursor ? "current" : "", "data-move-index": String(index) },
        el("button", { type: "button", className: "move" }, `${prefix}${notation}`),
      );
      node.querySelector("button")?.addEventListener("click", () => navigate((r) => jump(r, index + 1)));
      return node;
    });
    replaceChildren(moveList, ...(items.length > 0 ? items : [el("li", { className: "placeholder" }, "No moves yet. Click a piece, then a square, or paste a game above.")]));

    if (shell.pendingPromotion) {
      const pending = shell.pendingPromotion;
      replaceChildren(
        promotionNode,
        el("p", {}, `The pawn on ${pending.from} promotes on ${pending.to}. It becomes a:`),
        ...pending.choices.map((choice) => {
          const node = el("button", { type: "button", "data-promotion": choice }, choice);
          node.addEventListener("click", () => makeMove(pending.from, pending.to, choice));
          return node;
        }),
      );
    } else {
      replaceChildren(promotionNode);
    }
  }

  function render(): void {
    const { state } = currentState();
    document.documentElement.dataset["analysedPositions"] = String(cache.size);
    const toMove = sideToMove(currentFen(shell.record));
    const board = boardScene(state, {
      layer: shell.layer,
      selected: shell.selected,
      hovered: shell.hovered,
      sideToMove: toMove,
      orientation: shell.orientation,
    });
    renderBoard(boardNode, board, { onSquareClick, onSquareHover });
    renderReadout(readoutStrip, board.readout);
    renderControls(state, toMove);
    renderPanel(
      piecePanelNode,
      shell.selected ? piecePanel(state, shell.selected) : null,
      shell.selected ? `No piece on ${shell.selected}. Select a piece to see everything the document says about it.` : "Select a piece to see everything the document says about it.",
    );
    renderPanel(
      squarePanelNode,
      shell.selected ? squarePanel(state, shell.selected) : null,
      "Select a square to see who reaches it and the numbers behind the marks.",
    );
  }

  boardNode.addEventListener("mouseleave", () => onSquareHover(null));
  flipButton.addEventListener("click", flip);
  document.getElementById("fen-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadFen(fenInput.value);
  });
  document.getElementById("pgn-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadPgn(pgnInput.value);
  });
  document.addEventListener("keydown", (event) => {
    if (event.target === fenInput || event.target === pgnInput) return;
    switch (event.key) {
      case "ArrowLeft":
        navigate(previous);
        break;
      case "ArrowRight":
        navigate(next);
        break;
      case "Home":
        navigate(first);
        break;
      case "End":
        navigate(last);
        break;
      case "Escape":
        shell.selected = null;
        shell.pendingPromotion = null;
        render();
        break;
      case "f":
        // A plain f only: the browser keeps Ctrl+F and the like.
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        flip();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  render();

  // Measurements for the first position, readable by the smoke test.
  const initial = currentState();
  const root = document.documentElement;
  root.dataset["ready"] = "true";
  root.dataset["readyMs"] = performance.now().toFixed(0);
  root.dataset["documentBytes"] = String(initial.bytes);
  root.dataset["analyzeMs"] = initial.milliseconds.toFixed(1);
  root.dataset["contractVersion"] = core.contractVersion;
}

start().catch((error: unknown) => {
  const app = document.getElementById("app");
  const text = error instanceof Error ? error.message : String(error);
  if (app) replaceChildren(app, el("p", { className: "fatal" }, `Force Chess could not start: ${text}`));
  throw error;
});
