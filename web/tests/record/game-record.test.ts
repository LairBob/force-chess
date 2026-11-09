import { describe, expect, it } from "vitest";
import {
  canGoBack,
  canGoForward,
  currentFen,
  first,
  fullmoveNumber,
  jump,
  last,
  moveNumber,
  next,
  play,
  previous,
  recordFromFen,
  recordFromGame,
  sideToMove,
} from "../../src/record/game-record.ts";
import { parsedGame } from "../games.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const AFTER_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
const AFTER_NF3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

const e4 = { from: "e2", to: "e4", promotion: null };
const e5 = { from: "e7", to: "e5", promotion: null };
const nf3 = { from: "g1", to: "f3", promotion: null };

describe("game record", () => {
  it("starts at the loaded position with no moves", () => {
    const record = recordFromFen(START);
    expect(currentFen(record)).toBe(START);
    expect(record.moves).toEqual([]);
    expect(canGoBack(record)).toBe(false);
    expect(canGoForward(record)).toBe(false);
  });

  it("appends a move and moves onto the resulting position", () => {
    const record = play(recordFromFen(START), e4, AFTER_E4);
    expect(currentFen(record)).toBe(AFTER_E4);
    expect(record.positions).toEqual([START, AFTER_E4]);
    expect(record.moves).toEqual([e4]);
    expect(canGoBack(record)).toBe(true);
  });

  it("navigates first, previous, next and last within the positions that exist", () => {
    const record = play(play(recordFromFen(START), e4, AFTER_E4), e5, AFTER_E5);
    expect(currentFen(first(record))).toBe(START);
    expect(currentFen(previous(record))).toBe(AFTER_E4);
    expect(currentFen(next(previous(record)))).toBe(AFTER_E5);
    expect(currentFen(last(first(record)))).toBe(AFTER_E5);
    expect(previous(first(record)).cursor).toBe(0);
    expect(next(record).cursor).toBe(2);
    expect(jump(record, 99).cursor).toBe(2);
    expect(jump(record, -5).cursor).toBe(0);
  });

  it("truncates the future when a move is played from the middle", () => {
    const record = play(play(recordFromFen(START), e4, AFTER_E4), e5, AFTER_E5);
    const branched = play(first(record), nf3, AFTER_NF3);
    expect(branched.positions).toEqual([START, AFTER_NF3]);
    expect(branched.moves).toEqual([nf3]);
    expect(branched.cursor).toBe(1);
    expect(canGoForward(branched)).toBe(false);
  });

  it("does not change the original record when navigating or playing", () => {
    const record = play(recordFromFen(START), e4, AFTER_E4);
    const moved = first(record);
    play(moved, nf3, AFTER_NF3);
    expect(record.cursor).toBe(1);
    expect(record.positions.length).toBe(2);
    expect(moved.cursor).toBe(0);
  });

  it("reads whose move it is from the FEN", () => {
    expect(sideToMove(START)).toBe("white");
    expect(sideToMove(AFTER_E4)).toBe("black");
    expect(sideToMove("8/8/8/8/8/8/8/8")).toBe("white");
  });

  it("numbers moves from the side that starts", () => {
    const fromWhite = play(play(recordFromFen(START), e4, AFTER_E4), e5, AFTER_E5);
    expect(moveNumber(fromWhite, 0)).toBe(1);
    expect(moveNumber(fromWhite, 1)).toBe(1);
    const fromBlack = play(recordFromFen(AFTER_E4), e5, AFTER_E5);
    expect(moveNumber(fromBlack, 0)).toBe(1);
    expect(moveNumber(play(fromBlack, nf3, AFTER_NF3), 1)).toBe(2);
  });
});

describe("a record built from an imported game", () => {
  const short = parsedGame("short-game");
  const record = recordFromGame(short);

  it("holds the start position and the position after each move, cursor on the start", () => {
    expect(record.positions.length).toBe(8);
    expect(record.positions[0]).toBe(short.startFen);
    expect(record.positions[7]).toBe(short.moves[6]?.fenAfter);
    expect(record.cursor).toBe(0);
    expect(currentFen(record)).toBe(START);
  });

  it("carries the squares and the notation of every move", () => {
    expect(record.moves[2]).toEqual({ from: "d1", to: "h5", promotion: null, san: "Qh5" });
    expect(record.moves.map((m) => m.san)).toEqual(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
  });

  it("keeps the headers and the game count for the shell", () => {
    expect(record.imported?.headers.white).toBe("Alice");
    expect(record.imported?.headers.result).toBe("1-0");
    expect(record.imported?.gamesInText).toBe(1);
    expect(recordFromGame(parsedGame("two-games")).imported?.gamesInText).toBe(2);
  });

  it("steps and jumps through the imported positions", () => {
    const third = jump(record, 3);
    expect(currentFen(third)).toBe(short.moves[2]?.fenAfter);
    expect(currentFen(next(third))).toBe(short.moves[3]?.fenAfter);
    expect(currentFen(previous(third))).toBe(short.moves[1]?.fenAfter);
    expect(last(record).cursor).toBe(7);
    expect(canGoForward(last(record))).toBe(false);
  });

  it("truncates the imported future when a move is played from the middle", () => {
    const branched = play(jump(record, 2), nf3, AFTER_NF3);
    expect(branched.positions).toEqual([START, short.moves[0]?.fenAfter, short.moves[1]?.fenAfter, AFTER_NF3]);
    expect(branched.moves.map((m) => m.san)).toEqual(["e4", "e5", undefined]);
    expect(branched.cursor).toBe(3);
    expect(canGoForward(branched)).toBe(false);
    expect(branched.imported?.headers.black).toBe("Bob");
  });

  it("numbers moves from the fullmove number of a FEN header", () => {
    const fromHeader = recordFromGame(parsedGame("from-fen-header"));
    expect(sideToMove(currentFen(fromHeader))).toBe("black");
    expect(moveNumber(fromHeader, 0)).toBe(30);
    expect(moveNumber(fromHeader, 1)).toBe(31);
    expect(moveNumber(fromHeader, 2)).toBe(31);
    expect(fullmoveNumber("8/8/8/8/8/8/8/8")).toBe(1);
  });
});
