const listener = (event: MessageEvent) => {
  console.log(event);
};

addEventListener("message", listener);
