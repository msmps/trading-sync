import { HttpClientResponse } from "@effect/platform";
import { Schema } from "effect";
import * as Currency from "../currency";

export class AccountBalance extends Schema.Class<AccountBalance>(
  "AccountBalance",
)({
  total: Currency.DollarsSchema,
}) {
  static decodeResponse = HttpClientResponse.schemaBodyJson(this);
}
