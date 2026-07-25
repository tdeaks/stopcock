import { describe, expect, it } from "vite-plus/test";
import bank from "../../codegen/generated/fusion-runner-bank-v1.json";
import {
  OP_COUNT,
  OP_EVERY,
  OP_FILTER,
  OP_FILTER_MAP,
  OP_FIND,
  OP_FIND_INDEX,
  OP_FIND_MAP,
  OP_FLAT_MAP,
  OP_MAP,
  OP_NONE,
  OP_REDUCE,
  OP_REJECT,
  OP_SOME,
  OP_SUM,
  OP_TAKE,
} from "@stopcock/fp/abi";
import type { ConsumeMeta, StepBinding } from "@stopcock/fp/abi";
import { ARRAY_TEMPLATES, SINK_TEMPLATES, type PortableTemplateFn } from "../portable-templates";

/**
 * S10. A descriptor that only declares its behaviour is worth nothing — the
 * stage exists because runner policy used to live in three places and agree
 * with none of them. So every descriptor is executed against the runner it
 * claims to describe, and each declared fact is checked against what actually
 * happened.
 */

interface Descriptor {
  readonly runnerId: string;
  readonly semanticSequence: readonly number[];
  readonly outputShape: "array" | "scalar" | "option" | "boolean" | "index";
  readonly cardinality: "one-to-one" | "filtering" | "folding" | "expanding";
  readonly termination: "exhaustive" | "limit" | "predicate";
  readonly materializes: boolean;
  readonly domainBoundary: "none" | "sum-materializer";
  readonly reportsConsumed: boolean;
  readonly resultOwnership: "fresh" | "borrowed";
  readonly aliasesInput: boolean;
  readonly allocationScope: "none" | "result-only" | "scratch";
  readonly capability: { readonly arity: number };
  readonly descriptorHash: string;
  readonly bankHash: string;
}

const descriptors = bank.descriptors as unknown as readonly Descriptor[];

/** runnerId -> the runner the bank actually ships for it. */
const runners = new Map<string, PortableTemplateFn>();
for (const entry of ARRAY_TEMPLATES) runners.set(`fusion-runner/array/${entry.key}`, entry.run);
for (const entry of SINK_TEMPLATES) {
  const key = entry.kind === "sum" ? entry.key : entry.opcodes.join(",");
  runners.set(`fusion-runner/sink/${key}`, entry.run);
}

/**
 * One binding per opcode.
 *
 * Every filtering stage must actually drop something in every chain position,
 * or the cardinality assertions below pass vacuously — the first version of
 * this fixture used callbacks that kept everything, and a descriptor lying
 * about its cardinality went undetected. All source values are positive
 * integers and `map` only doubles, so parity and divisibility rules stay
 * discriminating wherever the stage lands in a chain.
 */
const bindingFor = (op: number): StepBinding => {
  switch (op) {
    case OP_MAP:
      return { fn: (x: unknown) => (x as number) * 2 };
    case OP_FILTER:
      return { fn: (x: unknown) => (x as number) % 2 === 1 };
    case OP_REJECT:
      return { fn: (x: unknown) => (x as number) % 2 === 0 };
    case OP_FILTER_MAP:
      return { fn: (x: unknown) => ((x as number) % 3 === 0 ? null : x) };
    case OP_FLAT_MAP:
      return { fn: (x: unknown) => [x, x] };
    case OP_TAKE:
      return { a1: 2 };
    case OP_REDUCE:
      return { fn: (acc: unknown, x: unknown) => (acc as number) + (x as number), a1: 0 };
    case OP_COUNT:
      return { fn: () => true };
    // `every` short-circuits on a false predicate, every other short-circuit
    // sink stops on a true one. Both must actually stop for the termination
    // and consumption facts to be worth checking.
    case OP_EVERY:
      return { fn: () => false };
    case OP_SOME:
    case OP_FIND:
    case OP_FIND_INDEX:
    case OP_NONE:
      return { fn: () => true };
    case OP_FIND_MAP:
      return { fn: (x: unknown) => x };
    case OP_SUM:
      return {};
    default:
      throw new Error(`no test binding for opcode ${op}`);
  }
};

const SOURCE: readonly unknown[] = [1, 2, 3, 4, 5];

const FILTERING_OPS: readonly number[] = [OP_FILTER, OP_REJECT, OP_FILTER_MAP];

/** True when nothing upstream of the sink can drop an element. */
const passesEverythingThrough = (sequence: readonly number[]): boolean =>
  !sequence.some((op) => FILTERING_OPS.includes(op));

const isOption = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "_tag" in (value as object);

describe("the fusion runner bank", () => {
  it("describes exactly the runners it ships", () => {
    const described = descriptors.map((d) => d.runnerId).sort();
    expect(described).toEqual([...runners.keys()].sort());
  });

  it("binds every runner ID to one bank identity", () => {
    expect(new Set(descriptors.map((d) => d.bankHash)).size).toBe(1);
    expect(bank.bankHash).toBe(descriptors[0].bankHash);
  });

  it("gives every runner a distinct descriptor hash", () => {
    // Two runners with identical declared behaviour would be a generation bug:
    // the semantic sequence is part of the projection.
    expect(new Set(descriptors.map((d) => d.descriptorHash)).size).toBe(descriptors.length);
  });

  it("never claims a runner may alias or borrow its input", () => {
    for (const d of descriptors) {
      expect(d.aliasesInput).toBe(false);
      expect(d.resultOwnership).toBe("fresh");
    }
  });

  it("keeps the descriptor free of anything executable", () => {
    // Data-only is a hard contract: no callback, binding, or provenance may
    // cross through a descriptor into selection.
    const walk = (value: unknown): void => {
      expect(typeof value).not.toBe("function");
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(bank);
  });
});

describe("every descriptor matches the runner it describes", () => {
  it.each(descriptors.map((d) => [d.runnerId, d] as const))("%s", (_id, descriptor) => {
    const run = runners.get(descriptor.runnerId);
    expect(run).toBeDefined();

    const bindings = descriptor.semanticSequence.map(bindingFor);
    const meta: ConsumeMeta = { consumed: SOURCE.length };
    const limit = descriptor.termination === "limit" ? 2 : -1;
    const result = (run as PortableTemplateFn)(SOURCE, bindings, 0, limit, meta);

    // Arity is the contract the caller has to satisfy.
    expect(descriptor.capability.arity).toBe(descriptor.semanticSequence.length);

    switch (descriptor.outputShape) {
      case "array":
        expect(Array.isArray(result)).toBe(true);
        break;
      case "boolean":
        expect(typeof result).toBe("boolean");
        break;
      case "option":
      case "index":
        expect(isOption(result)).toBe(true);
        break;
      case "scalar":
        expect(typeof result).toBe("number");
        break;
    }

    expect(descriptor.materializes).toBe(Array.isArray(result));
    if (Array.isArray(result)) {
      // Fresh ownership: the runner must not hand back the caller's array.
      expect(result).not.toBe(SOURCE);
    }

    if (descriptor.termination === "exhaustive") {
      // Strict, not `<=`: the fixture guarantees every filtering stage drops
      // something, so a filtering runner that returns the full length is
      // either mis-declared or not filtering.
      if (descriptor.cardinality === "one-to-one") {
        expect((result as unknown[]).length).toBe(SOURCE.length);
      }
      if (descriptor.cardinality === "filtering") {
        expect((result as unknown[]).length).toBeLessThan(SOURCE.length);
      }
      if (descriptor.cardinality === "expanding" && passesEverythingThrough(descriptor.semanticSequence)) {
        expect((result as unknown[]).length).toBeGreaterThan(SOURCE.length);
      }
    }
    if (descriptor.termination === "limit") {
      expect((result as unknown[]).length).toBeLessThanOrEqual(2);
    }
    if (descriptor.cardinality === "folding") {
      expect(Array.isArray(result)).toBe(false);
    }

    // reportsConsumed is the accounting contract: a runner that stops early
    // must credit the elements it actually read, not the source length. Every
    // short-circuit sink here is bound to fire on its first reachable element,
    // so when nothing upstream can drop one the credit is exactly 1.
    if (!descriptor.reportsConsumed) {
      expect(meta.consumed).toBe(SOURCE.length);
    } else if (
      descriptor.termination === "predicate" &&
      passesEverythingThrough(descriptor.semanticSequence)
    ) {
      expect(meta.consumed).toBe(1);
    } else {
      expect(meta.consumed).toBeGreaterThan(0);
      expect(meta.consumed).toBeLessThanOrEqual(SOURCE.length);
    }
  });
});
