import { describe, expect, it } from "vitest";
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
  sideToMove,
} from "../../src/record/game-record.ts";

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
