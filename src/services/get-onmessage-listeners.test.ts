import { expect, it } from "bun:test";
import { getOnMessageListeners } from "./get-onmessage-listeners";

it("should get the onmessage listeners for a file that doesnt exist", async () => {
  const result = await getOnMessageListeners(
    "test/fixtures/onmessage-listeners.js"
  );

  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toEqual([]);
  }
});

// it("should get the onmessage listeners for a file that exists", async () => {
//   const result = await getOnMessageListeners(
//     "/Users/francisconeves/jxscout/mercadolibre/original/www.mercadolivre.com.br/minha-pagina/editor/(index).html"
//   );

//   expect(result.success).toBe(true);
//   if (result.success) {
//     expect(result.data.length).toBeGreaterThan(0);
//   }
// });
