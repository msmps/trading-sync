import { Config, Context, Data, Effect, Layer, Redacted } from "effect";
import ynab, {
  type AccountResponseData,
  type SaveTransactionsResponseData,
  type TransactionsResponseData,
} from "ynab";

type YnabClient = ynab.api;

class YnabClientError extends Data.TaggedError("YnabClientError")<{
  cause: unknown;
}> {}

type YnabConfig = Readonly<{
  apiKey: Redacted.Redacted<string>;
}>;

type CreateTransactionParams = Parameters<
  YnabClient["transactions"]["createTransaction"]
>;

type GetTransactionsByAccountParams = Parameters<
  YnabClient["transactions"]["getTransactionsByAccount"]
>;

type GetAccountInformationByIdParams = Parameters<
  YnabClient["accounts"]["getAccountById"]
>;

type IYnab = Readonly<{
  createTransaction: (
    ...params: CreateTransactionParams
  ) => Effect.Effect<SaveTransactionsResponseData, YnabClientError>;
  getTransactionsByAccount: (
    ...params: GetTransactionsByAccountParams
  ) => Effect.Effect<TransactionsResponseData, YnabClientError>;
  getAccountInformationByAccountId: (
    ...params: GetAccountInformationByIdParams
  ) => Effect.Effect<AccountResponseData, YnabClientError>;
}>;

const defaultConfig = {
  apiKey: Config.redacted("YNAB_API_KEY"),
};

export class Ynab extends Context.Tag("Ynab")<Ynab, IYnab>() {}

const createService = (config: Config.Config.Wrap<YnabConfig>) =>
  Effect.gen(function* () {
    const cfg = yield* Config.unwrap(config);
    const client = new ynab.api(Redacted.value(cfg.apiKey));

    const useClient = <A>(
      fn: (client: YnabClient, signal: AbortSignal) => Promise<A>,
    ) => {
      return Effect.tryPromise({
        try(signal) {
          return fn(client, signal);
        },
        catch(cause) {
          return new YnabClientError({ cause });
        },
      });
    };

    const createTransaction = (...params: CreateTransactionParams) =>
      useClient((client) =>
        client.transactions
          .createTransaction(...params)
          .then((res) => res.data),
      );

    const getTransactionsByAccount = (
      ...params: GetTransactionsByAccountParams
    ) =>
      useClient((client) =>
        client.transactions
          .getTransactionsByAccount(...params)
          .then((res) => res.data),
      );

    const getAccountInformationByAccountId = (
      ...params: GetAccountInformationByIdParams
    ) =>
      useClient((client) =>
        client.accounts.getAccountById(...params).then((res) => res.data),
      );

    return {
      createTransaction,
      getTransactionsByAccount,
      getAccountInformationByAccountId,
    };
  });

export const layerWithoutDependencies = Layer.effect(
  Ynab,
  createService(defaultConfig),
);

export const layer = layerWithoutDependencies;
