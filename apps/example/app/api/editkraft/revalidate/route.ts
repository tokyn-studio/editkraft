import { createRevalidateHandler } from "@editkraft/react";

export const POST = createRevalidateHandler({
  secret: process.env.EDITKRAFT_REVALIDATE_SECRET,
});
