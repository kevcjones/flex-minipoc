import { createHandler } from "@flex/sdk/http";

export const handler = createHandler(() => ({ message: "goodbye from foo v1" }));
