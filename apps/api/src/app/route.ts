import * as SyncEngine from "@trading-sync/engine";
import {
  Config,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Redacted,
  Schema,
} from "effect";
import { type NextRequest, NextResponse, after } from "next/server";

class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  cause: Schema.String,
}) {}

const dependencies = Layer.mergeAll(SyncEngine.layer);
const runtime = ManagedRuntime.make(dependencies);

export async function GET(request: NextRequest) {
  const result = await runtime.runPromiseExit(authenticate(request));

  if (result._tag === "Failure") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  after(
    runtime.runPromise(sync()).then((result) => {
      console.log(JSON.stringify(result, null, 2));
    }, console.error)
  );

  return new NextResponse(undefined, { status: 200 });
}

const authenticate = Effect.fn("authenticate")(function* (
  request: NextRequest
) {
  const secret = yield* Config.redacted("CRON_SECRET").pipe(
    Effect.mapError(
      () =>
        new Unauthorized({
          cause: "Environment variable `CRON_SECRET` is missing",
        })
    )
  );

  const maybeBearerToken = Option.fromNullable(
    request.headers.get("authorization")
  );

  if (Option.isNone(maybeBearerToken)) {
    return yield* new Unauthorized({
      cause: "Authorization header missing",
    });
  }

  if (maybeBearerToken.value !== `Bearer ${Redacted.value(secret)}`) {
    return yield* new Unauthorized({
      cause: "Authorization header invalid",
    });
  }
});

const sync = Effect.fn(function* () {
  const syncEngine = yield* SyncEngine.SyncEngine;

  const accountId = yield* Config.string("YNAB_ACCOUNT_ID");
  const budgetId = yield* Config.string("YNAB_BUDGET_ID");

  yield* syncEngine.sync(accountId, budgetId);
});
