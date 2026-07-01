import type { InferClientInputs, InferClientOutputs } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ApiRouterClient } from "@repo/api/orpc/router";

import { orpcClient } from "./orpc-client";

export const orpc = createTanstackQueryUtils(orpcClient);

export type RouterOutputs = InferClientOutputs<ApiRouterClient>;
export type RouterInputs = InferClientInputs<ApiRouterClient>;
