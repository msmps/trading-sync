import {
  Array as Arr,
  Data,
  DateTime,
  Effect,
  Hash,
  Option,
  Schema,
} from "effect";
import * as Currency from "./currency";
import { Trading212 } from "./trading-212/client";
import { Ynab } from "./ynab/client";

class AccountBalanceNotFound extends Data.TaggedError(
  "AccountBalanceNotFound",
) {}

class CreateTransactionError extends Data.TaggedError(
  "CreateTransactionError",
)<{
  cause: unknown;
}> {}

const ValidTransaction = Schema.Struct({
  id: Schema.String,
  memo: Schema.String.pipe(Schema.startsWith("tsid:")),
  amount: Currency.MilliunitsSchema,
});

const getLastSyncedTransaction = (accountId: string, budgetId: string) =>
  Effect.gen(function* () {
    const ynabClient = yield* Ynab;

    return yield* ynabClient.getTransactionsByAccount(budgetId, accountId).pipe(
      Effect.flatMap(({ transactions }) =>
        Effect.succeed(Arr.last(transactions)),
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

    const maybeAccountBalance = yield* trading212Client.getAccountBalance();
    if (Option.isNone(maybeAccountBalance)) {
      return yield* new AccountBalanceNotFound();
    }

    const accountBalance = maybeAccountBalance.value;

    const maybeLastSyncedTransaction = yield* getLastSyncedTransaction(
      accountId,
      budgetId,
    );

    const latestSyncedTransactionAmount = Option.isSome(
      maybeLastSyncedTransaction,
    )
      ? maybeLastSyncedTransaction.value.amount
      : Currency.dollarsToMilliunits(accountBalance.total);

    /**
     * Debugging
     */
    yield* Effect.logDebug(
      `[1] Last synced transaction amount: ${
        latestSyncedTransactionAmount / 1000
      }`,
    );
    yield* Effect.logDebug(
      `[2] Account balance: ${
        Currency.dollarsToMilliunits(accountBalance.total) / 1000
      }`,
    );
    yield* Effect.logDebug(
      `[3] Change: ${
        (latestSyncedTransactionAmount -
          Currency.dollarsToMilliunits(accountBalance.total)) /
        1000
      }`,
    );

    const syncTime = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));

    yield* ynabClient
      .createTransaction(budgetId, {
        transaction: {
          account_id: accountId,
          amount: Currency.dollarsToMilliunits(accountBalance.total),
          date: syncTime,
          memo: `tsid:${Hash.number(
            Hash.string("tsid") + accountBalance.total,
          ).toString(16)}`,
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
