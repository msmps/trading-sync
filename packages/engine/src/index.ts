import { Array as Arr, Context, DateTime, Effect, Layer, Option } from "effect";
import * as Currency from "./currency";
import {
  Trading212AccountBalanceEmptyError,
  YNABCreateTransactionError,
  YNABGetAccountInformationError,
  YNABGetLastSyncedTransactionError,
} from "./errors";
import * as Trading212 from "./trading-212/client";
import * as YNAB from "./ynab/client";

type SyncResult = undefined;

type SyncError =
  | Trading212AccountBalanceEmptyError
  | YNABGetLastSyncedTransactionError
  | YNABGetAccountInformationError
  | YNABCreateTransactionError;

type ISyncEngine = Readonly<{
  sync: (
    accountId: string,
    budgetId: string
  ) => Effect.Effect<SyncResult, SyncError>;
}>;

export class SyncEngine extends Context.Tag("SyncEngine")<
  SyncEngine,
  ISyncEngine
>() {}

const createService = () =>
  Effect.gen(function* () {
    const trading212 = yield* Trading212.Trading212;
    const ynab = yield* YNAB.Ynab;

    const getLastSyncedTransaction = (accountId: string, budgetId: string) =>
      Effect.gen(function* () {
        return yield* ynab.getTransactionsByAccount(budgetId, accountId).pipe(
          Effect.map(({ transactions }) =>
            Arr.findFirst(
              transactions,
              (transaction) => transaction.payee_name === "Trading 212"
            )
          ),
          Effect.mapError(
            (cause) => new YNABGetLastSyncedTransactionError({ cause })
          )
        );
      });

    const sync = (accountId: string, budgetId: string) => {
      return Effect.gen(function* () {
        const maybeInvestmentAccountBalance =
          yield* trading212.getAccountBalance();

        if (Option.isNone(maybeInvestmentAccountBalance)) {
          return yield* new Trading212AccountBalanceEmptyError();
        }

        const investmentAccountBalance = Currency.dollarsToMilliunits(
          maybeInvestmentAccountBalance.value.total
        );

        const maybeLastSyncedTransaction = yield* getLastSyncedTransaction(
          accountId,
          budgetId
        );

        const hasPreviousSync = Option.isSome(maybeLastSyncedTransaction); // TODO: Data will probably never be needed, refactor this to boolean
        const accountInformation = yield* ynab
          .getAccountInformationByAccountId(budgetId, accountId)
          .pipe(
            Effect.mapError(
              (cause) => new YNABGetAccountInformationError({ cause })
            )
          );
        const balanceChangeAmount =
          investmentAccountBalance - accountInformation.account.balance;
        const syncTime = yield* DateTime.now;

        yield* ynab
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
                DateTime.format({ locale: "en-GB", timeStyle: "medium" })
              )}`,
              payee_name: "Trading 212",
            },
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new YNABCreateTransactionError({
                  cause,
                })
            )
          );
      });
    };

    return {
      sync,
    };
  });

const layerWithoutDependencies = Layer.effect(SyncEngine, createService());

export const layer = layerWithoutDependencies.pipe(
  Layer.provide([Trading212.layer, YNAB.layer])
);
