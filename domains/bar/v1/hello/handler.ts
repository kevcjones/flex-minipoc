import { createHandler } from "@flex/sdk/http";

export const handler = createHandler(() => ({ message: "hello from bar v1" }));
