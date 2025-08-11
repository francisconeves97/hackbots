import { expect, it } from "bun:test";
import { getOnmessageListeners } from "./get-onmessage-listeners";

it("should get the onmessage listeners for a file", async () => {
  const result = await getOnmessageListeners.execute!(
    {
      filePath: "test/fixtures/onmessage-listeners.js",
    },
    {
      toolCallId: "1",
      messages: [],
    }
  );

  expect(result.success).toBe(true);
  expect(result.onmessageListeners).toEqual([""]);
});
