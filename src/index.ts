import { Config, Effect, Layer, LogLevel, Logger } from "effect";
import { sync } from "./engine";
import * as Trading212 from "./trading-212/client";
import * as Ynab from "./ynab/client";

const dependencies = Layer.mergeAll(
  Trading212.layer,
  Ynab.layer,
  Logger.pretty,
);

const program = Effect.gen(function* () {
  const accountId = yield* Config.string("YNAB_ACCOUNT_ID");
  const budgetId = yield* Config.string("YNAB_BUDGET_ID");

  yield* sync(accountId, budgetId);
});

Effect.runPromise(
  program.pipe(
    Effect.provide(dependencies),
    Logger.withMinimumLogLevel(LogLevel.Debug), // TODO: Remove this
  ),
);
