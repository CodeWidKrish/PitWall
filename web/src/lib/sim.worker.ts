/// <reference lib="webworker" />
import { type SimInputs, simulate, type WhatIf } from "@/lib/sim";

// Runs the season simulation off the main thread so scrolling and animation stay smooth.
self.onmessage = (e: MessageEvent<{ id: number; inputs: SimInputs; whatIf: WhatIf }>) => {
  const { id, inputs, whatIf } = e.data;
  const result = simulate(inputs, whatIf);
  self.postMessage({ id, result });
};
