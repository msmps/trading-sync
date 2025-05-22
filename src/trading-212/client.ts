import { HttpClient, HttpClientRequest } from "@effect/platform";
import { NodeHttpClient } from "@effect/platform-node";
import {
  Config,
  Context,
  Data,
  Effect,
  Layer,
  type Option,
  Redacted,
} from "effect";
import { AccountBalance } from "./schemas";

class Trading212ClientError extends Data.TaggedError("Trading212ClientError")<{
  cause: unknown;
}> {}

type Trading212ClientConfig = Readonly<{
  apiKey: Redacted.Redacted<string>;
}>;

type ITrading212Client = Readonly<{
  getAccountBalance: () => Effect.Effect<
    Option.Option<AccountBalance>,
    Trading212ClientError
  >;
}>;

const defaultConfig = {
  apiKey: Config.redacted("TRADING212_API_KEY"),
};

export class Trading212 extends Context.Tag("Trading212")<
  Trading212,
  ITrading212Client
>() {}

const createService = (config: Config.Config.Wrap<Trading212ClientConfig>) =>
  Effect.gen(function* () {
    const cfg = yield* Config.unwrap(config);
    const httpClient = yield* HttpClient.HttpClient;

    const getAccountBalance = () =>
      Effect.gen(function* () {
        const request = HttpClientRequest.get(
          "https://live.trading212.com/api/v0/equity/account/cash",
        ).pipe(
          HttpClientRequest.setHeader(
            "Authorization",
            Redacted.value(cfg.apiKey),
          ),
        );

        return yield* httpClient
          .execute(request)
          .pipe(Effect.flatMap(AccountBalance.decodeResponse), Effect.option);

        // TODO: Handle network errors with retry
      });

    return {
      getAccountBalance,
    };
  });

export const layerWithoutDependencies = Layer.effect(
  Trading212,
  createService(defaultConfig),
);

export const layer = layerWithoutDependencies.pipe(
  Layer.provide(NodeHttpClient.layer),
);
