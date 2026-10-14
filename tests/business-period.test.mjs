import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync(new URL("../hooks/use-business-period.ts", import.meta.url), "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatch(name) { for (const listener of [...(listeners.get(name) || [])]) listener(); },
    count() { return [...listeners.values()].reduce((total, items) => total + items.size, 0); },
  };
}

// Run the real hook with a clock and event loop that never wait for wall time.
function harness(initialTime) {
  let now = Date.parse(initialTime), cursor = 0, timerId = 0;
  const slots = [], effects = [], timers = new Map();
  const window = eventTarget();
  const document = Object.assign(eventTarget(), {visibilityState: "visible"});
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= {value: typeof initial === "function" ? initial() : initial};
      return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !depsEqual(slots[index].deps, deps)) slots[index] = {fn, deps};
      return slots[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !depsEqual(slots[index].deps, deps)) {
        const old = slots[index];
        slots[index] = {deps};
        effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  class ClockDate extends Date { static now() { return now; } }
  const exports = {};
  vm.runInNewContext(source, {
    exports, module: {exports}, Date: ClockDate, window, document,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn, at: now + delay, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) { assert.equal(name, "react"); return react; },
  });
  const render = () => {
    cursor = 0;
    const result = exports.useBusinessPeriod();
    while (effects.length) effects.shift()();
    return result;
  };
  return {
    render, window, document, exports, timers,
    setTime(value) { now = Date.parse(value); },
    advanceTo(value) {
      now = Date.parse(value);
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= now);
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
    },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}

test("current display month advances at Japan midnight while the tab stays open", () => {
  const h = harness("2026-10-31T14:59:59.000Z");
  assert.equal(h.render().today, "2026-10-31");
  assert.equal(h.render().month, "2026-10");
  assert.equal([...h.timers.values()][0].delay, 1_100);
  h.advanceTo("2026-10-31T15:00:00.100Z");
  assert.equal(h.render().today, "2026-11-01");
  assert.equal(h.render().currentMonth, "2026-11");
  assert.equal(h.render().month, "2026-11");
  assert.equal(h.render().followingCurrentMonth, true);
  assert.equal(h.timers.size, 1);
  h.unmount();
});

test("manually selected months stay pinned until returning to the current month", () => {
  const h = harness("2026-10-31T14:59:59.000Z");
  h.render().selectMonth("2026-09");
  h.advanceTo("2026-10-31T15:00:00.100Z");
  assert.equal(h.render().today, "2026-11-01");
  assert.equal(h.render().month, "2026-09");
  assert.equal(h.render().followingCurrentMonth, false);
  h.render().followCurrentMonth();
  assert.equal(h.render().month, "2026-11");
  assert.equal(h.render().followingCurrentMonth, true);
  h.unmount();
});

test("explicitly selecting this month also pins that historical view after rollover", () => {
  const h = harness("2026-10-31T14:59:59.000Z");
  h.render().selectMonth("2026-10");
  h.advanceTo("2026-10-31T15:00:00.100Z");
  assert.equal(h.render().month, "2026-10");
  assert.equal(h.render().currentMonth, "2026-11");
  assert.equal(h.render().followingCurrentMonth, false);
  h.unmount();
});

test("focus, restored pages, and visible tabs immediately catch up after sleep", () => {
  for (const event of ["focus", "pageshow", "visibilitychange"]) {
    const h = harness("2026-12-31T14:00:00.000Z");
    h.render();
    h.setTime("2027-01-03T00:00:00.000Z");
    if (event === "visibilitychange") h.document.dispatch(event);
    else h.window.dispatch(event);
    assert.equal(h.render().today, "2027-01-03");
    assert.equal(h.render().month, "2027-01");
    assert.equal(h.timers.size, 1);
    h.unmount();
  }
});

test("a hidden visibility event waits until the tab becomes visible", () => {
  const h = harness("2026-10-31T14:00:00.000Z");
  h.render();
  h.setTime("2026-11-01T01:00:00.000Z");
  h.document.visibilityState = "hidden";
  h.document.dispatch("visibilitychange");
  assert.equal(h.render().month, "2026-10");
  h.document.visibilityState = "visible";
  h.document.dispatch("visibilitychange");
  assert.equal(h.render().month, "2026-11");
  h.unmount();
});

test("returning to current month resamples the clock even before resume events", () => {
  const h = harness("2026-10-31T14:00:00.000Z");
  h.render().selectMonth("2026-09");
  h.setTime("2026-11-01T01:00:00.000Z");
  h.render().followCurrentMonth();
  assert.equal(h.render().today, "2026-11-01");
  assert.equal(h.render().month, "2026-11");
  h.unmount();
});

test("Japan calendar boundaries handle leap years, short months, and year ends", () => {
  const cases = [
    ["2028-02-28T15:00:00.000Z", "2028-02-29"],
    ["2028-02-29T15:00:00.000Z", "2028-03-01"],
    ["2027-02-28T15:00:00.000Z", "2027-03-01"],
    ["2026-04-30T15:00:00.000Z", "2026-05-01"],
    ["2026-12-31T15:00:00.000Z", "2027-01-01"],
  ];
  for (const [time, expected] of cases) {
    const h = harness(time);
    assert.equal(h.render().today, expected);
    assert.equal(h.render().month, expected.slice(0, 7));
    assert.equal(h.exports.millisecondsUntilBusinessMidnight(Date.parse(time)), 86_400_100);
    h.unmount();
  }
});

test("invalid selected months leave the current selection intact", () => {
  const h = harness("2026-10-14T12:00:00.000Z");
  h.render().selectMonth("2026-09");
  for (const month of ["", "2026-0", "2026-00", "2026-13", "2026-10-01", "0000-01", "all"]) h.render().selectMonth(month);
  assert.equal(h.render().month, "2026-09");
  h.unmount();
});

test("unmount removes listeners and timers, including late timer callbacks", () => {
  const h = harness("2026-10-31T14:59:59.000Z");
  h.render();
  const lateCallback = [...h.timers.values()][0].fn;
  assert.equal(h.window.count(), 2);
  assert.equal(h.document.count(), 1);
  h.unmount();
  assert.equal(h.timers.size, 0);
  assert.equal(h.window.count(), 0);
  assert.equal(h.document.count(), 0);
  h.setTime("2026-11-01T01:00:00.000Z");
  lateCallback();
  assert.equal(h.timers.size, 0);
  assert.equal(h.render().today, "2026-10-31");
});
