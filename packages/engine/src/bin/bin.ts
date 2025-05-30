import { Config, Effect, Layer, LogLevel, Logger } from "effect";
import * as SyncEngine from "../";

const dependencies = Layer.mergeAll(SyncEngine.layer, Logger.pretty);

const program = Effect.gen(function* () {
  const syncEngine = yield* SyncEngine.SyncEngine;
  const accountId = yield* Config.string("YNAB_ACCOUNT_ID");
  const budgetId = yield* Config.string("YNAB_BUDGET_ID");

  yield* syncEngine.sync(accountId, budgetId);
});

Effect.runPromise(
  program.pipe(
    Effect.provide(dependencies),
    Logger.withMinimumLogLevel(LogLevel.Debug), // TODO: Remove this
  ),
);
