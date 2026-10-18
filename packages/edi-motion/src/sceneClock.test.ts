import { expect, test } from "vitest";
import { createSceneClock, type ScopeAdvance, type ScopeCallbacks } from "./sceneClock";

test("coordinated geometry limits validate all selected and unselected scopes before any commit, including reset and direct writes", () => {
  const clock = createSceneClock(),
    commits: string[] = [];
  function scope(id: string) {
    const state = { vertices: 50000, next: 50000, reset: 50000 };
    function plan(vertices: number): ScopeAdvance {
      return {
        events: 0,
        lines: 0,
        vertices,
        continuing: false,
        commit() {
          state.vertices = vertices;
          commits.push(id);
          return () => {};
        },
      };
    }
    const callbacks: ScopeCallbacks = {
      paint() {},
      hasActivity: () => false,
      prepareAdvance(_seconds, playing) {
        return plan(playing ? state.next : state.vertices);
      },
      prepareReset() {
        return plan(state.reset);
      },
    };
    return { state, callbacks };
  }
  const root = scope("root"),
    child = scope("child");
  clock.register([], 1, root.callbacks, { autoplay: false });
  clock.register(["node-child"], 1, child.callbacks, { autoplay: false });
  clock.advance([], 0.1);
  expect(commits).toEqual(["root", "child"]);
  root.state.next = 50001;
  expect(() => clock.advance([], 0.1)).toThrow(/geometria transitória/);
  expect(commits).toEqual(["root", "child"]);
  expect(root.state.vertices).toBe(50000);
  child.state.next = 50001;
  expect(() => clock.advance(["node-child"], 0.1)).toThrow(/geometria transitória/);
  expect(() => clock.validateFrame(["node-child"], 0, 50001)).toThrow(/geometria transitória/);
  root.state.reset = 60000;
  expect(() => clock.reset([])).toThrow(/geometria transitória/);
  expect(commits).toEqual(["root", "child"]);
  root.state.reset = 40000;
  clock.reset([]);
  expect(root.state.vertices).toBe(40000);
  expect(child.state.vertices).toBe(50000);
  clock.validateFrame(["node-child"], 0, 60000);
  clock.destroy();
});
