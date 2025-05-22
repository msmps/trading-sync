import { Array as Arr, Data, DateTime, Effect, Option, Schema } from "effect";
import * as Currency from "./currency";
import { Trading212 } from "./trading-212/client";
import { Ynab } from "./ynab/client";

class InvestmentAccountBalanceNotFound extends Data.TaggedError(
  "InvestmentAccountBalanceNotFound",
) {}

class CreateTransactionError extends Data.TaggedError(
  "CreateTransactionError",
)<{
  cause: unknown;
}> {}

const ValidTransaction = Schema.Struct({
  id: Schema.String,
  payee_name: Schema.Literal("Trading 212"),
});

const getLastSyncedTransaction = (accountId: string, budgetId: string) =>
  Effect.gen(function* () {
    const ynabClient = yield* Ynab;

    return yield* ynabClient.getTransactionsByAccount(budgetId, accountId).pipe(
      Effect.flatMap(({ transactions }) =>
        Effect.succeed(Arr.head(transactions)),
      ),
      Effect.andThen((maybeTransaction) => {
        if (Option.isNone(maybeTransaction)) {
          return Effect.succeed(Option.none());
        }

        return Schema.decodeUnknown(ValidTransaction)(
          maybeTransaction.value,
        ).pipe(
          Effect.map((transaction) => Option.some(transaction)),
          Effect.catchAll((parseError) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(
                "Failed to decode last synced YNAB transaction. Will proceed as if no valid last transaction was found.",
              ).pipe(
                Effect.annotateLogs({
                  reason:
                    "Schema validation failed for a transaction fetched from YNAB. This usually means it was not created by this sync tool.",
                  error: parseError,
                  problematicTransaction: JSON.stringify(
                    maybeTransaction.value,
                  ),
                }),
              );

              return Option.none();
            }),
          ),
        );

        // if (Option.isSome(maybeTransaction)) {
        //   return Schema.decodeUnknown(ValidTransaction)(
        //     maybeTransaction.value
        //   ).pipe(Effect.option);
        // }

        // return Effect.succeed(Option.none());
      }),
    );
  });

export function sync(accountId: string, budgetId: string) {
  return Effect.gen(function* () {
    const trading212Client = yield* Trading212;
    const ynabClient = yield* Ynab;

    const maybeInvestmentAccountBalance =
      yield* trading212Client.getAccountBalance();

    if (Option.isNone(maybeInvestmentAccountBalance)) {
      return yield* new InvestmentAccountBalanceNotFound();
    }

    const investmentAccountBalance = Currency.dollarsToMilliunits(
      maybeInvestmentAccountBalance.value.total,
    );

    const maybeLastSyncedTransaction = yield* getLastSyncedTransaction(
      accountId,
      budgetId,
    );

    const hasPreviousSync = Option.isSome(maybeLastSyncedTransaction); // TODO: Data will probably never be needed, refactor this to boolean
    const accountInformation =
      yield* ynabClient.getAccountInformationByAccountId(budgetId, accountId);
    const balanceChangeAmount =
      investmentAccountBalance - accountInformation.account.balance;
    const syncTime = yield* DateTime.now;

    /**
     * Debugging
     */
    yield* Effect.logDebug(
      `[1] YNAB Account Balance: ${accountInformation.account.balance / 1000}`,
    );
    yield* Effect.logDebug(
      `[2] Trading212 Account balance: ${investmentAccountBalance / 1000}`,
    );
    yield* Effect.logDebug(`[3] Change: ${balanceChangeAmount / 1000}`);

    yield* ynabClient
      .createTransaction(budgetId, {
        transaction: {
          account_id: accountId,
          amount: !hasPreviousSync
            ? investmentAccountBalance
            : balanceChangeAmount,
          date: syncTime.pipe(DateTime.formatIso),
          memo: `${
            !hasPreviousSync ? "Initial sync" : "Synced"
          } at ${syncTime.pipe(
            DateTime.format({ locale: "en-GB", timeStyle: "medium" }),
          )}`,
          payee_name: "Trading 212",
        },
      })
      .pipe(
        Effect.mapError(
          ({ cause }) =>
            new CreateTransactionError({
              cause,
            }),
        ),
      );
  });
}
