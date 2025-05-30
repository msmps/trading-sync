import { Data } from "effect";

export class Trading212AccountBalanceEmptyError extends Data.TaggedError(
  "Trading212AccountBalanceEmptyError",
) {}

export class YNABGetLastSyncedTransactionError extends Data.TaggedError(
  "YNABGetLastSyncedTransactionError",
)<{
  cause: unknown;
}> {}

export class YNABGetAccountInformationError extends Data.TaggedError(
  "YNABGetAccountInformationError",
)<{
  cause: unknown;
}> {}

export class YNABCreateTransactionError extends Data.TaggedError(
  "YNABCreateTransactionError",
)<{
  cause: unknown;
}> {}
