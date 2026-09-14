import "server-only";
import { z } from "zod";
import { maintainBilling } from "@/features/billing/maintenance";
import { redis } from "./redis";

const stateSchema = z.object({
  reconciliation: z.string().optional(),
  dunning: z.string().optional(),
  reconciliationDone: z.boolean().default(false),
  dunningDone: z.boolean().default(false),
  nextRun: z.number().default(0),
});
const lockKey = "missao-saber:jobs:billing:lock";
const stateKey = "missao-saber:jobs:billing:state";
const releaseLock =
  "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end";

/** One page per tick: progress survives deploys and slow providers cannot starve
 * later subscriptions. Subject locks still protect each billing operation. */
export async function runMaintenance() {
  if (!redis) throw new Error("Maintenance requires Redis");
  const token = crypto.randomUUID();
  if (!(await redis.set(lockKey, token, "EX", 1800, "NX"))) return { status: "busy" };
  try {
    const saved = await redis.get(stateKey);
    const state = stateSchema.parse(saved ? JSON.parse(saved) : {});
    if (state.nextRun > Date.now()) return { status: "scheduled" };
    const result = await maintainBilling({
      reconciliation: state.reconciliation,
      dunning: state.dunning,
      reconciliationDone: state.reconciliationDone,
      dunningDone: state.dunningDone,
      batchSize: 10,
    });
    state.reconciliation = result.reconciliation.nextCursor;
    state.dunning = result.dunning.nextCursor;
    state.reconciliationDone ||= !result.reconciliation.nextCursor;
    state.dunningDone ||= !result.dunning.nextCursor;
    if (state.reconciliationDone && state.dunningDone) {
      state.reconciliationDone = false;
      state.dunningDone = false;
      state.nextRun = Date.now() + 6 * 3_600_000;
    }
    const committed = await redis.eval(
      "if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[2],ARGV[2]); return 1 else return 0 end",
      2,
      lockKey,
      stateKey,
      token,
      JSON.stringify(state),
    );
    if (committed !== 1) throw new Error("Maintenance lease expired before checkpoint");
    return { status: "processed", ...result };
  } finally {
    await redis.eval(releaseLock, 1, lockKey, token);
  }
}
